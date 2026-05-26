// Integration test 辅助: 起 pg 容器, 应用 auth + project 两份迁移,
// 装配 chi router + handler, 提供签发测试 JWT 的工具.

package integration

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/manju-org/manju/services/project-service/internal/handler"
	projmw "github.com/manju-org/manju/services/project-service/internal/middleware"
	"github.com/manju-org/manju/services/project-service/internal/repo"
	"github.com/manju-org/manju/services/project-service/internal/service"
	"github.com/manju-org/manju/services/project-service/internal/token"
)

const testIssuer = "manju-auth-test"

type teamFixture struct {
	TeamID      uuid.UUID
	OwnerID     uuid.UUID
	ViewerID    uuid.UUID
	OwnerToken  string
	ViewerToken string
}

type harness struct {
	srv       *httptest.Server
	adminPool *pgxpool.Pool // superuser, 用于 seed / reset
	appPool   *pgxpool.Pool // manju_app role, repo 用, RLS 生效
	signer    *rsa.PrivateKey
	verifier  *token.Verifier
	TeamA     teamFixture
	TeamB     teamFixture
	cleanups  []func()
}

func (h *harness) URL(p string) string { return h.srv.URL + p }

func (h *harness) Reset(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	// 用 admin pool: manju_app 不是 owner, 无 TRUNCATE 权限. DELETE 也可, 但 TRUNCATE 更快.
	_, err := h.adminPool.Exec(ctx, `TRUNCATE projects, project_collaborators RESTART IDENTITY CASCADE`)
	require.NoError(t, err)
}

// 单例 harness: testcontainers 启动 5s+, 跨包内全部测试复用.
var (
	bootOnce sync.Once
	bootH    *harness
	bootErr  error
)

func getH(t *testing.T) *harness {
	t.Helper()
	bootOnce.Do(func() {
		defer func() {
			if r := recover(); r != nil {
				bootErr = fmt.Errorf("setup panic: %v", r)
			}
		}()
		bootH = setupHarness(t)
	})
	require.NoError(t, bootErr)
	require.NotNil(t, bootH, "harness boot failed")
	bootH.Reset(t)
	return bootH
}

func setupHarness(t *testing.T) *harness {
	t.Helper()
	ctx := context.Background()

	pgC, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("manju_test"),
		tcpostgres.WithUsername("manju"),
		tcpostgres.WithPassword("manju"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(60*time.Second)),
	)
	require.NoError(t, err)

	pgDSN, err := pgC.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)

	pool, err := pgxpool.New(ctx, pgDSN)
	require.NoError(t, err)

	require.NoError(t, applyMigrations(ctx, pool))

	// 创建非 superuser、非 owner 的应用账号. 非 owner 自动受 RLS 约束 (FORCE 不影响这一规则).
	// 生产中 service 账号本来就是这种形态, 这里只是把测试环境对齐 prod 行为.
	if _, err := pool.Exec(ctx, `CREATE ROLE manju_app WITH LOGIN PASSWORD 'app'`); err != nil {
		require.NoError(t, err)
	}
	for _, stmt := range []string{
		`GRANT USAGE ON SCHEMA public TO manju_app`,
		`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO manju_app`,
		`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO manju_app`,
		`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO manju_app`,
	} {
		_, err := pool.Exec(ctx, stmt)
		require.NoError(t, err)
	}

	// 第二个 pool: 用 manju_app 连接, RLS 真正生效.
	appDSN := strings.Replace(pgDSN, "manju:manju@", "manju_app:app@", 1)
	appPool, err := pgxpool.New(ctx, appDSN)
	require.NoError(t, err)
	require.NoError(t, appPool.Ping(ctx))

	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	verifier := token.NewVerifier(&priv.PublicKey, testIssuer)

	repoP := repo.New(appPool)
	svc := &service.Projects{Repo: repoP}
	h := &handler.Projects{Svc: svc}

	teamA := seedTeam(ctx, t, pool, "A", priv)
	teamB := seedTeam(ctx, t, pool, "B", priv)

	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(projmw.RequestContext(zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})))
	r.Route("/v1", func(r chi.Router) {
		r.Use(projmw.RequireAuth(verifier))
		r.Get("/projects", h.List)
		r.With(projmw.RequireWriteRole).Post("/projects", h.Create)
		r.Get("/projects/{id}", h.Get)
		r.With(projmw.RequireWriteRole).Patch("/projects/{id}", h.Patch)
		r.With(projmw.RequireWriteRole).Post("/projects/{id}/duplicate", h.Duplicate)
		r.With(projmw.RequireWriteRole).Delete("/projects/{id}", h.SoftDelete)
		r.With(projmw.RequireWriteRole).Post("/projects/{id}/restore", h.Restore)
		r.With(projmw.RequireWriteRole).Delete("/projects/{id}/purge", h.Purge)

		r.Get("/drafts", h.ListDrafts)
		r.With(projmw.RequireWriteRole).Delete("/drafts/{id}", h.DeleteDraft)
		r.With(projmw.RequireWriteRole).Post("/drafts", h.ClearAllDrafts)

		r.Get("/shared", h.ListShared)
		r.Post("/shared/{id}/leave", h.LeaveShared)

		r.Get("/trash", h.ListTrash)
		r.With(projmw.RequireWriteRole).Post("/trash/{id}/restore", h.RestoreFromTrash)
		r.With(projmw.RequireWriteRole).Delete("/trash/{id}", h.DeleteFromTrash)
		r.With(projmw.RequireWriteRole).Post("/trash/empty", h.EmptyTrash)
	})

	srv := httptest.NewServer(r)
	cleanups := []func(){
		srv.Close,
		func() { appPool.Close() },
		func() { pool.Close() },
		func() { _ = pgC.Terminate(context.Background()) },
	}
	return &harness{
		srv: srv, adminPool: pool, appPool: appPool, signer: priv, verifier: verifier,
		TeamA: teamA, TeamB: teamB, cleanups: cleanups,
	}
}

