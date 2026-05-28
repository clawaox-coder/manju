// asset-service 入口. 装配 config / db / s3 / verifier / handler, 起 http server, 等 signal 优雅退出.

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

	"github.com/manju-org/manju/services/asset-service/internal/config"
	"github.com/manju-org/manju/services/asset-service/internal/handler"
	"github.com/manju-org/manju/services/asset-service/internal/logger"
	assetmw "github.com/manju-org/manju/services/asset-service/internal/middleware"
	"github.com/manju-org/manju/services/asset-service/internal/repo"
	"github.com/manju-org/manju/services/asset-service/internal/s3util"
	"github.com/manju-org/manju/services/asset-service/internal/service"
	"github.com/manju-org/manju/services/asset-service/internal/token"
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
	shutdown := initTracer("asset-service")
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
	log.Info().Str("env", cfg.Env).Str("addr", cfg.Addr).Msg("starting asset-service")

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

	s3c, err := s3util.New(ctx, s3util.Config{
		Endpoint:  cfg.S3Endpoint,
		AccessKey: cfg.S3AccessKey,
		SecretKey: cfg.S3SecretKey,
		Bucket:    cfg.S3Bucket,
		Region:    cfg.S3Region,
	})
	if err != nil {
		log.Fatal().Err(err).Msg("s3 init")
	}
	// 启动时尝试建 bucket; 失败只警告 (本地 MinIO 偶尔启慢)
	if err := s3c.EnsureBucket(ctx); err != nil {
		log.Warn().Err(err).Str("bucket", cfg.S3Bucket).Msg("ensure bucket failed (will retry on first request)")
	}

	verifier, err := token.LoadVerifier(cfg.JWTPublicKeyPath, cfg.JWTIssuer)
	if err != nil {
		log.Fatal().Err(err).Msg("load jwt public key")
	}

	repoA := repo.New(pool)
	svcA := &service.Assets{Repo: repoA, S3: s3c}
	h := &handler.Assets{Svc: svcA}

	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(assetmw.Tracing)
	r.Use(assetmw.RequestContext(log))
	r.Use(assetmw.AccessLog)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Request-Id", "X-Device-Id"},
		AllowCredentials: false,
		MaxAge:           300,
	}))
	r.Use(assetmw.RateLimit(100, time.Minute))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	r.Handle("/metrics", promhttp.Handler())

	r.Route("/v1", func(r chi.Router) {
		r.Use(assetmw.RequireAuth(verifier))

		// /v1/assets/{type} — type ∈ characters/scenes/props/music/sfx
		r.Get("/assets/{type}", h.List)
		r.With(assetmw.RequireWriteRole).Post("/assets/{type}", h.Create)
		r.Get("/assets/{type}/{id}", h.Get)
		r.With(assetmw.RequireWriteRole).Patch("/assets/{type}/{id}", h.Patch)
		r.With(assetmw.RequireWriteRole).Delete("/assets/{type}/{id}", h.Delete)

		// 上传预签
		r.With(assetmw.RequireWriteRole).Post("/upload/sign", h.SignUpload)
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
