// Package password 包装 bcrypt, security.md §2 / §4 要求 cost>=12.

package password

import (
	"errors"

	"golang.org/x/crypto/bcrypt"
)

// MinCost 是文档要求的最低 cost.
const MinCost = 12

// Hash 用 cost 加密 password. cost < MinCost 会被强制提升到 MinCost.
func Hash(password string, cost int) (string, error) {
	if cost < MinCost {
		cost = MinCost
	}
	h, err := bcrypt.GenerateFromPassword([]byte(password), cost)
	if err != nil {
		return "", err
	}
	return string(h), nil
}

// Verify 返回 nil 通过, 否则 ErrMismatched 或 内部错误.
func Verify(hash, password string) error {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
		return ErrMismatched
	}
	return err
}

var ErrMismatched = errors.New("password mismatch")
