// Package apperr 对齐 api.md §5 错误码 (project 域子集).

package apperr

import (
	"errors"
	"fmt"
	"net/http"
)

type Code string

const (
	CodeInvalidInput     Code = "INVALID_INPUT"
	CodeInvalidToken     Code = "INVALID_TOKEN"
	CodeInsufficientPerm Code = "INSUFFICIENT_PERMISSION"
	CodeRateLimited      Code = "RATE_LIMITED"
	CodeConflict         Code = "CONFLICT"
	CodeProjectNotFound  Code = "PROJECT_NOT_FOUND"
	CodeInternal         Code = "INTERNAL_ERROR"
)

type AppError struct {
	Code    Code
	Message string
	HTTP    int
	Details map[string]any
	cause   error
}

func (e *AppError) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.cause)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}
func (e *AppError) Unwrap() error { return e.cause }

func (e *AppError) WithCause(err error) *AppError {
	e.cause = err
	return e
}
func (e *AppError) WithDetail(key string, val any) *AppError {
	if e.Details == nil {
		e.Details = map[string]any{}
	}
	e.Details[key] = val
	return e
}

func As(err error) *AppError {
	var a *AppError
	if errors.As(err, &a) {
		return a
	}
	return nil
}

func InvalidInput(msg string) *AppError {
	return &AppError{Code: CodeInvalidInput, Message: msg, HTTP: http.StatusBadRequest}
}
func InvalidToken(msg string) *AppError {
	return &AppError{Code: CodeInvalidToken, Message: msg, HTTP: http.StatusUnauthorized}
}
func InsufficientPermission(msg string) *AppError {
	return &AppError{Code: CodeInsufficientPerm, Message: msg, HTTP: http.StatusForbidden}
}
func RateLimited(msg string) *AppError {
	return &AppError{Code: CodeRateLimited, Message: msg, HTTP: http.StatusTooManyRequests}
}
func Conflict(msg string) *AppError {
	return &AppError{Code: CodeConflict, Message: msg, HTTP: http.StatusConflict}
}
func ProjectNotFound() *AppError {
	return &AppError{Code: CodeProjectNotFound, Message: "项目不存在", HTTP: http.StatusNotFound}
}
func Internal(msg string) *AppError {
	return &AppError{Code: CodeInternal, Message: msg, HTTP: http.StatusInternalServerError}
}
