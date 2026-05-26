// Package repo 直接用 pgx 实现 render_jobs 表数据访问.
// 所有操作都包在 WithTeamCtx 事务里, 让 RLS 兜底跨 team 隔离 (database.md §6).

package repo

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/manju-org/manju/services/render-service/internal/apperr"
)

// ---- 枚举 ----

// JobStatus 与 migration 0001 中的 render_status enum 同步.
type JobStatus string

const (
	StatusQueued    JobStatus = "queued"
	StatusRunning   JobStatus = "running"
	StatusComposing JobStatus = "composing"
	StatusEncoding  JobStatus = "encoding"
	StatusUploading JobStatus = "uploading"
	StatusDone      JobStatus = "done"
	StatusFailed    JobStatus = "failed"
	StatusCancelled JobStatus = "cancelled"
)

func (s JobStatus) IsTerminal() bool {
	return s == StatusDone || s == StatusFailed || s == StatusCancelled
}

// ---- 模型 ----

// Job 是 render_jobs 行的 1:1 投影.
type Job struct {
	ID             uuid.UUID
	TeamID         uuid.UUID
	ProjectID      uuid.UUID
	UserID         uuid.UUID
	Status         JobStatus
	Progress       int16
	Stage          *string
	Priority       int16
	Preset         *string
	Resolution     *string
	Format         *string
	ResultURL      *string
	ThumbnailURL   *string
	SizeBytes      *int64
	DurationMs    *int32
	CostCredits    *int32
	Error          *string
	WorkerID       *string
	Attempt        int16
	IdempotencyKey *string
	QueuedAt       time.Time
	StartedAt      *time.Time
	DoneAt         *time.Time
	Metadata       json.RawMessage
}

// Cursor (queued_at, id) 复合游标 — 与 asset/script base64url({u, i}) 风格一致,
// 字段名沿用 u/i 不变 (前端可复用相同解码工具).
type Cursor struct {
	QueuedAt time.Time `json:"u"`
	ID       uuid.UUID `json:"i"`
}

func EncodeCursor(c Cursor) string {
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}

func DecodeCursor(s string) (*Cursor, error) {
	if s == "" {
		return nil, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, apperr.InvalidInput("cursor 解码失败").WithCause(err)
	}
	var c Cursor
	if err := json.Unmarshal(raw, &c); err != nil {
		return nil, apperr.InvalidInput("cursor 格式错误").WithCause(err)
	}
	return &c, nil
}

type ListOpts struct {
	ProjectID *uuid.UUID
	Status    *JobStatus
	Cursor    *Cursor
	PageSize  int
}

type ListResult struct {
	Items      []Job
	PageSize   int
	HasMore    bool
	NextCursor *Cursor
}

// ---- repo ----

type Jobs struct {
	Pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Jobs { return &Jobs{Pool: pool} }

// WithTeamCtx 在事务里 SET LOCAL app.team_id / app.user_id, 给 RLS 用.
func (r *Jobs) WithTeamCtx(ctx context.Context, teamID, userID uuid.UUID, fn func(pgx.Tx) error) error {
	tx, err := r.Pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return apperr.Internal("begin tx").WithCause(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "SELECT set_config('app.team_id', $1, true)", teamID.String()); err != nil {
		return apperr.Internal("set app.team_id").WithCause(err)
	}
	if _, err := tx.Exec(ctx, "SELECT set_config('app.user_id', $1, true)", userID.String()); err != nil {
		return apperr.Internal("set app.user_id").WithCause(err)
	}
	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return apperr.Internal("commit").WithCause(err)
	}
	return nil
}

const jobColumns = `id, team_id, project_id, user_id, status, progress, stage, priority,
	preset, resolution, format, result_url, thumbnail_url, size_bytes, duration_ms,
	cost_credits, error, worker_id, attempt, idempotency_key,
	queued_at, started_at, done_at, metadata`

func scanJob(row pgx.Row, j *Job) error {
	return row.Scan(
		&j.ID, &j.TeamID, &j.ProjectID, &j.UserID, &j.Status, &j.Progress, &j.Stage, &j.Priority,
		&j.Preset, &j.Resolution, &j.Format, &j.ResultURL, &j.ThumbnailURL, &j.SizeBytes, &j.DurationMs,
		&j.CostCredits, &j.Error, &j.WorkerID, &j.Attempt, &j.IdempotencyKey,
		&j.QueuedAt, &j.StartedAt, &j.DoneAt, &j.Metadata,
	)
}

// ---- create ----

