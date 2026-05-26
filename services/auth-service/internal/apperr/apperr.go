// Package apperr 对齐 api.md §5 错误码 (全表).
// 业务路径 throw AppError, 中间件统一转 HTTP 响应.

package apperr

import (
	"errors"
	"fmt"
	"net/http"
)

// Code 必须出现在 api.md §5.
type Code string

const (
	CodeInvalidInput          Code = "INVALID_INPUT"
	CodeInvalidToken          Code = "INVALID_TOKEN"
	CodeInsufficientPerm      Code = "INSUFFICIENT_PERMISSION"
	CodeRateLimited           Code = "RATE_LIMITED"
	CodeConflict              Code = "CONFLICT"
	CodeNotFound              Code = "PROJECT_NOT_FOUND" // 暂复用; auth 域内主要不用
	CodeUserNotFound          Code = "USER_NOT_FOUND"
	CodeEmailAlreadyExists    Code = "EMAIL_ALREADY_EXISTS"
	CodeInvalidCredentials    Code = "INVALID_CREDENTIALS"
	CodeInternal              Code = "INTERNAL_ERROR"
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

// As 提取链中的 AppError; 找不到返回 nil.
func As(err error) *AppError {
	var a *AppError
	if errors.As(err, &a) {
		return a
	}
	return nil
}

// 构造器
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
func UserNotFound() *AppError {
	return &AppError{Code: CodeUserNotFound, Message: "用户不存在", HTTP: http.StatusNotFound}
}
func EmailAlreadyExists() *AppError {
	return &AppError{Code: CodeEmailAlreadyExists, Message: "邮箱已注册", HTTP: http.StatusConflict}
}
func InvalidCredentials() *AppError {
	return &AppError{Code: CodeInvalidCredentials, Message: "邮箱或密码不正确", HTTP: http.StatusUnauthorized}
}
func Internal(msg string) *AppError {
	return &AppError{Code: CodeInternal, Message: msg, HTTP: http.StatusInternalServerError}
}
