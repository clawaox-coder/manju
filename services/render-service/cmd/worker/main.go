// render-worker 入口. 装配 db pool + s3 + ffmpeg renderer + kafka reader,
// 跑消费循环, 等 SIGINT/SIGTERM 优雅关.

package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/manju-org/manju/services/render-service/internal/config"
	"github.com/manju-org/manju/services/render-service/internal/ffmpeg"
	rkafka "github.com/manju-org/manju/services/render-service/internal/kafka"
	"github.com/manju-org/manju/services/render-service/internal/logger"
	"github.com/manju-org/manju/services/render-service/internal/repo"
	"github.com/manju-org/manju/services/render-service/internal/s3util"
	"github.com/manju-org/manju/services/render-service/internal/worker"
)

func main() {
	cfg, err := config.FromEnv()
	if err != nil {
		_, _ = os.Stderr.WriteString("config: " + err.Error() + "\n")
		os.Exit(2)
	}
	if err := cfg.ValidateWorker(); err != nil {
		_, _ = os.Stderr.WriteString("config: " + err.Error() + "\n")
		os.Exit(2)
	}

	log := logger.New(cfg.Env)
	log.Info().Str("worker_id", cfg.WorkerID).Msg("starting render-worker")

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("pgxpool")
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatal().Err(err).Msg("postgres ping")
	}

	s3c, err := s3util.New(ctx, s3util.Config{
		Endpoint:        cfg.S3Endpoint,
		PresignEndpoint: cfg.S3PresignEndpoint,
		AccessKey:       cfg.S3AccessKey,
		SecretKey:       cfg.S3SecretKey,
		Bucket:          cfg.S3Bucket,
		Region:          cfg.S3Region,
	})
	if err != nil {
		log.Fatal().Err(err).Msg("s3 init")
	}
	if err := s3c.EnsureBucket(ctx); err != nil {
		log.Warn().Err(err).Str("bucket", cfg.S3Bucket).Msg("ensure bucket failed (will retry per job)")
	}

	repoJ := repo.New(pool)
	renderer := ffmpeg.New(cfg.FfmpegBin)

	// kafka writer 用于 fail 后 re-enqueue (重试)
	retryProducer := rkafka.NewProducer(cfg.KafkaBrokers, cfg.KafkaTopicRequested)
	defer func() { _ = retryProducer.Close() }()

	w := worker.New(worker.Deps{
		Log:      log,
		Repo:     repoJ,
		Pool:     pool,
		S3:       s3c,
		Renderer: renderer,
		Cfg:      cfg,
		Enqueuer: &workerEnqueuer{p: retryProducer},
	})

	if err := w.Run(ctx); err != nil {
		log.Error().Err(err).Msg("worker exit with error")
		os.Exit(1)
	}
	log.Info().Msg("bye")
}

// workerEnqueuer 适配 rkafka.Producer → worker.Enqueuer 接口.
type workerEnqueuer struct {
	p *rkafka.Producer
}

func (e *workerEnqueuer) Enqueue(ctx context.Context, key string, value []byte) error {
	return e.p.EnqueueRaw(ctx, key, value)
}
