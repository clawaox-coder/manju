// Package service 串接 db/redis/token, 实现 register/login/refresh/logout/me 的业务逻辑.

package service

import (
	"context"
	"errors"
	"net/netip"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/manju-org/manju/services/auth-service/internal/apperr"
	"github.com/manju-org/manju/services/auth-service/internal/password"
	"github.com/manju-org/manju/services/auth-service/internal/redisx"
	"github.com/manju-org/manju/services/auth-service/internal/repo/db"
	"github.com/manju-org/manju/services/auth-service/internal/token"
)

type Auth struct {
	Pool       *pgxpool.Pool
	Redis      *redisx.Client
	Signer     *token.Signer
	BcryptCost int
	AccessTTL  time.Duration
	RefreshTTL time.Duration

	LoginFailLimit int   // 5
	LoginFailWindow time.Duration // 5m
	LoginLockTTL    time.Duration // 15m
}

type Identity struct {
	User   db.User
	Team   db.Team
	Role   db.TeamRole
}

type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int // seconds for access token
}

type ClientInfo struct {
	IP        *netip.Addr
	UserAgent string
	DeviceID  string
}

const (
	revokedReasonLogout    = "logout"
	revokedReasonRotated   = "rotated"
	revokedReasonForced    = "forced"
	revokedReasonPwChange  = "password_change"
	rotationGracePeriod    = 30 * time.Second
)

// ---- register ----

func (a *Auth) Register(ctx context.Context, email, pwd, name string, info ClientInfo) (Identity, TokenPair, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	name = strings.TrimSpace(name)

	if err := validateEmail(email); err != nil {
		return Identity{}, TokenPair{}, err
	}
	if err := validatePassword(pwd); err != nil {
		return Identity{}, TokenPair{}, err
	}
	if name == "" {
		return Identity{}, TokenPair{}, apperr.InvalidInput("name 不能为空")
	}

	hashed, err := password.Hash(pwd, a.BcryptCost)
	if err != nil {
		return Identity{}, TokenPair{}, apperr.Internal("hash 密码失败").WithCause(err)
	}

	var ident Identity
	err = a.withTx(ctx, func(q *db.Queries) error {
		hashedPtr := &hashed
		u, err := q.CreateUser(ctx, db.CreateUserParams{Email: email, PasswordHash: hashedPtr, Name: name})
		if err != nil {
			if isUniqueViolation(err) {
				return apperr.EmailAlreadyExists()
			}
			return apperr.Internal("create user").WithCause(err)
		}
		t, err := q.CreateTeam(ctx, name+"'s Team")
		if err != nil {
			return apperr.Internal("create team").WithCause(err)
		}
		if _, err := q.CreateTeamMember(ctx, db.CreateTeamMemberParams{
			TeamID: t.ID, UserID: u.ID, Role: db.TeamRoleOwner,
		}); err != nil {
			return apperr.Internal("create team_member").WithCause(err)
		}
		ident = Identity{User: u, Team: t, Role: db.TeamRoleOwner}
		return nil
	})
	if err != nil {
		return Identity{}, TokenPair{}, err
	}

	pair, err := a.issueTokenPair(ctx, ident, info, nil)
	if err != nil {
		return Identity{}, TokenPair{}, err
	}
	return ident, pair, nil
}

// ---- login ----

