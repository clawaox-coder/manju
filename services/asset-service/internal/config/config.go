// Package config 读所有运行期配置. 部署侧必须显式给 DATABASE_URL / JWT_PUBLIC_KEY_PATH / S3_*.

package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Env  string // local | dev | staging | prod
	Addr string // :8004

	DatabaseURL      string
	JWTPublicKeyPath string
	JWTIssuer        string

	S3Endpoint  string // http://minio:9000 (local) | https://s3.cn-north-1.amazonaws.com.cn (prod)
	S3AccessKey string
	S3SecretKey string
	S3Bucket    string
	S3Region    string

	CORSOrigins []string
}

func FromEnv() (Config, error) {
	c := Config{
		Env:              getenv("ENV", "local"),
		Addr:             getenv("HTTP_ADDR", ":8004"),
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		JWTPublicKeyPath: os.Getenv("JWT_PUBLIC_KEY_PATH"),
		JWTIssuer:        getenv("JWT_ISSUER", "manju-auth"),
		S3Endpoint:       os.Getenv("S3_ENDPOINT"),
		S3AccessKey:      os.Getenv("S3_ACCESS_KEY"),
		S3SecretKey:      os.Getenv("S3_SECRET_KEY"),
		S3Bucket:         getenv("S3_BUCKET", "manju-assets"),
		S3Region:         getenv("S3_REGION", "us-east-1"),
	}

	if c.DatabaseURL == "" {
		return c, errors.New("DATABASE_URL is required")
	}
	if c.JWTPublicKeyPath == "" {
		return c, errors.New("JWT_PUBLIC_KEY_PATH is required")
	}
	if c.S3Endpoint == "" {
		return c, errors.New("S3_ENDPOINT is required")
	}
	if c.S3AccessKey == "" || c.S3SecretKey == "" {
		return c, errors.New("S3_ACCESS_KEY / S3_SECRET_KEY are required")
	}

	corsRaw := getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:4173,http://localhost:3000")
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
