// Integration test 辅助: 起 pg + minio 容器, 应用 auth + asset 两份迁移,
// 装配 chi router + handler, 提供签发测试 JWT 的工具.
//
// 关键点 (与 project-service helpers 同套):
//   - testcontainers postgres 默认 user = SUPERUSER, 绕过 RLS
//   - 必须再建一个 manju_app 非 owner role + 用它连第二个 pool 让 RLS 真正生效
//   - admin pool 仅用于 seed/reset, 业务 repo 用 app pool

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
	tcminio "github.com/testcontainers/testcontainers-go/modules/minio"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/manju-org/manju/services/asset-service/internal/handler"
	assetmw "github.com/manju-org/manju/services/asset-service/internal/middleware"
	"github.com/manju-org/manju/services/asset-service/internal/repo"
	"github.com/manju-org/manju/services/asset-service/internal/s3util"
	"github.com/manju-org/manju/services/asset-service/internal/service"
	"github.com/manju-org/manju/services/asset-service/internal/token"
)

const (
	testIssuer = "manju-auth-test"
	testBucket = "manju-assets-test"
)

type teamFixture struct {
	TeamID      uuid.UUID
	OwnerID     uuid.UUID
	ViewerID    uuid.UUID
	OwnerToken  string
	ViewerToken string
}

type harness struct {
	srv       *httptest.Server
	adminPool *pgxpool.Pool // superuser, seed/reset
	appPool   *pgxpool.Pool // manju_app, RLS 生效
	signer    *rsa.PrivateKey
	verifier  *token.Verifier
	s3        *s3util.Client
	s3Cfg     s3util.Config
	TeamA     teamFixture
	TeamB     teamFixture
	cleanups  []func()
}

func (h *harness) URL(p string) string { return h.srv.URL + p }

func (h *harness) Reset(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	_, err := h.adminPool.Exec(ctx, `TRUNCATE assets RESTART IDENTITY CASCADE`)
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

	// ---- minio ----
	minioC, err := tcminio.Run(ctx, "minio/minio:RELEASE.2025-01-20T14-49-07Z",
		testcontainers.WithEnv(map[string]string{
			"MINIO_ROOT_USER":     "manjuadmin",
			"MINIO_ROOT_PASSWORD": "manjuadmin",
		}),
	)
	require.NoError(t, err)
	minioEndpoint, err := minioC.ConnectionString(ctx) // "host:port", 无 scheme
	require.NoError(t, err)
	if !strings.HasPrefix(minioEndpoint, "http") {
		minioEndpoint = "http://" + minioEndpoint
	}
	s3Cfg := s3util.Config{
		Endpoint:  minioEndpoint,
		AccessKey: minioC.Username,
		SecretKey: minioC.Password,
		Bucket:    testBucket,
		Region:    "us-east-1",
	}
	s3c, err := s3util.New(ctx, s3Cfg)
	require.NoError(t, err)
	require.NoError(t, s3c.EnsureBucket(ctx))

	// ---- jwt ----
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	verifier := token.NewVerifier(&priv.PublicKey, testIssuer)

	// ---- handlers ----
	repoA := repo.New(appPool)
	svc := &service.Assets{Repo: repoA, S3: s3c}
	h := &handler.Assets{Svc: svc}

	teamA := seedTeam(ctx, t, pool, "A", priv)
	teamB := seedTeam(ctx, t, pool, "B", priv)

	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(assetmw.RequestContext(zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr})))
	r.Route("/v1", func(r chi.Router) {
		r.Use(assetmw.RequireAuth(verifier))
		r.Get("/assets/{type}", h.List)
		r.With(assetmw.RequireWriteRole).Post("/assets/{type}", h.Create)
		r.Get("/assets/{type}/{id}", h.Get)
		r.With(assetmw.RequireWriteRole).Patch("/assets/{type}/{id}", h.Patch)
		r.With(assetmw.RequireWriteRole).Delete("/assets/{type}/{id}", h.Delete)
		r.With(assetmw.RequireWriteRole).Post("/upload/sign", h.SignUpload)
		// 与 cmd/server/main.go 保持一致(集成测试 router 为手工复制)
		r.With(assetmw.RequireWriteRole).Post("/projects/{pid}/assets", h.LinkProjectAsset)
		r.Get("/projects/{pid}/assets", h.ListProjectAssets)
	})

	srv := httptest.NewServer(r)
	cleanups := []func(){
		srv.Close,
		func() { appPool.Close() },
		func() { pool.Close() },
		func() { _ = minioC.Terminate(context.Background()) },
		func() { _ = pgC.Terminate(context.Background()) },
	}
	return &harness{
		srv: srv, adminPool: pool, appPool: appPool, signer: priv, verifier: verifier,
		s3: s3c, s3Cfg: s3Cfg,
		TeamA: teamA, TeamB: teamB, cleanups: cleanups,
	}
}

// applyMigrations: auth + asset 顺序很重要 (asset 需 users/teams)
func applyMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	authDir := findAuthMigrationsDir()
	assetDir := findAssetMigrationsDir()
	for _, dir := range []string{authDir, assetDir} {
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
				return fmt.Errorf("apply %s: %w", f, err)
			}
		}
	}
	return nil
}

func findAssetMigrationsDir() string {
	_, this, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(this), "..", "..", "migrations")
}

func findAuthMigrationsDir() string {
	_, this, _, _ := runtime.Caller(0)
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

// seedTeam 用超级用户身份 INSERT 测试数据 (RLS USING only 不限 INSERT).
func seedTeam(ctx context.Context, t *testing.T, pool *pgxpool.Pool, label string, signer *rsa.PrivateKey) teamFixture {
	t.Helper()
	teamID := uuid.New()
	ownerID := uuid.New()
	viewerID := uuid.New()

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