// 加载 auth-service migrations + project-service migrations (顺序很重要).
func applyMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	authDir := findAuthMigrationsDir()
	projDir := findProjectMigrationsDir()
	for _, dir := range []string{authDir, projDir} {
		files, err := listSQL(dir)
		if err != nil {
			return err
		}
		for _, f := range files {
			raw, err := os.ReadFile(filepath.Join(dir, f))
			if err != nil {
				return err
			}
			if _, err := pool.Exec(ctx, string(raw)); err != nil {
				return err
			}
		}
	}
	return nil
}

func findProjectMigrationsDir() string {
	_, this, _, _ := runtime.Caller(0)
	// tests/integration/helpers.go → tests/integration → tests → project-service → migrations
	return filepath.Join(filepath.Dir(this), "..", "..", "migrations")
}

func findAuthMigrationsDir() string {
	_, this, _, _ := runtime.Caller(0)
	// tests/integration/helpers.go → project-service → services → auth-service/migrations
	return filepath.Join(filepath.Dir(this), "..", "..", "..", "auth-service", "migrations")
}

func listSQL(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var out []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			out = append(out, e.Name())
		}
	}
	return out, nil
}

// seedTeam 用超级用户身份 (无 RLS 上下文) INSERT 测试数据.
// RLS 策略只定义了 USING (用于 SELECT/UPDATE/DELETE), 没有 WITH CHECK, 所以 INSERT 不被 RLS 限制.
func seedTeam(ctx context.Context, t *testing.T, pool *pgxpool.Pool, label string, signer *rsa.PrivateKey) teamFixture {
	t.Helper()
	teamID := uuid.New()
	ownerID := uuid.New()
	viewerID := uuid.New()

	_, err := pool.Exec(ctx,
		`INSERT INTO teams (id, name) VALUES ($1, $2)`, teamID, "Team "+label)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`INSERT INTO users (id, email, name) VALUES ($1, $2, $3)`,
		ownerID, "owner-"+strings.ToLower(label)+"-"+ownerID.String()[:6]+"@example.com", "Owner "+label)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`INSERT INTO users (id, email, name) VALUES ($1, $2, $3)`,
		viewerID, "viewer-"+strings.ToLower(label)+"-"+viewerID.String()[:6]+"@example.com", "Viewer "+label)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`, teamID, ownerID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'viewer')`, teamID, viewerID)
	require.NoError(t, err)

	return teamFixture{
		TeamID:      teamID,
		OwnerID:     ownerID,
		ViewerID:    viewerID,
		OwnerToken:  signAccess(t, signer, ownerID, teamID, "owner"),
		ViewerToken: signAccess(t, signer, viewerID, teamID, "viewer"),
	}
}

func signAccess(t *testing.T, priv *rsa.PrivateKey, userID, teamID uuid.UUID, role string) string {
	t.Helper()
	now := time.Now()
	claims := &token.Claims{
		TeamID: teamID.String(),
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    testIssuer,
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
			ID:        uuid.NewString(),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signed, err := tok.SignedString(priv)
	require.NoError(t, err)
	return signed
}
