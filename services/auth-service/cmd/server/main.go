// auth-service 入口. 装配 config / db / redis / signer / handlers, 起 http server, 等 signal 优雅退出.

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

	"github.com/manju-org/manju/services/auth-service/internal/config"
	"github.com/manju-org/manju/services/auth-service/internal/handler"
	"github.com/manju-org/manju/services/auth-service/internal/logger"
	authmw "github.com/manju-org/manju/services/auth-service/internal/middleware"
	"github.com/manju-org/manju/services/auth-service/internal/redisx"
	"github.com/manju-org/manju/services/auth-service/internal/service"
	"github.com/manju-org/manju/services/auth-service/internal/token"
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
	shutdown := initTracer("auth-service")
	defer shutdown(context.Background())

	cfg, err := config.FromEnv()
	if err != nil {
		// logger 还没起, 直接写 stderr.
		_, _ = os.Stderr.WriteString("config: " + err.Error() + "\n")
		os.Exit(2)
	}

	log := logger.New(cfg.Env)
	log.Info().Str("env", cfg.Env).Str("addr", cfg.Addr).Msg("starting auth-service")

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

	rdb, err := redisx.New(cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("redis init")
	}
	defer rdb.Close()
	if err := rdb.Ping(ctx); err != nil {
		log.Fatal().Err(err).Msg("redis ping")
	}

	signer, err := token.LoadSigner(cfg.JWTPrivateKeyPath, cfg.JWTPublicKeyPath, cfg.JWTIssuer, cfg.JWTAccessTTL)
	if err != nil {
		log.Fatal().Err(err).Msg("jwt signer")
	}

	authSvc := &service.Auth{
		Pool:            pool,
		Redis:           rdb,
		Signer:          signer,
		BcryptCost:      cfg.BcryptCost,
		AccessTTL:       cfg.JWTAccessTTL,
		RefreshTTL:      cfg.JWTRefreshTTL,
		LoginFailLimit:  cfg.LoginRatePer5Min,
		LoginFailWindow: 5 * time.Minute,
		LoginLockTTL:    15 * time.Minute,
	}
	h := &handler.Auth{Svc: authSvc, Pool: pool, Cfg: &cfg}

	registerRL := authmw.RateLimit{
		Redis: rdb, Bucket: "register", Window: time.Hour, Limit: int64(cfg.RegisterRatePerHour),
		Keyer: authmw.KeyByIP,
	}

	r := chi.NewRouter()
	r.Use(chimiddleware.Recoverer)
	r.Use(authmw.Tracing)
	r.Use(authmw.RequestContext(log))
	r.Use(authmw.AccessLog)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type", "X-Request-Id", "X-Device-Id"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	r.Handle("/metrics", promhttp.Handler())

	r.Route("/v1", func(r chi.Router) {
		r.Route("/auth", func(r chi.Router) {
			r.With(registerRL.Middleware).Post("/register", h.Register)
			r.Post("/login", h.Login)
			r.Post("/refresh", h.Refresh)
			r.Post("/logout", h.Logout)
			r.Post("/forgot-password", h.ForgotPassword)
			r.Post("/reset-password", h.ResetPassword)
			r.Get("/oauth/github", h.OAuthGitHub)
			r.Get("/oauth/github/callback", h.OAuthGitHubCallback)
		})
		r.With(authmw.RequireAuth(signer)).Get("/me", h.Me)
		r.With(authmw.RequireAuth(signer)).Get("/team/members", h.TeamMembers)
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
