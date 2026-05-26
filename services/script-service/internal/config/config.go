// Package config 读所有运行期配置.

package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Env  string
	Addr string

	DatabaseURL      string
	JWTPublicKeyPath string
	JWTIssuer        string

	CORSOrigins []string
}

func FromEnv() (Config, error) {
	c := Config{
		Env:              getenv("ENV", "local"),
		Addr:             getenv("HTTP_ADDR", ":8003"),
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		JWTPublicKeyPath: os.Getenv("JWT_PUBLIC_KEY_PATH"),
		JWTIssuer:        getenv("JWT_ISSUER", "manju-auth"),
	}

	if c.DatabaseURL == "" {
		return c, errors.New("DATABASE_URL is required")
	}
	if c.JWTPublicKeyPath == "" {
		return c, errors.New("JWT_PUBLIC_KEY_PATH is required")
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

func (c Config) Validate() error {
	if c.Env != "local" && c.Env != "dev" && c.Env != "staging" && c.Env != "prod" {
		return fmt.Errorf("invalid ENV=%q", c.Env)
	}
	return nil
}
