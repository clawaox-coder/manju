// render-service 入口. 装配 config / db / verifier / handler, 起 http server,
// 等 signal 优雅退出. kafka producer 接入留给后续提交 (NoopEnqueuer 占位让 dev 可跑).

package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/manju-org/manju/services/render-service/internal/config"
	"github.com/manju-org/manju/services/render-service/internal/handler"
	"github.com/manju-org/manju/services/render-service/internal/logger"
	rmw "github.com/manju-org/manju/services/render-service/internal/middleware"
	"github.com/manju-org/manju/services/render-service/internal/repo"
	"github.com/manju-org/manju/services/render-service/internal/service"
	"github.com/manju-org/manju/services/render-service/internal/token"
)

func main() {
	cfg, err := config.FromEnv()
	if err != nil {
		_, _ = os.Stderr.WriteString("config: " + err.Error() + "\n")
		os.Exit(2)
	}
	if err := cfg.ValidateService(); err != nil {
		_, _ = os.Stderr.WriteString("config: " + err.Error() + "\n")
		os.Exit(2)
	}

	log := logger.New(cfg.Env)
	log.Info().Str("env", cfg.Env).Str("addr", cfg.Addr).Msg("starting render-service")

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("pgxpool")
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatal().Err(err).Msg("postgres ping")
	}

	verifier, err := token.LoadVerifier(cfg.JWTPublicKeyPath, cfg.JWTIssuer)
	if err != nil {
		log.Fatal().Err(err).Msg("load jwt public key")
	}

	repoJ := repo.New(pool)
	// Enqueuer: m1 用 NoopEnqueuer (service 不发 kafka). 真 kafka producer 由
	// 后续提交接入, 替换为 kafka.Producer (实现 service.Enqueuer 接口).
	svcJ := service.New(repoJ, pool, service.NoopEnqueuer{})
	h := &handler.Jobs{Svc: svcJ}

	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(rmw.RequestContext(log))
	r.Use(rmw.AccessLog)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Request-Id", "Idempotency-Key"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	r.Route("/v1", func(r chi.Router) {
		r.Use(rmw.RequireAuth(verifier))

		r.Get("/render", h.List)
		r.With(rmw.RequireWriteRole).Post("/render", h.Create)
		r.Get("/render/{id}", h.Get)
		r.With(rmw.RequireWriteRole).Delete("/render/{id}", h.Cancel)
	})

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info().Str("addr", cfg.Addr).Msg("http listening")
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		log.Info().Msg("shutdown requested")
	case err := <-errCh:
		log.Error().Err(err).Msg("http error")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	log.Info().Msg("bye")
}
