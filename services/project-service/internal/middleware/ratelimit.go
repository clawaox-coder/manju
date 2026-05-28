package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/manju-org/manju/services/project-service/internal/apperr"
	"github.com/manju-org/manju/services/project-service/internal/httpx"
)

type visitor struct {
	count       int
	windowStart time.Time
}

// RateLimit 返回基于 IP 的滑动窗口限流中间件.
// limit: 窗口内最大请求数; window: 窗口时长.
func RateLimit(limit int, window time.Duration) func(http.Handler) http.Handler {
	var mu sync.Mutex
	visitors := make(map[string]*visitor)

	// 后台清理过期条目, 防止内存无限增长.
	go func() {
		for {
			time.Sleep(window)
			mu.Lock()
			now := time.Now()
			for ip, v := range visitors {
				if now.Sub(v.windowStart) > window {
					delete(visitors, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := extractIP(r)
			mu.Lock()
			v, ok := visitors[ip]
			now := time.Now()
			if !ok || now.Sub(v.windowStart) > window {
				visitors[ip] = &visitor{count: 1, windowStart: now}
				mu.Unlock()
				next.ServeHTTP(w, r)
				return
			}
			v.count++
			if v.count > limit {
				mu.Unlock()
				httpx.WriteError(w, r, apperr.RateLimited("请求过于频繁, 请稍后重试"))
				return
			}
			mu.Unlock()
			next.ServeHTTP(w, r)
		})
	}
}

func extractIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if i := strings.IndexByte(xff, ','); i > 0 {
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
