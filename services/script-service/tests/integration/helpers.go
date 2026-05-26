// Integration test 辅助: 起 pg 容器, 应用 auth+project+script 三套迁移,
// 装 manju_app 非 owner pool 让 RLS 真正生效, seed 2 个 team + 各 1 个 project.

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

	"github.com/manju-org/manju/services/script-service/internal/handler"
	scriptmw "github.com/manju-org/manju/services/script-service/internal/middleware"
	"github.com/manju-org/manju/services/script-service/internal/repo"
	"github.com/manju-org/manju/services/script-service/internal/service"
	"github.com/manju-org/manju/services/script-service/internal/token"
)

const testIssuer = "manju-auth-test"

type teamFixture struct {
	TeamID      uuid.UUID
	OwnerID     uuid.UUID
	ViewerID    uuid.UUID
	ProjectID   uuid.UUID // 每 team 预创建一个 project, 供 script/shots 测试用
	OwnerToken  string
	ViewerToken string
}

type harness struct {
	srv       *httptest.Server
	adminPool *pgxpool.Pool // superuser, seed/reset
	appPool   *pgxpool.Pool // manju_app, RLS 生效
	signer    *rsa.PrivateKey
	verifier  *token.Verifier
	TeamA     teamFixture
	TeamB     teamFixture
	cleanups  []func()
}

func (h *harness) URL(p string) string { return h.srv.URL + p }

// Reset: 清空本 service 的三张表, 保留 projects/users/teams (不要清, fixture 是 boot 时 seed 的).
func (h *harness) Reset(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	_, err := h.adminPool.Exec(ctx, `TRUNCATE scripts, script_versions, shots RESTART IDENTITY CASCADE`)
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

	// manju_app 非 owner role
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
	appDSN := strings.Replace(pgDSN, "manju:manju@", "manju_app:app@", 1)
	appPool, err := pgxpool.New(ctx, appDSN)
	require.NoError(t, err)
	require.NoError(t, appPool.Ping(ctx))

	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	verifier := token.NewVerifier(&priv.PublicKey, testIssuer)

	scriptsRepo := repo.NewScripts(appPool)
	versionsRepo := repo.NewScriptVersions(appPool)
	shotsRepo := repo.NewShots(appPool)
	scriptsSvc := &service.Scripts{Repo: scriptsRepo, Versions: versionsRepo, Shots: shotsRepo}
	shotsSvc := &service.Shots{Repo: shotsRepo}
	scriptsH := &handler.ScriptsHandler{Svc: scriptsSvc}
	shotsH := &handler.ShotsHandler{Svc: shotsSvc}

	teamA := seedTeamWithProject(ctx, t, pool, "A", priv)
	teamB := seedTeamWithProject(ctx, t, pool, "B", priv)

	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(scriptmw.RequestContext(zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})))
	r.Route("/v1", func(r chi.Router) {
		r.Use(scriptmw.RequireAuth(verifier))
		r.Get("/projects/{id}/script", scriptsH.Get)
		r.With(scriptmw.RequireWriteRole).Put("/projects/{id}/script", scriptsH.Put)
		r.Get("/projects/{id}/script/versions", scriptsH.ListVersions)
		r.Get("/projects/{id}/script/versions/{version_no}", scriptsH.GetVersion)
		r.With(scriptmw.RequireWriteRole).Post("/projects/{id}/script/versions/{version_no}/restore", scriptsH.Restore)
		r.Get("/projects/{id}/shots", shotsH.List)
		r.With(scriptmw.RequireWriteRole).Post("/projects/{id}/shots", shotsH.Create)
		r.With(scriptmw.RequireWriteRole).Patch("/projects/{id}/shots/{shot_id}", shotsH.Patch)
		r.With(scriptmw.RequireWriteRole).Delete("/projects/{id}/shots/{shot_id}", shotsH.Delete)
		r.With(scriptmw.RequireWriteRole).Put("/projects/{id}/shots/reorder", shotsH.Reorder)
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

// applyMigrations: auth + project + script 顺序
func applyMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	_, this, _, _ := runtime.Caller(0)
	base := filepath.Join(filepath.Dir(this), "..", "..", "..")
	for _, svc := range []string{"auth-service", "project-service", "script-service"} {
		dir := filepath.Join(base, svc, "migrations")
		files, err := listSQL(dir)
		if err != nil {
			return fmt.Errorf("list %s migrations: %w", svc, err)
		}
		for _, f := range files {
			raw, err := os.ReadFile(filepath.Join(dir, f))
			if err != nil {
				return err
			}
			if _, err := pool.Exec(ctx, string(raw)); err != nil {
				return fmt.Errorf("apply %s/%s: %w", svc, f, err)
			}
		}
	}
	return nil
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

// seedTeamWithProject 创 team + owner + viewer + 1 个 project (后续 script/shots 都挂这个 project)
func seedTeamWithProject(ctx context.Context, t *testing.T, pool *pgxpool.Pool, label string, signer *rsa.PrivateKey) teamFixture {
	t.Helper()
	teamID := uuid.New()
	ownerID := uuid.New()
	viewerID := uuid.New()
	projectID := uuid.New()

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
