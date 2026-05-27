// Integration test 辅助: 起 pg + minio 容器, 应用 auth + project + render 三份迁移,
// 装配 chi router + handler, 提供签发测试 JWT 的工具.
//
// 关键点 (与 asset-service helpers 同套):
//   - testcontainers postgres 默认 user = SUPERUSER, 绕过 RLS
//   - 必须再建一个 manju_app 非 owner role + 用它连第二个 pool 让 RLS 真正生效
//   - admin pool 仅用于 seed/reset, 业务 repo 用 app pool
//   - kafka 不起 (用 NoopEnqueuer), 只测 HTTP + DB + RLS

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

	"github.com/manju-org/manju/services/render-service/internal/handler"
	rmw "github.com/manju-org/manju/services/render-service/internal/middleware"
	"github.com/manju-org/manju/services/render-service/internal/repo"
	"github.com/manju-org/manju/services/render-service/internal/service"
	"github.com/manju-org/manju/services/render-service/internal/token"
)

const (
	testIssuer = "manju-auth-test"
)

type teamFixture struct {
	TeamID      uuid.UUID
	OwnerID     uuid.UUID
	ViewerID    uuid.UUID
	ProjectID   uuid.UUID
	OwnerToken  string
	ViewerToken string
}

type harness struct {
	srv       *httptest.Server
	adminPool *pgxpool.Pool
	appPool   *pgxpool.Pool
	signer    *rsa.PrivateKey
	TeamA     teamFixture
	TeamB     teamFixture
}

func (h *harness) URL(p string) string { return h.srv.URL + p }

func (h *harness) Reset(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	_, err := h.adminPool.Exec(ctx, `DELETE FROM render_jobs`)
	require.NoError(t, err)
}

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

	// ---- pg ----
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

	// manju_app 非 owner role — RLS 真正生效
	for _, stmt := range []string{
		`CREATE ROLE manju_app WITH LOGIN PASSWORD 'app'`,
		`GRANT USAGE ON SCHEMA public TO manju_app`,
		`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO manju_app`,
		`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO manju_app`,
		`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO manju_app`,
	} {
		_, err := pool.Exec(ctx, stmt)
		require.NoError(t, err)
	}
	appDSN := strings.Replace(pgDSN, "manju:manju@", "manju_app:app@", 1)
	appPool, err := pgxpool.New(ctx, appDSN)
	require.NoError(t, err)
	require.NoError(t, appPool.Ping(ctx))

	// ---- minio 暂未用上 (NoopEnqueuer + 不实跑 ffmpeg, 仅测 HTTP+DB+RLS).
	// 后续若加 worker 端到端 (kafka + ffmpeg + s3) 集成测试, 这里再起.

	// ---- jwt ----
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	verifier := token.NewVerifier(&priv.PublicKey, testIssuer)

	// ---- handlers (NoopEnqueuer — 不需要 kafka) ----
	repoJ := repo.New(appPool)
	svcJ := service.New(repoJ, appPool, service.NoopEnqueuer{})
	h := &handler.Jobs{Svc: svcJ}

	teamA := seedTeam(ctx, t, pool, "A", priv)
	teamB := seedTeam(ctx, t, pool, "B", priv)

	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(rmw.RequestContext(zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})))
	r.Route("/v1", func(r chi.Router) {
		r.Use(rmw.RequireAuth(verifier))
		r.Get("/render", h.List)
		r.With(rmw.RequireWriteRole).Post("/render", h.Create)
		r.Get("/render/{id}", h.Get)
		r.With(rmw.RequireWriteRole).Delete("/render/{id}", h.Cancel)
	})

	srv := httptest.NewServer(r)

	return &harness{
		srv: srv, adminPool: pool, appPool: appPool, signer: priv,
		TeamA: teamA, TeamB: teamB,
	}
}

func applyMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	authDir := findMigrationsDir("auth-service")
	projectDir := findMigrationsDir("project-service")
	renderDir := findOwnMigrationsDir()
	for _, dir := range []string{authDir, projectDir, renderDir} {
		files, err := listSQL(dir)
		if err != nil {
			return fmt.Errorf("list %s: %w", dir, err)
		}
		for _, f := range files {
			raw, err := os.ReadFile(filepath.Join(dir, f))
			if err != nil {
				return err
			}
			if _, err := pool.Exec(ctx, string(raw)); err != nil {
				return fmt.Errorf("apply %s/%s: %w", dir, f, err)
			}
		}
	}
	return nil
}

func findMigrationsDir(svc string) string {
	_, this, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(this), "..", "..", "..", svc, "migrations")
}

func findOwnMigrationsDir() string {
	_, this, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(this), "..", "..", "migrations")
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

func seedTeam(ctx context.Context, t *testing.T, pool *pgxpool.Pool, label string, signer *rsa.PrivateKey) teamFixture {
	t.Helper()
	teamID := uuid.New()
	ownerID := uuid.New()
	viewerID := uuid.New()
	projectID := uuid.New()

	_, err := pool.Exec(ctx, `INSERT INTO teams (id, name) VALUES ($1, $2)`, teamID, "Team "+label)
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
	_, err = pool.Exec(ctx,
		`INSERT INTO projects (id, team_id, owner_id, name) VALUES ($1, $2, $3, $4)`,
		projectID, teamID, ownerID, "Project "+label)
	require.NoError(t, err)

	return teamFixture{
		TeamID:      teamID,
		OwnerID:     ownerID,
		ViewerID:    viewerID,
		ProjectID:   projectID,
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
