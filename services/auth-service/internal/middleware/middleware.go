// Package middleware 提供 JWT 鉴权 / 限流 / 日志 / requestID.

package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/manju-org/manju/services/auth-service/internal/apperr"
	"github.com/manju-org/manju/services/auth-service/internal/httpx"
	"github.com/manju-org/manju/services/auth-service/internal/logger"
	"github.com/manju-org/manju/services/auth-service/internal/token"
	"github.com/rs/zerolog"
)

// ---- request id + logger ----

func RequestContext(base zerolog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rid := r.Header.Get("X-Request-Id")
			if rid == "" {
				rid = httpx.NewRequestID()
			}
			l := base.With().Str("request_id", rid).Str("method", r.Method).Str("path", r.URL.Path).Logger()
			ctx := r.Context()
			ctx = httpx.WithRequestID(ctx, rid)
			ctx = httpx.WithStart(ctx, time.Now())
			ctx = logger.WithLogger(ctx, l)
			w.Header().Set("X-Request-Id", rid)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func AccessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := &respWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(ww, r)
		dur := time.Since(start)
		l := logger.FromContext(r.Context())
		l.Info().
			Int("status", ww.status).
			Dur("dur", dur).
			Msg("http")
	})
}

type respWriter struct {
	http.ResponseWriter
	status int
}

func (w *respWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

// ---- auth (JWT) ----

type claimsKey struct{}

func WithClaims(ctx context.Context, c *token.Claims) context.Context {
	return context.WithValue(ctx, claimsKey{}, c)
}

func ClaimsFrom(ctx context.Context) (*token.Claims, bool) {
	c, ok := ctx.Value(claimsKey{}).(*token.Claims)
	return c, ok
}

func RequireAuth(verifier *token.Signer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if raw == "" || raw == r.Header.Get("Authorization") {
				httpx.WriteError(w, r, apperr.InvalidToken("缺少 Authorization Bearer token"))
				return
			}
			claims, err := verifier.Verify(raw)
			if err != nil {
				httpx.WriteError(w, r, err)
				return
			}
			next.ServeHTTP(w, r.WithContext(WithClaims(r.Context(), claims)))
		})
	}
}

// MustUserID panic 若没鉴权 (programming error: 漏挂 RequireAuth).
func MustUserID(ctx context.Context) uuid.UUID {
	c, ok := ClaimsFrom(ctx)
	if !ok {
		panic("middleware: RequireAuth missing on protected route")
	}
	id, err := uuid.Parse(c.Subject)
	if err != nil {
		panic("middleware: malformed sub claim")
	}
	return id
}