func (a *Auth) Login(ctx context.Context, email, pwd string, info ClientInfo) (Identity, TokenPair, error) {
	email = strings.TrimSpace(strings.ToLower(email))

	ipKey := ""
	if info.IP != nil {
		ipKey = info.IP.String()
	}
	emailKey := email

	if locked, err := a.checkLoginLock(ctx, ipKey, emailKey); err != nil {
		return Identity{}, TokenPair{}, err
	} else if locked {
		return Identity{}, TokenPair{}, apperr.RateLimited("登录失败次数过多, 请 15 分钟后再试")
	}

	q := db.New(a.Pool)
	user, err := q.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			_ = a.recordLoginFail(ctx, ipKey, emailKey)
			return Identity{}, TokenPair{}, apperr.InvalidCredentials()
		}
		return Identity{}, TokenPair{}, apperr.Internal("get user").WithCause(err)
	}
	if user.PasswordHash == nil {
		return Identity{}, TokenPair{}, apperr.InvalidCredentials()
	}
	if err := password.Verify(*user.PasswordHash, pwd); err != nil {
		_ = a.recordLoginFail(ctx, ipKey, emailKey)
		return Identity{}, TokenPair{}, apperr.InvalidCredentials()
	}

	membership, err := q.GetPrimaryTeamMembershipByUser(ctx, user.ID)
	if err != nil {
		return Identity{}, TokenPair{}, apperr.Internal("get membership").WithCause(err)
	}
	team, err := q.GetTeamByID(ctx, membership.TeamID)
	if err != nil {
		return Identity{}, TokenPair{}, apperr.Internal("get team").WithCause(err)
	}

	_ = q.TouchUserLogin(ctx, user.ID)
	a.clearLoginFail(ctx, ipKey, emailKey)

	ident := Identity{User: user, Team: team, Role: membership.Role}
	pair, err := a.issueTokenPair(ctx, ident, info, nil)
	if err != nil {
		return Identity{}, TokenPair{}, err
	}
	return ident, pair, nil
}

// ---- refresh ----

func (a *Auth) Refresh(ctx context.Context, refreshToken string, info ClientInfo) (Identity, TokenPair, error) {
	if refreshToken == "" {
		return Identity{}, TokenPair{}, apperr.InvalidInput("refresh_token 必填")
	}
	hash := token.HashRefresh(refreshToken)

	q := db.New(a.Pool)
	rt, err := q.GetActiveRefreshTokenByHash(ctx, hash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Identity{}, TokenPair{}, apperr.InvalidToken("refresh_token 无效或已失效")
		}
		return Identity{}, TokenPair{}, apperr.Internal("get refresh token").WithCause(err)
	}

	user, err := q.GetUserByID(ctx, rt.UserID)
	if err != nil {
		return Identity{}, TokenPair{}, apperr.InvalidToken("用户已不存在")
	}
	team, err := q.GetTeamByID(ctx, rt.TeamID)
	if err != nil {
		return Identity{}, TokenPair{}, apperr.Internal("get team").WithCause(err)
	}
	membership, err := q.GetPrimaryTeamMembershipByUser(ctx, user.ID)
	if err != nil {
		return Identity{}, TokenPair{}, apperr.Internal("get membership").WithCause(err)
	}

	ident := Identity{User: user, Team: team, Role: membership.Role}
	pair, err := a.issueTokenPair(ctx, ident, info, &rt.ID)
	if err != nil {
		return Identity{}, TokenPair{}, err
	}

	// 老 token 标记 rotated, redis 中缩短到 grace 期.
	if err := q.RevokeRefreshToken(ctx, db.RevokeRefreshTokenParams{
		ID: rt.ID, Reason: revokedReasonRotated,
	}); err != nil {
		return Identity{}, TokenPair{}, apperr.Internal("revoke old refresh").WithCause(err)
	}
	_ = a.Redis.PinRefreshGrace(ctx, hash, rotationGracePeriod)

	return ident, pair, nil
}

// ---- logout ----

func (a *Auth) Logout(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return apperr.InvalidInput("refresh_token 必填")
	}
	hash := token.HashRefresh(refreshToken)
	q := db.New(a.Pool)
	rt, err := q.GetActiveRefreshTokenByHash(ctx, hash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // idempotent
		}
		return apperr.Internal("get refresh").WithCause(err)
	}
	if err := q.RevokeRefreshToken(ctx, db.RevokeRefreshTokenParams{
		ID: rt.ID, Reason: revokedReasonLogout,
	}); err != nil {
		return apperr.Internal("revoke").WithCause(err)
	}
	_ = a.Redis.DropRefresh(ctx, hash)
	return nil
}

// ---- me ----

