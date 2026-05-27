// Package worker: kafka consumer + 单 job 状态机.
//
// 设计:
//   - kafka reader (consumer group=render-workers, 同 group 自动分 partition).
//   - 单 job 流程 (status 推进, 任一步骤失败标 failed):
//        running    → started_at=now, worker_id=$me
//        composing  → progress=30
//        encoding   → progress=60   (m1 与 composing 合一, 仍单独推一次以便前端追踪)
//        uploading  → progress=85
//        done       → progress=100, result_url, thumbnail_url, size_bytes, duration_ms, done_at
//   - 进入 running 之前先 SELECT 检查 status 是否已是 cancelled (用户在排队中取消) — 是则跳过.
//   - failure 后不重试 (m1; m2 接重试 1m/5m/15m by attempt 字段).

package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	kgo "github.com/segmentio/kafka-go"

	"github.com/manju-org/manju/services/render-service/internal/config"
	"github.com/manju-org/manju/services/render-service/internal/ffmpeg"
	"github.com/manju-org/manju/services/render-service/internal/repo"
	"github.com/manju-org/manju/services/render-service/internal/s3util"
)

type Deps struct {
	Log      zerolog.Logger
	Repo     *repo.Jobs
	S3       *s3util.Client
	Renderer Renderer
	Cfg      config.Config
	// Enqueuer 用于 fail 后 re-enqueue (重试). 由 cmd/worker 注入 kafka writer.
	Enqueuer Enqueuer
}

// Enqueuer 抽象 kafka 写入, 让 worker 可 re-enqueue 失败 job.
type Enqueuer interface {
	Enqueue(ctx context.Context, key string, value []byte) error
}

// Renderer 抽象 ffmpeg 调用, 让集成测试可注入 fake (不依赖 ffmpeg binary).
type Renderer interface {
	Render(ctx context.Context, in ffmpeg.RenderInput) (*ffmpeg.RenderOutput, error)
}

const maxAttempts = 3

type Worker struct {
	d      Deps
	reader *kgo.Reader
}

func New(d Deps) *Worker {
	var r *kgo.Reader
	if len(d.Cfg.KafkaBrokers) > 0 {
		r = kgo.NewReader(kgo.ReaderConfig{
			Brokers:        d.Cfg.KafkaBrokers,
			Topic:          d.Cfg.KafkaTopicRequested,
			GroupID:        d.Cfg.KafkaConsumerGroup,
			MinBytes:       1,
			MaxBytes:       10 << 20,
			CommitInterval: 0,
			StartOffset:    kgo.LastOffset,
		})
	}
	return &Worker{d: d, reader: r}
}

// msgPayload 与 service.EnqueueMessage 镜像. 不直接引用以避两包循环依赖.
type msgPayload struct {
	JobID      string `json:"job_id"`
	TeamID     string `json:"team_id"`
	ProjectID  string `json:"project_id"`
	UserID     string `json:"user_id"`
	Priority   int16  `json:"priority"`
	Resolution string `json:"resolution,omitempty"`
	Format     string `json:"format,omitempty"`
	Preset     string `json:"preset,omitempty"`
}

// Run 主循环. ctx 到 cancel 后返 nil; 读到 partition rebalance 等可恢复错时记录继续;
// reader.Close 失败返非 nil.
func (w *Worker) Run(ctx context.Context) error {
	defer func() { _ = w.reader.Close() }()

	w.d.Log.Info().
		Strs("brokers", w.d.Cfg.KafkaBrokers).
		Str("topic", w.d.Cfg.KafkaTopicRequested).
		Str("group", w.d.Cfg.KafkaConsumerGroup).
		Msg("kafka consumer ready")

	for {
		msg, err := w.reader.FetchMessage(ctx)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				return nil
			}
			w.d.Log.Error().Err(err).Msg("fetch message")
			continue
		}

		var p msgPayload
		if uerr := json.Unmarshal(msg.Value, &p); uerr != nil {
			w.d.Log.Error().Err(uerr).Str("raw", string(msg.Value)).Msg("invalid payload, skip")
			_ = w.reader.CommitMessages(ctx, msg)
			continue
		}

		log := w.d.Log.With().
			Str("job_id", p.JobID).
			Str("team_id", p.TeamID).
			Logger()

		if err := w.processJob(ctx, log, p); err != nil {
			log.Error().Err(err).Msg("process job failed")
			// 错误已在 processJob 内标 failed; 这里仅日志
		}
		if cerr := w.reader.CommitMessages(ctx, msg); cerr != nil {
			log.Error().Err(cerr).Msg("commit offset")
		}
	}
}

