// Package config 读所有运行期配置. 部署侧必须显式给 DATABASE_URL / JWT_PUBLIC_KEY_PATH /
// S3_* / KAFKA_BROKERS. render-service (HTTP) 与 render-worker (kafka consumer)
// 共用同一 Config 结构, 字段缺省时仅相关角色启动会报错.

package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Env  string // local | dev | staging | prod
	Addr string // :8006

	DatabaseURL      string
	JWTPublicKeyPath string
	JWTIssuer        string

	S3Endpoint  string // http://minio:9000 (local) | https://s3.cn-north-1.amazonaws.com.cn (prod)
	S3AccessKey string
	S3SecretKey string
	S3Bucket    string
	S3Region    string

	KafkaBrokers       []string // host:port,host:port
	KafkaTopicRequested string  // render.requested
	KafkaConsumerGroup  string  // render-workers (worker only)

	// worker only
	WorkerID    string
	FfmpegBin   string // ffmpeg (PATH lookup) | /usr/bin/ffmpeg
	WorkDir     string // /tmp/render (worker 中间产物)

	CORSOrigins []string
}

func FromEnv() (Config, error) {
	c := Config{
		Env:                 getenv("ENV", "local"),
		Addr:                getenv("HTTP_ADDR", ":8006"),
		DatabaseURL:         os.Getenv("DATABASE_URL"),
		JWTPublicKeyPath:    os.Getenv("JWT_PUBLIC_KEY_PATH"),
		JWTIssuer:           getenv("JWT_ISSUER", "manju-auth"),
		S3Endpoint:          os.Getenv("S3_ENDPOINT"),
		S3AccessKey:         os.Getenv("S3_ACCESS_KEY"),
		S3SecretKey:         os.Getenv("S3_SECRET_KEY"),
		S3Bucket:            getenv("S3_BUCKET", "manju-renders"),
		S3Region:            getenv("S3_REGION", "us-east-1"),
		KafkaTopicRequested: getenv("KAFKA_TOPIC_REQUESTED", "render.requested"),
		KafkaConsumerGroup:  getenv("KAFKA_CONSUMER_GROUP", "render-workers"),
		WorkerID:            getenv("WORKER_ID", ""),
		FfmpegBin:           getenv("FFMPEG_BIN", "ffmpeg"),
		WorkDir:             getenv("WORK_DIR", "/tmp/render"),
	}

	brokersRaw := getenv("KAFKA_BROKERS", "localhost:9092")
	for _, b := range strings.Split(brokersRaw, ",") {
		if s := strings.TrimSpace(b); s != "" {
			c.KafkaBrokers = append(c.KafkaBrokers, s)
		}
	}

	if c.DatabaseURL == "" {
		return c, errors.New("DATABASE_URL is required")
	}
	if c.JWTPublicKeyPath == "" {
		return c, errors.New("JWT_PUBLIC_KEY_PATH is required (HTTP service); worker 可留空")
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

// ValidateService 校验 render-service (HTTP) 角色必要字段.
func (c Config) ValidateService() error {
	if err := c.Validate(); err != nil {
		return err
	}
	if c.S3Endpoint == "" || c.S3AccessKey == "" || c.S3SecretKey == "" {
		return errors.New("S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY required for service")
	}
	if len(c.KafkaBrokers) == 0 {
		return errors.New("KAFKA_BROKERS required for service")
	}
	return nil
}

// ValidateWorker 校验 render-worker 角色必要字段.
func (c Config) ValidateWorker() error {
	if err := c.Validate(); err != nil {
		return err
	}
	if c.S3Endpoint == "" || c.S3AccessKey == "" || c.S3SecretKey == "" {
		return errors.New("S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY required for worker")
	}
	if len(c.KafkaBrokers) == 0 {
		return errors.New("KAFKA_BROKERS required for worker")
	}
	if c.WorkerID == "" {
		return errors.New("WORKER_ID required (hostname-friendly id, e.g. render-w-1)")
	}
	return nil
}
