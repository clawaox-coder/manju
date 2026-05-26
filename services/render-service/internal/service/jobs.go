// Package service 在 repo 之上加业务规则:
//   - 输入校验 (resolution 白名单等)
//   - plan-tier → priority 映射 (架构 §5 渲染管线)
//   - kafka producer 发"render.requested" (m1: 留接口, kafka 接入由后续提交补)
//   - project 存在性 + team 归属校验 (FK 已强制 team-team 匹配 + project-team 匹配)

package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/manju-org/manju/services/render-service/internal/apperr"
	"github.com/manju-org/manju/services/render-service/internal/repo"
)

// Enqueuer 抽象 kafka producer, 让 service 单元易测.
type Enqueuer interface {
	Enqueue(ctx context.Context, msg EnqueueMessage) error
}

// EnqueueMessage 是 render.requested topic 的消息体.
type EnqueueMessage struct {
	JobID      string `json:"job_id"`
	TeamID     string `json:"team_id"`
	ProjectID  string `json:"project_id"`
	UserID     string `json:"user_id"`
	Priority   int16  `json:"priority"`
	Resolution string `json:"resolution,omitempty"`
	Format     string `json:"format,omitempty"`
	Preset     string `json:"preset,omitempty"`
}

// NoopEnqueuer 用于 dev/test 跳过 kafka. 仅记录调用, 不实际发出.
type NoopEnqueuer struct{}

func (NoopEnqueuer) Enqueue(_ context.Context, _ EnqueueMessage) error { return nil }

type Jobs struct {
	Repo *repo.Jobs
	Pool *pgxpool.Pool // 用于 project 存在性查询 (跨表)
	Enq  Enqueuer
}

func New(r *repo.Jobs, pool *pgxpool.Pool, enq Enqueuer) *Jobs {
	if enq == nil {
		enq = NoopEnqueuer{}
	}
	return &Jobs{Repo: r, Pool: pool, Enq: enq}
}

// ---- create ----

type CreateInput struct {
	ProjectID       string
	Resolution      string  // 720p|1080p|2k|4k
	Format          string  // mp4|mov|webm
	Preset          string  // 可选
	IncludeSubtitle bool
	Watermark       bool
	PlanTier        string // free|pro|team|enterprise — 决定 priority
	IdempotencyKey  string // 可空; 同 team + 非空 key 触发幂等
}

type CreateOutput struct {
	Job       *repo.Job
	Created   bool // false 表示 idempotency 命中已有 job
	QueuePos  int  // 排队位置 (m1 = 0; 后续 m2 从 kafka topic offset 算)
	EstimateS int  // 预估秒数 (m1 简单按 resolution 估)
}

var validResolutions = map[string]bool{"720p": true, "1080p": true, "2k": true, "4k": true}
var validFormats = map[string]bool{"mp4": true, "mov": true, "webm": true}

