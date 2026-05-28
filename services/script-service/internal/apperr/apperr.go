// Package apperr 对齐 api.md §5 错误码 (script 域子集).

package apperr

import (
	"errors"
	"fmt"
	"net/http"
)

type Code string

const (
	CodeInvalidInput      Code = "INVALID_INPUT"
	CodeInvalidToken      Code = "INVALID_TOKEN"
	CodeInsufficientPerm  Code = "INSUFFICIENT_PERMISSION"
	CodeRateLimited       Code = "RATE_LIMITED"
	CodeConflict          Code = "CONFLICT"
	CodeScriptNotFound    Code = "SCRIPT_NOT_FOUND"
	CodeVersionNotFound   Code = "VERSION_NOT_FOUND"
	CodeShotNotFound      Code = "SHOT_NOT_FOUND"
	CodeProjectNotFound   Code = "PROJECT_NOT_FOUND"
	CodeVersionConflict   Code = "VERSION_CONFLICT"
	CodeInternal          Code = "INTERNAL_ERROR"
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
func ScriptNotFound() *AppError {
	return &AppError{Code: CodeScriptNotFound, Message: "脚本不存在", HTTP: http.StatusNotFound}
}
func VersionNotFound() *AppError {
	return &AppError{Code: CodeVersionNotFound, Message: "脚本版本不存在", HTTP: http.StatusNotFound}
}
func ShotNotFound() *AppError {
	return &AppError{Code: CodeShotNotFound, Message: "shot 不存在", HTTP: http.StatusNotFound}
}
func ProjectNotFound() *AppError {
	return &AppError{Code: CodeProjectNotFound, Message: "项目不存在", HTTP: http.StatusNotFound}
}
// VersionConflict 用于 PUT script 的乐观锁失败. 返回 409, details 含 current/expected.
func VersionConflict(currentNo, expectedNo int) *AppError {
	return &AppError{
		Code:    CodeVersionConflict,
		Message: "版本冲突, 请刷新后重试",
		HTTP:    http.StatusConflict,
		Details: map[string]any{
			"current_version_no":  currentNo,
			"expected_version_no": expectedNo,
		},
	}
}
func Internal(msg string) *AppError {
	return &AppError{Code: CodeInternal, Message: msg, HTTP: http.StatusInternalServerError}
}
