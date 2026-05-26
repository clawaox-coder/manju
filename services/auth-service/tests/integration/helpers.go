// Integration test 辅助: 起 pg + redis 容器, 应用迁移, 装配 http handler 给测试用.

package integration

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/manju-org/manju/services/auth-service/internal/handler"
	authmw "github.com/manju-org/manju/services/auth-service/internal/middleware"
	"github.com/manju-org/manju/services/auth-service/internal/redisx"
	"github.com/manju-org/manju/services/auth-service/internal/service"
	"github.com/manju-org/manju/services/auth-service/internal/token"
)

type harness struct {
	srv       *httptest.Server
	pool      *pgxpool.Pool
	redis     *redisx.Client
	signer    *token.Signer
	authSvc   *service.Auth
	cleanups  []func()
}

func (h *harness) URL(path string) string { return h.srv.URL + path }

func (h *harness) Close() {
	for i := len(h.cleanups) - 1; i >= 0; i-- {
		h.cleanups[i]()
	}
}

// IssueAccessTokenFor 测试用快速签 access token (绕过 login).
func (h *harness) Reset(t *testing.T) {
	ctx := context.Background()
	_, err := h.pool.Exec(ctx, `TRUNCATE refresh_tokens, team_members, teams, users RESTART IDENTITY CASCADE`)
	require.NoError(t, err)
	// 清掉 redis 中所有 rate limit / refresh 缓存.
	require.NoError(t, h.redis.FlushAll(ctx))
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

	rdC, err := tcredis.Run(ctx, "redis:7-alpine",
		testcontainers.WithWaitStrategy(wait.ForLog("Ready to accept connections")),
	)
	require.NoError(t, err)

	pgDSN, err := pgC.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)
	rdURL, err := rdC.ConnectionString(ctx)
	require.NoError(t, err)

	pool, err := pgxpool.New(ctx, pgDSN)
	require.NoError(t, err)

	require.NoError(t, applyMigrations(ctx, pool))

	rdb, err := redisx.New(rdURL)
	require.NoError(t, err)
	require.NoError(t, rdb.Ping(ctx))

	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	signer := token.NewSigner(priv, &priv.PublicKey, "manju-auth-test", 15*time.Minute)

	authSvc := &service.Auth{
		Pool:            pool,
		Redis:           rdb,
		Signer:          signer,
		BcryptCost:      4, // 加速测试 (security: 仅测试用)
		AccessTTL:       15 * time.Minute,
		RefreshTTL:      720 * time.Hour,
		LoginFailLimit:  5,
		LoginFailWindow: 5 * time.Minute,
		LoginLockTTL:    15 * time.Minute,
	}
	h := &handler.Auth{Svc: authSvc}

	registerRL := authmw.RateLimit{
		Redis: rdb, Bucket: "register", Window: time.Hour, Limit: 3,
		Keyer: authmw.KeyByIP,
	}

	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(authmw.RequestContext(zerolog.Nop()))
	r.Route("/v1", func(r chi.Router) {
		r.Route("/auth", func(r chi.Router) {
			r.With(registerRL.Middleware).Post("/register", h.Register)
			r.Post("/login", h.Login)
			r.Post("/refresh", h.Refresh)
			r.Post("/logout", h.Logout)
		})
		r.With(authmw.RequireAuth(signer)).Get("/me", h.Me)
	})

	srv := httptest.NewServer(r)
	cleanups := []func(){
		srv.Close,
		func() { rdb.Close() },
		func() { pool.Close() },
		func() { _ = rdC.Terminate(context.Background()) },
		func() { _ = pgC.Terminate(context.Background()) },
	}
	return &harness{
		srv: srv, pool: pool, redis: rdb,
		signer: signer, authSvc: authSvc, cleanups: cleanups,
	}
}

func applyMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	migDir := findMigrationsDir()
	files, err := readSorted(migDir)
	if err != nil {
		return err
	}
	for _, f := range files {
		raw, err := os.ReadFile(filepath.Join(migDir, f))
		if err != nil {
			return err
		}
		if _, err := pool.Exec(ctx, string(raw)); err != nil {
			return err
		}
	}
	return nil
}

func findMigrationsDir() string {
	_, this, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(this), "..", "..", "migrations")
}

func readSorted(dir string) ([]string, error) {
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