type CreateInput struct {
	ProjectID      uuid.UUID
	Priority       int16  // 0-100, 越大越优先. 默认 50.
	Preset         *string
	Resolution     *string
	Format         *string
	IdempotencyKey *string
	Metadata       json.RawMessage
}

// Create 插入新 job. 若 idempotency_key 已存在 (同 team_id 同 key), 返已有 job
// (业务层据此判断是否 200 vs 201).
func (r *Jobs) Create(ctx context.Context, teamID, userID uuid.UUID, in CreateInput) (*Job, bool, error) {
	var j Job
	created := false
	priority := in.Priority
	if priority <= 0 {
		priority = 50
	}
	meta := in.Metadata
	if len(meta) == 0 {
		meta = json.RawMessage("{}")
	}

	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		// SAVEPOINT 包 INSERT — 撞 idempotency unique 时事务 ROLLBACK TO 即可继续 SELECT.
		// 不用 SAVEPOINT 直接 INSERT 撞 23505 会让整个事务 aborted (SQLSTATE 25P02).
		if _, err := tx.Exec(ctx, "SAVEPOINT sp_insert"); err != nil {
			return apperr.Internal("savepoint").WithCause(err)
		}
		row := tx.QueryRow(ctx,
			`INSERT INTO render_jobs
			   (team_id, project_id, user_id, priority, preset, resolution, format,
			    idempotency_key, metadata)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 RETURNING `+jobColumns,
			teamID, in.ProjectID, userID, priority, in.Preset, in.Resolution, in.Format,
			in.IdempotencyKey, meta,
		)
		if err := scanJob(row, &j); err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" && in.IdempotencyKey != nil {
				if _, e2 := tx.Exec(ctx, "ROLLBACK TO SAVEPOINT sp_insert"); e2 != nil {
					return apperr.Internal("rollback to savepoint").WithCause(e2)
				}
				row := tx.QueryRow(ctx,
					`SELECT `+jobColumns+` FROM render_jobs
					 WHERE team_id = $1 AND idempotency_key = $2
					 ORDER BY queued_at DESC LIMIT 1`,
					teamID, *in.IdempotencyKey,
				)
				return scanJob(row, &j)
			}
			return apperr.Internal("create render_job").WithCause(err)
		}
		if _, err := tx.Exec(ctx, "RELEASE SAVEPOINT sp_insert"); err != nil {
			return apperr.Internal("release savepoint").WithCause(err)
		}
		created = true
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return &j, created, nil
}

// ---- get ----

func (r *Jobs) Get(ctx context.Context, teamID, userID, jobID uuid.UUID) (*Job, error) {
	var j Job
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `SELECT `+jobColumns+` FROM render_jobs WHERE id = $1`, jobID)
		if err := scanJob(row, &j); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apperr.RenderJobNotFound()
			}
			return apperr.Internal("get render_job").WithCause(err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &j, nil
}

// ---- list (cursor 分页) ----

func (r *Jobs) List(ctx context.Context, teamID, userID uuid.UUID, opts ListOpts) (*ListResult, error) {
	pageSize := opts.PageSize
	if pageSize <= 0 || pageSize > 200 {
		pageSize = 50
	}

	// 构 WHERE 子句. RLS 会自动加 team_id 过滤, 应用层不重复.
	where := []string{}
	args := []any{}
	idx := 1
	addArg := func(v any) string {
		args = append(args, v)
		s := "$"
		// 简易 placeholder 生成
		switch idx {
		case 1:
			s = "$1"
		case 2:
			s = "$2"
		case 3:
			s = "$3"
		case 4:
			s = "$4"
		case 5:
			s = "$5"
		case 6:
			s = "$6"
		default:
			panic("too many args")
		}
		idx++
		return s
	}
	if opts.ProjectID != nil {
		where = append(where, "project_id = "+addArg(*opts.ProjectID))
	}
	if opts.Status != nil {
		where = append(where, "status = "+addArg(string(*opts.Status)))
	}
	if opts.Cursor != nil {
		// (queued_at, id) < cursor — DESC 排序意义下"更早的"
		p1 := addArg(opts.Cursor.QueuedAt)
		p2 := addArg(opts.Cursor.ID)
		where = append(where, "(queued_at, id) < ("+p1+", "+p2+")")
	}
	whereSQL := ""
	if len(where) > 0 {
		whereSQL = "WHERE " + joinAnd(where)
	}

	limit := pageSize + 1
	q := `SELECT ` + jobColumns + ` FROM render_jobs ` + whereSQL +
		` ORDER BY queued_at DESC, id DESC LIMIT ` + itoa(limit)

	var items []Job
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, q, args...)
		if err != nil {
			return apperr.Internal("list render_jobs").WithCause(err)
		}
		defer rows.Close()
		for rows.Next() {
			var j Job
			if err := scanJob(rows, &j); err != nil {
				return apperr.Internal("scan render_job").WithCause(err)
			}
			items = append(items, j)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}

	hasMore := false
	var next *Cursor
	if len(items) > pageSize {
		hasMore = true
		last := items[pageSize-1]
		next = &Cursor{QueuedAt: last.QueuedAt, ID: last.ID}
		items = items[:pageSize]
	}
	if items == nil {
		items = []Job{}
	}
	return &ListResult{
		Items:      items,
		PageSize:   pageSize,
		HasMore:    hasMore,
		NextCursor: next,
	}, nil
}

