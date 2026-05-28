// project-service 入口. 装配 config / db / verifier / handler, 起 http server, 等 signal 优雅退出.

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
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"

	"github.com/manju-org/manju/services/project-service/internal/config"
	"github.com/manju-org/manju/services/project-service/internal/handler"
	"github.com/manju-org/manju/services/project-service/internal/logger"
	projmw "github.com/manju-org/manju/services/project-service/internal/middleware"
	"github.com/manju-org/manju/services/project-service/internal/repo"
	"github.com/manju-org/manju/services/project-service/internal/service"
	"github.com/manju-org/manju/services/project-service/internal/token"
)

func initTracer(serviceName string) func(context.Context) {
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		endpoint = "http://localhost:4318"
	}
	exp, err := otlptracehttp.New(context.Background(),
		otlptracehttp.WithEndpointURL(endpoint),
	)
	if err != nil {
		_, _ = os.Stderr.WriteString("otel exporter: " + err.Error() + "\n")
		return func(context.Context) {}
	}
	res, _ := resource.New(context.Background(),
		resource.WithAttributes(semconv.ServiceName(serviceName)),
	)
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	return func(ctx context.Context) { _ = tp.Shutdown(ctx) }
}

func main() {
	shutdown := initTracer("project-service")
	defer shutdown(context.Background())

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
	log.Info().Str("env", cfg.Env).Str("addr", cfg.Addr).Msg("starting project-service")

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

	repoP := repo.New(pool)
	svcP := &service.Projects{Repo: repoP}
	h := &handler.Projects{Svc: svcP}

	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(projmw.Tracing)
	r.Use(projmw.RequestContext(log))
	r.Use(projmw.AccessLog)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Request-Id", "X-Device-Id"},
		AllowCredentials: false,
		MaxAge:           300,
	}))
	r.Use(projmw.RateLimit(100, time.Minute))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	r.Handle("/metrics", promhttp.Handler())

	r.Route("/v1", func(r chi.Router) {
		r.Use(projmw.RequireAuth(verifier))

		// projects (8)
		r.Get("/projects", h.List)
		r.With(projmw.RequireWriteRole).Post("/projects", h.Create)
		r.Get("/projects/{id}", h.Get)
		r.With(projmw.RequireWriteRole).Patch("/projects/{id}", h.Patch)
		r.With(projmw.RequireWriteRole).Post("/projects/{id}/duplicate", h.Duplicate)
		r.With(projmw.RequireWriteRole).Delete("/projects/{id}", h.SoftDelete)
		r.With(projmw.RequireWriteRole).Post("/projects/{id}/restore", h.Restore)
		r.With(projmw.RequireWriteRole).Delete("/projects/{id}/purge", h.Purge)

		// drafts (3)
		r.Get("/drafts", h.ListDrafts)
		r.With(projmw.RequireWriteRole).Delete("/drafts/{id}", h.DeleteDraft)
		r.With(projmw.RequireWriteRole).Post("/drafts", h.ClearAllDrafts)

		// shared (2)
		r.Get("/shared", h.ListShared)
		r.Post("/shared/{id}/leave", h.LeaveShared)

		// trash (4)
		r.Get("/trash", h.ListTrash)
		r.With(projmw.RequireWriteRole).Post("/trash/{id}/restore", h.RestoreFromTrash)
		r.With(projmw.RequireWriteRole).Delete("/trash/{id}", h.DeleteFromTrash)
		r.With(projmw.RequireWriteRole).Post("/trash/empty", h.EmptyTrash)
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