func (w *Worker) processJob(ctx context.Context, log zerolog.Logger, p msgPayload) error {
	teamID, err := uuid.Parse(p.TeamID)
	if err != nil {
		return fmt.Errorf("invalid team_id: %w", err)
	}
	userID, err := uuid.Parse(p.UserID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	jobID, err := uuid.Parse(p.JobID)
	if err != nil {
		return fmt.Errorf("invalid job_id: %w", err)
	}

	// 0. 拉 job 当前状态. cancelled 则跳过.
	cur, err := w.d.Repo.Get(ctx, teamID, userID, jobID)
	if err != nil {
		return fmt.Errorf("load job: %w", err)
	}
	if cur.Status.IsTerminal() {
		log.Info().Str("status", string(cur.Status)).Msg("job already terminal, skip")
		return nil
	}

	// backoff: attempt > 0 表示重试, 按指数退避 sleep.
	// 60s / 300s / 900s (1m / 5m / 15m). 超过 maxAttempts 在 fail() 内已标终态.
	if cur.Attempt > 0 {
		backoff := retryBackoff(int(cur.Attempt))
		log.Info().Int16("attempt", cur.Attempt).Dur("backoff", backoff).Msg("retry backoff")
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
	}

	workerID := w.d.Cfg.WorkerID
	now := time.Now().UTC()

	// 1. running
	if _, err := w.advance(ctx, teamID, userID, jobID, repo.UpdateStatusInput{
		Status:    repo.StatusRunning,
		Progress:  ptrInt16(5),
		Stage:     ptrStr("running"),
		WorkerID:  &workerID,
		StartedAt: &now,
	}); err != nil {
		return w.fail(ctx, teamID, userID, jobID, fmt.Errorf("set running: %w", err))
	}

	// 2. mkdir
	workDir := filepath.Join(w.d.Cfg.WorkDir, p.JobID)
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return w.fail(ctx, teamID, userID, jobID, fmt.Errorf("mkdir work: %w", err))
	}
	defer func() { _ = os.RemoveAll(workDir) }()

	// 3. composing → ffmpeg
	if _, err := w.advance(ctx, teamID, userID, jobID, repo.UpdateStatusInput{
		Status:   repo.StatusComposing,
		Progress: ptrInt16(30),
		Stage:    ptrStr("composing"),
	}); err != nil {
		return w.fail(ctx, teamID, userID, jobID, fmt.Errorf("set composing: %w", err))
	}

	out, err := w.d.Renderer.Render(ctx, ffmpeg.RenderInput{
		JobID:      p.JobID,
		Resolution: p.Resolution,
		Format:     p.Format,
		WorkDir:    workDir,
		Title:      "manju render " + p.JobID[:8],
	})
	if err != nil {
		return w.fail(ctx, teamID, userID, jobID, fmt.Errorf("ffmpeg: %w", err))
	}

	// 4. encoding (m1 与 composing 合并, 仍单独推一次便于前端 progress bar)
	if _, err := w.advance(ctx, teamID, userID, jobID, repo.UpdateStatusInput{
		Status:   repo.StatusEncoding,
		Progress: ptrInt16(60),
		Stage:    ptrStr("encoding"),
	}); err != nil {
		return w.fail(ctx, teamID, userID, jobID, fmt.Errorf("set encoding: %w", err))
	}

	// 5. uploading → s3
	if _, err := w.advance(ctx, teamID, userID, jobID, repo.UpdateStatusInput{
		Status:   repo.StatusUploading,
		Progress: ptrInt16(85),
		Stage:    ptrStr("uploading"),
	}); err != nil {
		return w.fail(ctx, teamID, userID, jobID, fmt.Errorf("set uploading: %w", err))
	}

	videoKey := fmt.Sprintf("renders/%s/%s/output.%s", p.TeamID, p.JobID, fmtExt(p.Format))
	thumbKey := fmt.Sprintf("renders/%s/%s/thumbnail.jpg", p.TeamID, p.JobID)
	sizeBytes, _, err := w.d.S3.PutFile(ctx, videoKey, out.VideoPath, mimeFor(p.Format))
	if err != nil {
		return w.fail(ctx, teamID, userID, jobID, fmt.Errorf("upload video: %w", err))
	}
	if _, _, err := w.d.S3.PutFile(ctx, thumbKey, out.ThumbnailPath, "image/jpeg"); err != nil {
		return w.fail(ctx, teamID, userID, jobID, fmt.Errorf("upload thumb: %w", err))
	}

	resultURL, err := w.d.S3.PresignGet(ctx, videoKey, 24*time.Hour)
	if err != nil {
		return w.fail(ctx, teamID, userID, jobID, fmt.Errorf("presign video: %w", err))
	}
	thumbURL, err := w.d.S3.PresignGet(ctx, thumbKey, 24*time.Hour)
	if err != nil {
		return w.fail(ctx, teamID, userID, jobID, fmt.Errorf("presign thumb: %w", err))
	}

	// 6. done
	doneAt := time.Now().UTC()
	if _, err := w.advance(ctx, teamID, userID, jobID, repo.UpdateStatusInput{
		Status:       repo.StatusDone,
		Progress:     ptrInt16(100),
		Stage:        ptrStr("done"),
		ResultURL:    &resultURL,
		ThumbnailURL: &thumbURL,
		SizeBytes:    &sizeBytes,
		DurationMs:   &out.DurationMs,
		DoneAt:       &doneAt,
	}); err != nil {
		return w.fail(ctx, teamID, userID, jobID, fmt.Errorf("set done: %w", err))
	}

	log.Info().
		Int64("size_bytes", sizeBytes).
		Int32("duration_ms", out.DurationMs).
		Msg("job done")
	return nil
}

