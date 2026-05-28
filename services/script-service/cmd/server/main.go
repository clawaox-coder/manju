// script-service 入口. 装配 config / db / verifier / handler, 起 http server, 等 signal 优雅退出.

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
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/manju-org/manju/services/script-service/internal/config"
	"github.com/manju-org/manju/services/script-service/internal/handler"
	"github.com/manju-org/manju/services/script-service/internal/logger"
	scriptmw "github.com/manju-org/manju/services/script-service/internal/middleware"
	"github.com/manju-org/manju/services/script-service/internal/repo"
	"github.com/manju-org/manju/services/script-service/internal/service"
	"github.com/manju-org/manju/services/script-service/internal/token"
)

func main() {
	cfg, err := config.FromEnv()
	if err != nil {
		_, _ = os.Stderr.WriteString("config: " + err.Error() + "\n")
		os.Exit(2)
	}
	if err := cfg.Validate(); err != nil {
		_, _ = os.Stderr.WriteString("config: " + err.Error() + "\n")
		os.Exit(2)
	}

	log := logger.New(cfg.Env)
	log.Info().Str("env", cfg.Env).Str("addr", cfg.Addr).Msg("starting script-service")

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

	scriptsRepo := repo.NewScripts(pool)
	versionsRepo := repo.NewScriptVersions(pool)
	shotsRepo := repo.NewShots(pool)

	scriptsSvc := &service.Scripts{Repo: scriptsRepo, Versions: versionsRepo, Shots: shotsRepo}
	shotsSvc := &service.Shots{Repo: shotsRepo}

	scriptsH := &handler.ScriptsHandler{Svc: scriptsSvc}
	shotsH := &handler.ShotsHandler{Svc: shotsSvc}

	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(scriptmw.RequestContext(log))
	r.Use(scriptmw.AccessLog)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Request-Id", "X-Device-Id"},
		AllowCredentials: false,
		MaxAge:           300,
	}))
	r.Use(scriptmw.RateLimit(100, time.Minute))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	r.Handle("/metrics", promhttp.Handler())

	r.Route("/v1", func(r chi.Router) {
		r.Use(scriptmw.RequireAuth(verifier))

		// scripts (5 端点)
		r.Get("/projects/{id}/script", scriptsH.Get)
		r.With(scriptmw.RequireWriteRole).Put("/projects/{id}/script", scriptsH.Put)
		r.Get("/projects/{id}/script/versions", scriptsH.ListVersions)
		r.Get("/projects/{id}/script/versions/{version_no}", scriptsH.GetVersion)
		r.With(scriptmw.RequireWriteRole).Post("/projects/{id}/script/versions/{version_no}/restore", scriptsH.Restore)

		// shots (5 端点)
		r.Get("/projects/{id}/shots", shotsH.List)
		r.With(scriptmw.RequireWriteRole).Post("/projects/{id}/shots", shotsH.Create)
		r.With(scriptmw.RequireWriteRole).Patch("/projects/{id}/shots/{shot_id}", shotsH.Patch)
		r.With(scriptmw.RequireWriteRole).Delete("/projects/{id}/shots/{shot_id}", shotsH.Delete)
		r.With(scriptmw.RequireWriteRole).Put("/projects/{id}/shots/reorder", shotsH.Reorder)
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
