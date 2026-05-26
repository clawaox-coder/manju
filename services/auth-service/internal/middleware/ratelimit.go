package middleware

import (
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/manju-org/manju/services/auth-service/internal/apperr"
	"github.com/manju-org/manju/services/auth-service/internal/httpx"
	"github.com/manju-org/manju/services/auth-service/internal/redisx"
)

type RateLimit struct {
	Redis  *redisx.Client
	Bucket string        // 例 "login" / "register"
	Window time.Duration // 计数窗口
	Limit  int64         // 窗口内最大次数
	Keyer  func(*http.Request) string
}

func (rl RateLimit) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		k := rl.Keyer(r)
		if k == "" {
			next.ServeHTTP(w, r)
			return
		}
		key := "rate:" + rl.Bucket + ":" + k
		cnt, err := rl.Redis.Incr(r.Context(), key, rl.Window)
		if err != nil {
			httpx.WriteError(w, r, apperr.Internal("rate limiter error").WithCause(err))
			return
		}
		if cnt > rl.Limit {
			httpx.WriteError(w, r, apperr.RateLimited("请求过于频繁, 稍后再试").
				WithDetail("limit", rl.Limit).
				WithDetail("window_seconds", int(rl.Window.Seconds())))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// KeyByIP 取客户端 IP (X-Forwarded-For 优先, 再 RemoteAddr).
func KeyByIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.Index(xff, ","); i >= 0 {
			return strings.TrimSpace(xff[:i])
		}
		return strings.TrimSpace(xff)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
