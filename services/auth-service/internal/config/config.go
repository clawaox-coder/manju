// Package config 读所有运行期配置 (环境变量 + 文件 path).
// 没有 defaults 兜底 (除了端口) — 部署侧必须显式给值.

package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Env  string // local | dev | staging | prod
	Addr string // :8001

	DatabaseURL string
	RedisURL    string

	JWTPrivateKeyPath string
	JWTPublicKeyPath  string
	JWTAccessTTL      time.Duration
	JWTRefreshTTL     time.Duration
	JWTIssuer         string

	BcryptCost int

	LoginRatePer5Min    int
	RegisterRatePerHour int

	CORSOrigins []string
}

func FromEnv() (Config, error) {
	c := Config{
		Env:                 getenv("ENV", "local"),
		Addr:                getenv("HTTP_ADDR", ":8001"),
		DatabaseURL:         os.Getenv("DATABASE_URL"),
		RedisURL:            os.Getenv("REDIS_URL"),
		JWTPrivateKeyPath:   os.Getenv("JWT_PRIVATE_KEY_PATH"),
		JWTPublicKeyPath:    os.Getenv("JWT_PUBLIC_KEY_PATH"),
		JWTIssuer:           getenv("JWT_ISSUER", "manju-auth"),
	}

	var err error
	if c.JWTAccessTTL, err = parseDuration("JWT_ACCESS_TTL", "15m"); err != nil {
		return c, err
	}
	if c.JWTRefreshTTL, err = parseDuration("JWT_REFRESH_TTL", "720h"); err != nil {
		return c, err
	}
	if c.BcryptCost, err = parseInt("BCRYPT_COST", 12); err != nil {
		return c, err
	}
	if c.LoginRatePer5Min, err = parseInt("LOGIN_RATE_PER_5MIN", 5); err != nil {
		return c, err
	}
	if c.RegisterRatePerHour, err = parseInt("REGISTER_RATE_PER_HOUR", 3); err != nil {
		return c, err
	}

	if c.DatabaseURL == "" {
		return c, errors.New("DATABASE_URL is required")
	}
	if c.RedisURL == "" {
		return c, errors.New("REDIS_URL is required")
	}
	if c.JWTPrivateKeyPath == "" || c.JWTPublicKeyPath == "" {
		return c, errors.New("JWT_PRIVATE_KEY_PATH and JWT_PUBLIC_KEY_PATH are required")
	}

	corsRaw := getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:3000")
	for _, o := range strings.Split(corsRaw, ",") {
		if s := strings.TrimSpace(o); s != "" {
			c.CORSOrigins = append(c.CORSOrigins, s)
		}
	}

	return c, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseDuration(key, fallback string) (time.Duration, error) {
	raw := getenv(key, fallback)
	d, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid %s=%q: %w", key, raw, err)
	}
	return d, nil
}

func parseInt(key string, fallback int) (int, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("invalid %s=%q: %w", key, raw, err)
	}
	return n, nil
}