func (a *Auth) Me(ctx context.Context, userID uuid.UUID) (Identity, error) {
	q := db.New(a.Pool)
	user, err := q.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Identity{}, apperr.UserNotFound()
		}
		return Identity{}, apperr.Internal("get user").WithCause(err)
	}
	m, err := q.GetPrimaryTeamMembershipByUser(ctx, userID)
	if err != nil {
		return Identity{}, apperr.Internal("get membership").WithCause(err)
	}
	team, err := q.GetTeamByID(ctx, m.TeamID)
	if err != nil {
		return Identity{}, apperr.Internal("get team").WithCause(err)
	}
	return Identity{User: user, Team: team, Role: m.Role}, nil
}

// ---- helpers ----

func (a *Auth) issueTokenPair(ctx context.Context, ident Identity, info ClientInfo, parentID *uuid.UUID) (TokenPair, error) {
	accessTok, exp, err := a.Signer.NewAccessToken(ident.User.ID, ident.Team.ID, string(ident.Role))
	if err != nil {
		return TokenPair{}, apperr.Internal("sign access token").WithCause(err)
	}
	refTok, hash, err := token.NewRefreshOpaque()
	if err != nil {
		return TokenPair{}, apperr.Internal("gen refresh").WithCause(err)
	}
	q := db.New(a.Pool)
	var uaPtr *string
	if info.UserAgent != "" {
		ua := info.UserAgent
		uaPtr = &ua
	}
	var devicePtr *string
	if info.DeviceID != "" {
		d := info.DeviceID
		devicePtr = &d
	}
	expiresAt := time.Now().Add(a.RefreshTTL)
	if _, err := q.CreateRefreshToken(ctx, db.CreateRefreshTokenParams{
		UserID:    ident.User.ID,
		TeamID:    ident.Team.ID,
		TokenHash: hash,
		ParentID:  parentID,
		UserAgent: uaPtr,
		IP:        info.IP,
		DeviceID:  devicePtr,
		ExpiresAt: expiresAt,
	}); err != nil {
		return TokenPair{}, apperr.Internal("persist refresh").WithCause(err)
	}
	if err := a.Redis.CacheRefresh(ctx, hash, ident.User.ID.String(), a.RefreshTTL); err != nil {
		return TokenPair{}, apperr.Internal("cache refresh").WithCause(err)
	}
	return TokenPair{
		AccessToken:  accessTok,
		RefreshToken: refTok,
		ExpiresIn:    int(time.Until(exp).Seconds()),
	}, nil
}

func (a *Auth) withTx(ctx context.Context, fn func(*db.Queries) error) error {
	tx, err := a.Pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return apperr.Internal("begin tx").WithCause(err)
	}
	defer tx.Rollback(ctx)
	q := db.New(tx)
	if err := fn(q); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return apperr.Internal("commit").WithCause(err)
	}
	return nil
}

func (a *Auth) checkLoginLock(ctx context.Context, ip, email string) (bool, error) {
	for _, key := range loginFailKeys(ip, email) {
		cnt, err := a.Redis.GetInt(ctx, key)
		if err != nil {
			return false, apperr.Internal("rate check").WithCause(err)
		}
		if cnt >= int64(a.LoginFailLimit) {
			return true, nil
		}
	}
	return false, nil
}

func (a *Auth) recordLoginFail(ctx context.Context, ip, email string) error {
	for _, key := range loginFailKeys(ip, email) {
		if _, err := a.Redis.Incr(ctx, key, a.LoginFailWindow); err != nil {
			return err
		}
	}
	return nil
}

func (a *Auth) clearLoginFail(ctx context.Context, ip, email string) {
	keys := loginFailKeys(ip, email)
	_ = a.Redis.Del(ctx, keys...)
}

func loginFailKeys(ip, email string) []string {
	var out []string
	if ip != "" {
		out = append(out, "rate:login_fail:ip:"+ip)
	}
	if email != "" {
		out = append(out, "rate:login_fail:email:"+email)
	}
	return out
}

// ---- input validation ----

func validateEmail(s string) error {
	if s == "" || !strings.Contains(s, "@") || len(s) > 254 {
		return apperr.InvalidInput("email 格式错误")
	}
	return nil
}

func validatePassword(s string) error {
	if len(s) < 10 || len(s) > 200 {
		return apperr.InvalidInput("password 长度需在 10-200 字符之间")
	}
	return nil
}

// isUniqueViolation 识别 pg 唯一索引冲突.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
