// Package middleware 提供请求上下文 / 访问日志 / JWT 鉴权 + 写权限校验.

package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/manju-org/manju/services/render-service/internal/apperr"
	"github.com/manju-org/manju/services/render-service/internal/httpx"
	"github.com/manju-org/manju/services/render-service/internal/logger"
	"github.com/manju-org/manju/services/render-service/internal/token"
)

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
		l := logger.FromContext(r.Context())
		l.Info().Int("status", ww.status).Dur("dur", time.Since(start)).Msg("http")
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

type claimsKey struct{}

func WithClaims(ctx context.Context, c *token.Claims) context.Context {
	return context.WithValue(ctx, claimsKey{}, c)
}

func ClaimsFrom(ctx context.Context) (*token.Claims, bool) {
	c, ok := ctx.Value(claimsKey{}).(*token.Claims)
	return c, ok
}

func RequireAuth(v *token.Verifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHdr := r.Header.Get("Authorization")
			raw := strings.TrimPrefix(authHdr, "Bearer ")
			if raw == "" || raw == authHdr {
				httpx.WriteError(w, r, apperr.InvalidToken("缺少 Authorization Bearer token"))
				return
			}
			claims, err := v.Verify(raw)
			if err != nil {
				httpx.WriteError(w, r, err)
				return
			}
			if claims.Subject == "" || claims.TeamID == "" || claims.Role == "" {
				httpx.WriteError(w, r, apperr.InvalidToken("token claims 缺失 (sub/team_id/role)"))
				return
			}
			if !validRole(claims.Role) {
				httpx.WriteError(w, r, apperr.InvalidToken("未知 role: "+claims.Role))
				return
			}
			next.ServeHTTP(w, r.WithContext(WithClaims(r.Context(), claims)))
		})
	}
}

func validRole(s string) bool {
	switch s {
	case "owner", "admin", "editor", "viewer":
		return true
	}
	return false
}

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

func MustTeamID(ctx context.Context) uuid.UUID {
	c, ok := ClaimsFrom(ctx)
	if !ok {
		panic("middleware: RequireAuth missing on protected route")
	}
	id, err := uuid.Parse(c.TeamID)
	if err != nil {
		panic("middleware: malformed team_id claim")
	}
	return id
}

func MustRole(ctx context.Context) string {
	c, ok := ClaimsFrom(ctx)
	if !ok {
		panic("middleware: RequireAuth missing on protected route")
	}
	return c.Role
}

// RequireWriteRole: viewer 只读, 其他角色可写.
func RequireWriteRole(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role := MustRole(r.Context())
		if role == "viewer" {
			httpx.WriteError(w, r, apperr.InsufficientPermission("viewer 只读, 无写权限"))
			return
		}
		next.ServeHTTP(w, r)
	})
}
