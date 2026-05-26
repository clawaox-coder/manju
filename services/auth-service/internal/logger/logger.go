package logger

import (
	"context"
	"io"
	"os"

	"github.com/rs/zerolog"
)

// New 返回适配环境的 logger:
//   local: 人类友好 (ConsoleWriter)
//   其他:  JSON
func New(env string) zerolog.Logger {
	var w io.Writer = os.Stderr
	if env == "local" {
		w = zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: "15:04:05.000"}
	}
	return zerolog.New(w).With().Timestamp().Logger()
}

type ctxKey struct{}

func WithLogger(ctx context.Context, l zerolog.Logger) context.Context {
	return context.WithValue(ctx, ctxKey{}, l)
}

func FromContext(ctx context.Context) zerolog.Logger {
	if l, ok := ctx.Value(ctxKey{}).(zerolog.Logger); ok {
		return l
	}
	return zerolog.Nop()
}
