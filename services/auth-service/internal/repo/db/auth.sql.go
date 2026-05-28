// Hand-written sqlc-compatible queries for auth.sql.
// Style matches sqlc pgx/v5 output. Regenerate with `make sqlc`.

package db

import (
	"context"
	"net/netip"
	"time"

	"github.com/google/uuid"
)

// ---- user ----

const createUser = `INSERT INTO users (email, password_hash, name)
VALUES ($1, $2, $3)
RETURNING id, email, phone, password_hash, name, avatar_url, bio, status,
          two_factor_secret, last_login_at, email_verified_at, phone_verified_at,
          created_at, updated_at, deleted_at`

type CreateUserParams struct {
	Email        string
	PasswordHash *string
	Name         string
}

func (q *Queries) CreateUser(ctx context.Context, p CreateUserParams) (User, error) {
	row := q.db.QueryRow(ctx, createUser, p.Email, p.PasswordHash, p.Name)
	return scanUser(row)
}

const getUserByEmail = `SELECT id, email, phone, password_hash, name, avatar_url, bio, status,
       two_factor_secret, last_login_at, email_verified_at, phone_verified_at,
       created_at, updated_at, deleted_at
FROM users WHERE email = $1 AND deleted_at IS NULL`

func (q *Queries) GetUserByEmail(ctx context.Context, email string) (User, error) {
	return scanUser(q.db.QueryRow(ctx, getUserByEmail, email))
}

const getUserByID = `SELECT id, email, phone, password_hash, name, avatar_url, bio, status,
       two_factor_secret, last_login_at, email_verified_at, phone_verified_at,
       created_at, updated_at, deleted_at
FROM users WHERE id = $1 AND deleted_at IS NULL`

func (q *Queries) GetUserByID(ctx context.Context, id uuid.UUID) (User, error) {
	return scanUser(q.db.QueryRow(ctx, getUserByID, id))
}

const touchUserLogin = `UPDATE users SET last_login_at = now() WHERE id = $1`

func (q *Queries) TouchUserLogin(ctx context.Context, id uuid.UUID) error {
	_, err := q.db.Exec(ctx, touchUserLogin, id)
	return err
}

const updateUserProfile = `UPDATE users SET
  name       = COALESCE($2, name),
  phone      = COALESCE($3, phone),
  bio        = COALESCE($4, bio),
  avatar_url = COALESCE($5, avatar_url)
WHERE id = $1 AND deleted_at IS NULL
RETURNING id, email, phone, password_hash, name, avatar_url, bio, status,
          two_factor_secret, last_login_at, email_verified_at, phone_verified_at,
          created_at, updated_at, deleted_at`

type UpdateUserProfileParams struct {
	ID        uuid.UUID
	Name      *string
	Phone     *string
	Bio       *string
	AvatarURL *string
}

func (q *Queries) UpdateUserProfile(ctx context.Context, p UpdateUserProfileParams) (User, error) {
	row := q.db.QueryRow(ctx, updateUserProfile, p.ID, p.Name, p.Phone, p.Bio, p.AvatarURL)
	return scanUser(row)
}

// ---- team ----

const createTeam = `INSERT INTO teams (name, plan, seat_total)
VALUES ($1, 'free', 1)
RETURNING id, name, slug, plan, seat_total, renew_date, auto_renew, metadata, created_at, updated_at`

func (q *Queries) CreateTeam(ctx context.Context, name string) (Team, error) {
	row := q.db.QueryRow(ctx, createTeam, name)
	return scanTeam(row)
}

const getTeamByID = `SELECT id, name, slug, plan, seat_total, renew_date, auto_renew, metadata, created_at, updated_at
FROM teams WHERE id = $1`

func (q *Queries) GetTeamByID(ctx context.Context, id uuid.UUID) (Team, error) {
	return scanTeam(q.db.QueryRow(ctx, getTeamByID, id))
}

const createTeamMember = `INSERT INTO team_members (team_id, user_id, role)
VALUES ($1, $2, $3)
RETURNING id, team_id, user_id, role, joined_at, invited_by`

type CreateTeamMemberParams struct {
	TeamID uuid.UUID
	UserID uuid.UUID
	Role   TeamRole
}