func (s *Jobs) Create(ctx context.Context, teamID, userID uuid.UUID, in CreateInput) (*CreateOutput, error) {
	projectID, err := uuid.Parse(in.ProjectID)
	if err != nil {
		return nil, apperr.InvalidInput("project_id 不是合法 UUID")
	}
	if !validResolutions[in.Resolution] {
		return nil, apperr.InvalidInput("resolution 不在 720p/1080p/2k/4k 之内").
			WithDetail("got", in.Resolution)
	}
	if !validFormats[in.Format] {
		return nil, apperr.InvalidInput("format 不在 mp4/mov/webm 之内").
			WithDetail("got", in.Format)
	}

	// 校验 project 存在且归属本 team. 用 RLS 上下文跑, 跨 team 查不到自然 404.
	if err := s.checkProjectInTeam(ctx, teamID, userID, projectID); err != nil {
		return nil, err
	}

	priority := planTierPriority(in.PlanTier)
	meta, _ := json.Marshal(map[string]any{
		"include_subtitle": in.IncludeSubtitle,
		"watermark":        in.Watermark,
	})
	preset := nilIfEmpty(in.Preset)
	resolution := nilIfEmpty(in.Resolution)
	format := nilIfEmpty(in.Format)
	idem := nilIfEmpty(strings.TrimSpace(in.IdempotencyKey))

	job, created, err := s.Repo.Create(ctx, teamID, userID, repo.CreateInput{
		ProjectID:      projectID,
		Priority:       priority,
		Preset:         preset,
		Resolution:     resolution,
		Format:         format,
		IdempotencyKey: idem,
		Metadata:       meta,
	})
	if err != nil {
		return nil, err
	}

	// 只有新建的 job 才发 kafka. 幂等命中已有 job 不重发.
	if created {
		if err := s.Enq.Enqueue(ctx, EnqueueMessage{
			JobID:      job.ID.String(),
			TeamID:     job.TeamID.String(),
			ProjectID:  job.ProjectID.String(),
			UserID:     job.UserID.String(),
			Priority:   job.Priority,
			Resolution: in.Resolution,
			Format:     in.Format,
			Preset:     in.Preset,
		}); err != nil {
			// kafka 发布失败 — m1: 不回滚 db, 让 worker 自己用 SELECT FOR UPDATE
			// 兜底拉. 但 m1 worker 走 kafka 不走 db, 所以这里失败需要明确返错.
			return nil, apperr.UpstreamFailed("入队失败").WithCause(err)
		}
	}

	return &CreateOutput{
		Job:       job,
		Created:   created,
		QueuePos:  0,
		EstimateS: estimateSeconds(in.Resolution),
	}, nil
}

// ---- get / list / cancel ----

func (s *Jobs) Get(ctx context.Context, teamID, userID, jobID uuid.UUID) (*repo.Job, error) {
	return s.Repo.Get(ctx, teamID, userID, jobID)
}

type ListInput struct {
	ProjectID string
	Cursor    string
	PageSize  int
}

func (s *Jobs) List(ctx context.Context, teamID, userID uuid.UUID, in ListInput) (*repo.ListResult, error) {
	opts := repo.ListOpts{PageSize: in.PageSize}
	if in.ProjectID != "" {
		pid, err := uuid.Parse(in.ProjectID)
		if err != nil {
			return nil, apperr.InvalidInput("project_id 不是合法 UUID")
		}
		opts.ProjectID = &pid
	}
	if in.Cursor != "" {
		c, err := repo.DecodeCursor(in.Cursor)
		if err != nil {
			return nil, err
		}
		opts.Cursor = c
	}
	return s.Repo.List(ctx, teamID, userID, opts)
}

func (s *Jobs) Cancel(ctx context.Context, teamID, userID, jobID uuid.UUID) error {
	return s.Repo.Cancel(ctx, teamID, userID, jobID)
}

// ---- helpers ----

func (s *Jobs) checkProjectInTeam(ctx context.Context, teamID, userID, projectID uuid.UUID) error {
	return s.Repo.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		var exists bool
		err := tx.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1)`, projectID,
		).Scan(&exists)
		if err != nil {
			return apperr.Internal("check project").WithCause(err)
		}
		if !exists {
			return apperr.ProjectNotFound()
		}
		return nil
	})
}

// planTierPriority 把 plan → priority. 架构 §5 渲染管线:
//   enterprise: p0 (priority=90)
//   team:       p1 (priority=70)
//   pro:        p2 (priority=50)
//   free:       p3 (priority=30)
func planTierPriority(plan string) int16 {
	switch plan {
	case "enterprise":
		return 90
	case "team":
		return 70
	case "pro":
		return 50
	case "free":
		return 30
	}
	return 50
}

// estimateSeconds 简单按分辨率粗估 (m1; 后续可接历史 p50 时长).
func estimateSeconds(resolution string) int {
	switch resolution {
	case "720p":
		return 30
	case "1080p":
		return 60
	case "2k":
		return 120
	case "4k":
		return 300
	}
	return 60
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// Sentinel: 让 errors.Is 在调用方便. 暂未对外暴露.
var _ = errors.New("unused sentinel placeholder")