// ---- cancel ----

// Cancel 设 status='cancelled' + done_at=now. 已 done/failed/cancelled 的 job 返
// CONFLICT (终态不可改). worker 拉到队列后看 status=cancelled 应跳过.
func (r *Jobs) Cancel(ctx context.Context, teamID, userID, jobID uuid.UUID) error {
	return r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx,
			`UPDATE render_jobs SET status='cancelled', done_at=now()
			 WHERE id=$1 AND status NOT IN ('done','failed','cancelled')`,
			jobID,
		)
		if err != nil {
			return apperr.Internal("cancel render_job").WithCause(err)
		}
		if tag.RowsAffected() == 0 {
			// 区分两种: 任务不存在 vs 已终态
			var status JobStatus
			row := tx.QueryRow(ctx, `SELECT status FROM render_jobs WHERE id=$1`, jobID)
			if err := row.Scan(&status); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return apperr.RenderJobNotFound()
				}
				return apperr.Internal("check job status").WithCause(err)
			}
			return apperr.Conflict("任务已是终态, 无法取消").
				WithDetail("status", string(status))
		}
		return nil
	})
}

// ---- worker 用: 推进状态机 ----

type UpdateStatusInput struct {
	Status       JobStatus
	Progress     *int16
	Stage        *string
	WorkerID     *string
	Error        *string
	ResultURL    *string
	ThumbnailURL *string
	SizeBytes    *int64
	DurationMs  *int32
	StartedAt    *time.Time
	DoneAt       *time.Time
	Attempt      *int16
}

// UpdateStatus 推进 job 状态. worker 调用时通常带 team_id (从 kafka payload 拿).
// 注意: 终态后再 Update 会被 RLS 允许 (没禁), 业务层应保证 worker 不重复推送.
func (r *Jobs) UpdateStatus(ctx context.Context, teamID, userID, jobID uuid.UUID, in UpdateStatusInput) (*Job, error) {
	var j Job
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx,
			`UPDATE render_jobs SET
			   status        = COALESCE($2, status),
			   progress      = COALESCE($3, progress),
			   stage         = COALESCE($4, stage),
			   worker_id     = COALESCE($5, worker_id),
			   error         = COALESCE($6, error),
			   result_url    = COALESCE($7, result_url),
			   thumbnail_url = COALESCE($8, thumbnail_url),
			   size_bytes    = COALESCE($9, size_bytes),
			   duration_ms   = COALESCE($10, duration_ms),
			   started_at    = COALESCE($11, started_at),
			   done_at       = COALESCE($12, done_at),
			   attempt       = COALESCE($13, attempt)
			 WHERE id = $1
			 RETURNING `+jobColumns,
			jobID, in.Status, in.Progress, in.Stage, in.WorkerID, in.Error,
			in.ResultURL, in.ThumbnailURL, in.SizeBytes, in.DurationMs,
			in.StartedAt, in.DoneAt, in.Attempt,
		)
		if err := scanJob(row, &j); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apperr.RenderJobNotFound()
			}
			return apperr.Internal("update render_job").WithCause(err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &j, nil
}

// 小工具

func joinAnd(parts []string) string {
	s := ""
	for i, p := range parts {
		if i > 0 {
			s += " AND "
		}
		s += p
	}
	return s
}

func itoa(n int) string {
	// 简单整数转字符串, 避免引入 fmt.Sprintf 的小成本.
	if n == 0 {
		return "0"
	}
	neg := false
	if n < 0 {
		neg = true
		n = -n
	}
	buf := make([]byte, 0, 12)
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	if neg {
		buf = append([]byte{'-'}, buf...)
	}
	return string(buf)
}