func (q *Queries) CreateTeamMember(ctx context.Context, p CreateTeamMemberParams) (TeamMember, error) {
	row := q.db.QueryRow(ctx, createTeamMember, p.TeamID, p.UserID, p.Role)
	var m TeamMember
	if err := row.Scan(&m.ID, &m.TeamID, &m.UserID, &m.Role, &m.JoinedAt, &m.InvitedBy); err != nil {
		return TeamMember{}, err
	}
	return m, nil
}

const getPrimaryTeamMembershipByUser = `SELECT id, team_id, user_id, role, joined_at, invited_by
FROM team_members WHERE user_id = $1
ORDER BY joined_at ASC
LIMIT 1`

func (q *Queries) GetPrimaryTeamMembershipByUser(ctx context.Context, userID uuid.UUID) (TeamMember, error) {
	row := q.db.QueryRow(ctx, getPrimaryTeamMembershipByUser, userID)
	var m TeamMember
	if err := row.Scan(&m.ID, &m.TeamID, &m.UserID, &m.Role, &m.JoinedAt, &m.InvitedBy); err != nil {
		return TeamMember{}, err
	}
	return m, nil
}

// ---- refresh_tokens ----

const createRefreshToken = `INSERT INTO refresh_tokens
  (user_id, team_id, token_hash, parent_id, user_agent, ip, device_id, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, user_id, team_id, token_hash, parent_id, user_agent, ip, device_id,
          expires_at, revoked_at, revoked_reason, created_at`

type CreateRefreshTokenParams struct {
	UserID    uuid.UUID
	TeamID    uuid.UUID
	TokenHash string
	ParentID  *uuid.UUID
	UserAgent *string
	IP        *netip.Addr
	DeviceID  *string
	ExpiresAt time.Time
}

func (q *Queries) CreateRefreshToken(ctx context.Context, p CreateRefreshTokenParams) (RefreshToken, error) {
	row := q.db.QueryRow(ctx, createRefreshToken,
		p.UserID, p.TeamID, p.TokenHash, p.ParentID, p.UserAgent, p.IP, p.DeviceID, p.ExpiresAt)
	return scanRefreshToken(row)
}

const getActiveRefreshTokenByHash = `SELECT id, user_id, team_id, token_hash, parent_id, user_agent, ip, device_id,
       expires_at, revoked_at, revoked_reason, created_at
FROM refresh_tokens
WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`

func (q *Queries) GetActiveRefreshTokenByHash(ctx context.Context, hash string) (RefreshToken, error) {
	return scanRefreshToken(q.db.QueryRow(ctx, getActiveRefreshTokenByHash, hash))
}

const revokeRefreshToken = `UPDATE refresh_tokens
SET revoked_at = now(), revoked_reason = $2
WHERE id = $1 AND revoked_at IS NULL`

type RevokeRefreshTokenParams struct {
	ID     uuid.UUID
	Reason string
}

func (q *Queries) RevokeRefreshToken(ctx context.Context, p RevokeRefreshTokenParams) error {
	_, err := q.db.Exec(ctx, revokeRefreshToken, p.ID, p.Reason)
	return err
}

const revokeAllRefreshTokensForUser = `UPDATE refresh_tokens
SET revoked_at = now(), revoked_reason = $2
WHERE user_id = $1 AND revoked_at IS NULL`

type RevokeAllRefreshTokensForUserParams struct {
	UserID uuid.UUID
	Reason string
}

func (q *Queries) RevokeAllRefreshTokensForUser(ctx context.Context, p RevokeAllRefreshTokensForUserParams) error {
	_, err := q.db.Exec(ctx, revokeAllRefreshTokensForUser, p.UserID, p.Reason)
	return err
}

// ---- team members ----

const listTeamMembers = `SELECT u.id, u.email, u.name, u.avatar_url, u.status, tm.role, tm.created_at
FROM team_members tm
JOIN users u ON u.id = tm.user_id
WHERE tm.team_id = $1 AND u.status = 'active'
ORDER BY tm.created_at ASC`

type TeamMemberRow struct {
	ID        uuid.UUID
	Email     string
	Name      string
	AvatarURL *string
	Status    UserStatus
	Role      TeamRole
	JoinedAt  time.Time
}

func (q *Queries) ListTeamMembers(ctx context.Context, teamID uuid.UUID) ([]TeamMemberRow, error) {
	rows, err := q.db.Query(ctx, listTeamMembers, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var members []TeamMemberRow
	for rows.Next() {
		var m TeamMemberRow
		if err := rows.Scan(&m.ID, &m.Email, &m.Name, &m.AvatarURL, &m.Status, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}