func (w *Worker) advance(ctx context.Context, teamID, userID, jobID uuid.UUID, in repo.UpdateStatusInput) (*repo.Job, error) {
	return w.d.Repo.UpdateStatus(ctx, teamID, userID, jobID, in)
}

// RunSingle 暴露给集成测试: 直接跑单个 job (不经 kafka consume).
func (w *Worker) RunSingle(ctx context.Context, jobID, teamID, projectID, userID, resolution, format string, priority int16) error {
	log := w.d.Log.With().Str("job_id", jobID).Str("team_id", teamID).Logger()
	p := msgPayload{
		JobID:      jobID,
		TeamID:     teamID,
		ProjectID:  projectID,
		UserID:     userID,
		Priority:   priority,
		Resolution: resolution,
		Format:     format,
	}
	return w.processJob(ctx, log, p)
}

func (w *Worker) fail(ctx context.Context, teamID, userID, jobID uuid.UUID, cause error) error {
	msg := cause.Error()

	// 拉当前 attempt
	cur, _ := w.d.Repo.Get(ctx, teamID, userID, jobID)
	attempt := int16(0)
	if cur != nil {
		attempt = cur.Attempt
	}
	nextAttempt := attempt + 1

	if int(nextAttempt) < maxAttempts && w.d.Enqueuer != nil {
		// 可重试: 设 status='queued' + attempt+1, re-enqueue
		_, _ = w.d.Repo.UpdateStatus(ctx, teamID, userID, jobID, repo.UpdateStatusInput{
			Status:  repo.StatusQueued,
			Attempt: &nextAttempt,
			Error:   &msg,
		})
		payload, _ := json.Marshal(msgPayload{
			JobID:     jobID.String(),
			TeamID:    teamID.String(),
			UserID:    userID.String(),
			Priority:  0,
			Resolution: "",
			Format:    "",
		})
		if cur != nil {
			// 补全 payload 字段
			payload, _ = json.Marshal(msgPayload{
				JobID:      jobID.String(),
				TeamID:     teamID.String(),
				ProjectID:  cur.ProjectID.String(),
				UserID:     userID.String(),
				Priority:   cur.Priority,
				Resolution: ptrVal(cur.Resolution),
				Format:     ptrVal(cur.Format),
			})
		}
		if err := w.d.Enqueuer.Enqueue(ctx, teamID.String(), payload); err != nil {
			w.d.Log.Error().Err(err).Str("job_id", jobID.String()).Msg("re-enqueue failed, marking terminal")
			doneAt := time.Now().UTC()
			_, _ = w.d.Repo.UpdateStatus(ctx, teamID, userID, jobID, repo.UpdateStatusInput{
				Status: repo.StatusFailed,
				Error:  &msg,
				DoneAt: &doneAt,
			})
		} else {
			w.d.Log.Warn().
				Int16("attempt", nextAttempt).
				Str("job_id", jobID.String()).
				Msg("job failed, re-enqueued for retry")
		}
		return cause
	}

	// 终态: attempt >= maxAttempts 或无 enqueuer
	doneAt := time.Now().UTC()
	_, _ = w.d.Repo.UpdateStatus(ctx, teamID, userID, jobID, repo.UpdateStatusInput{
		Status:  repo.StatusFailed,
		Error:   &msg,
		DoneAt:  &doneAt,
		Attempt: &nextAttempt,
	})
	return cause
}

func ptrInt16(n int16) *int16 { return &n }
func ptrStr(s string) *string { return &s }

func ptrVal(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// retryBackoff 按 attempt 返退避时长: 1→60s, 2→300s, 3+→900s.
func retryBackoff(attempt int) time.Duration {
	switch attempt {
	case 1:
		return 60 * time.Second
	case 2:
		return 300 * time.Second
	default:
		return 900 * time.Second
	}
}

func fmtExt(format string) string {
	switch format {
	case "mov", "webm":
		return format
	}
	return "mp4"
}

func mimeFor(format string) string {
	switch format {
	case "mov":
		return "video/quicktime"
	case "webm":
		return "video/webm"
	}
	return "video/mp4"
}
