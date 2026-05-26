// Package httpx 统一 JSON 响应 (api.md §3) + request_id.

package httpx

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/manju-org/manju/services/auth-service/internal/apperr"
	"github.com/manju-org/manju/services/auth-service/internal/logger"
)

type Meta struct {
	RequestID string `json:"request_id"`
	RequestMs int64  `json:"request_ms"`
}

type SuccessEnvelope struct {
	Data any  `json:"data"`
	Meta Meta `json:"meta"`
}

type ErrorBody struct {
	Code      string         `json:"code"`
	Message   string         `json:"message"`
	RequestID string         `json:"request_id"`
	Details   map[string]any `json:"details,omitempty"`
}

type ErrorEnvelope struct {
	Error ErrorBody `json:"error"`
}

type ctxKey struct{ k string }

var (
	requestIDKey = ctxKey{"request_id"}
	startKey     = ctxKey{"start"}
)

func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey, id)
}
func RequestIDFrom(ctx context.Context) string {
	if v, ok := ctx.Value(requestIDKey).(string); ok {
		return v
	}
	return ""
}
func WithStart(ctx context.Context, t time.Time) context.Context {
	return context.WithValue(ctx, startKey, t)
}
func startFrom(ctx context.Context) time.Time {
	if v, ok := ctx.Value(startKey).(time.Time); ok {
		return v
	}
	return time.Now()
}

// NewRequestID 生成 "req_" 前缀的可读 id (api.md §3 示例风格).
func NewRequestID() string { return "req_" + uuid.NewString() }

func WriteJSON(w http.ResponseWriter, r *http.Request, status int, data any) {
	ctx := r.Context()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(SuccessEnvelope{
		Data: data,
		Meta: Meta{
			RequestID: RequestIDFrom(ctx),
			RequestMs: time.Since(startFrom(ctx)).Milliseconds(),
		},
	})
}

func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	ctx := r.Context()
	requestID := RequestIDFrom(ctx)
	l := logger.FromContext(ctx)

	ae := apperr.As(err)
	if ae == nil {
		ae = apperr.Internal("internal error").WithCause(err)
	}
	if ae.HTTP >= 500 {
		l.Error().Err(err).Str("code", string(ae.Code)).Msg("server_error")
	} else {
		l.Info().Err(err).Str("code", string(ae.Code)).Msg("client_error")
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(ae.HTTP)
	_ = json.NewEncoder(w).Encode(ErrorEnvelope{Error: ErrorBody{
		Code:      string(ae.Code),
		Message:   ae.Message,
		RequestID: requestID,
		Details:   ae.Details,
	}})
}

// DecodeJSON 严格解码 (DisallowUnknownFields), 失败 → INVALID_INPUT.
func DecodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return apperr.InvalidInput("请求体格式错误").WithCause(err)
	}
	return nil
}
