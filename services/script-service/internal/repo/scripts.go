// Package repo 直接用 pgx 实现数据访问. 所有操作都包在 WithTeamCtx 事务里, 让 RLS 兜底.

package repo

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/manju-org/manju/services/script-service/internal/apperr"
)

// ---- 共用 tx helper ----

// WithTeamCtx 在事务里 SET LOCAL app.team_id / app.user_id, 给 RLS 用. 所有读写都应走这里.
func withTeamCtx(ctx context.Context, pool *pgxpool.Pool, teamID, userID uuid.UUID, fn func(pgx.Tx) error) error {
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
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

// ---- scripts ----

type Script struct {
	ProjectID  uuid.UUID
	Content    string
	Format     string
	WordCount  int32
	SceneCount int16
	UpdatedBy  *uuid.UUID
	UpdatedAt  time.Time
	VersionNo  int32
}

type Scripts struct {
	Pool *pgxpool.Pool
}

func NewScripts(pool *pgxpool.Pool) *Scripts { return &Scripts{Pool: pool} }

const scriptColumns = `project_id, content, format, word_count, scene_count, updated_by, updated_at, version_no`

func scanScript(row pgx.Row, s *Script) error {
	return row.Scan(
		&s.ProjectID, &s.Content, &s.Format, &s.WordCount, &s.SceneCount,
		&s.UpdatedBy, &s.UpdatedAt, &s.VersionNo,
	)
}

// projectVisible: 在当前 RLS 上下文里, 能否 SELECT 这个 project_id?
// 用 EXISTS projects 子查询. RLS 会让 projects 的 SELECT 只返回当前 team 可见的行,
// 因此这里实际语义是 "本 team 拥有此 project 或参与共享".
func projectVisible(ctx context.Context, tx pgx.Tx, projectID uuid.UUID) (bool, error) {
	var ok bool
	err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1)`, projectID).Scan(&ok)
	return ok, err
}

// GetOrCreate: 1:1 with projects, 第一次读自动建空 script.
// 不可见 (跨 team 或 project 不存在) → ProjectNotFound.
func (r *Scripts) GetOrCreate(ctx context.Context, teamID, userID, projectID uuid.UUID) (*Script, error) {
	var s Script
	err := withTeamCtx(ctx, r.Pool, teamID, userID, func(tx pgx.Tx) error {
		visible, err := projectVisible(ctx, tx, projectID)
		if err != nil {
			return apperr.Internal("check project").WithCause(err)
		}
		if !visible {
			return apperr.ProjectNotFound()
		}

		row := tx.QueryRow(ctx, `SELECT `+scriptColumns+` FROM scripts WHERE project_id = $1`, projectID)
		if err := scanScript(row, &s); err == nil {
			return nil
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return mapDBError(err, "get script")
		}
		// 不存在 → INSERT (RLS 不限 INSERT, 但 EXISTS 已确认可见)
		row = tx.QueryRow(ctx,
			`INSERT INTO scripts (project_id, content, updated_by) VALUES ($1, '', $2)
			 RETURNING `+scriptColumns,
			projectID, userID,
		)
		return scanScript(row, &s)
	})
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// PutInput 携带新 content + 期望 version_no (乐观锁).
type PutScriptInput struct {
	Content           string
	ExpectedVersionNo int32
}

// Put: 乐观锁更新 + 同事务在 script_versions 写一条快照.
// 计算 word_count / scene_count / size_bytes 由 service 层提供 (因为算法可能演变).
type PutComputed struct {
	WordCount  int32
	SceneCount int16
	SizeBytes  int32
	// 可选 yjs delta — T-008 不写, 留 nil
	Delta []byte
	// shots_snapshot — service 层从 shots 表当前态读出来塞进去
	ShotsSnapshot json.RawMessage
}

// Put 执行乐观锁更新, 失败返回 VersionConflict (含 current_version_no 信息).
// 同事务写一条 script_versions 历史 (version_no = new).
func (r *Scripts) Put(ctx context.Context, teamID, userID, projectID uuid.UUID, in PutScriptInput, comp PutComputed) (*Script, error) {
	var s Script
	err := withTeamCtx(ctx, r.Pool, teamID, userID, func(tx pgx.Tx) error {
		// 先取当前 version_no, 给冲突时返回 detail.
		var current int32
		err := tx.QueryRow(ctx,
			`SELECT version_no FROM scripts WHERE project_id = $1`, projectID,
		).Scan(&current)
		if errors.Is(err, pgx.ErrNoRows) {
			// scripts 行还没创建 — 上层应先 GetOrCreate
			return apperr.ScriptNotFound()
		}
		if err != nil {
			return mapDBError(err, "lookup script version")
		}
		if current != in.ExpectedVersionNo {
			return apperr.VersionConflict(int(current), int(in.ExpectedVersionNo))
		}

		// 更新 scripts: version_no = current + 1
		newVersion := current + 1
		row := tx.QueryRow(ctx,
			`UPDATE scripts SET
			   content = $1,
			   word_count = $2,
			   scene_count = $3,
			   updated_by = $4,
			   updated_at = now(),
			   version_no = $5
			 WHERE project_id = $6 AND version_no = $7
			 RETURNING `+scriptColumns,
			in.Content, comp.WordCount, comp.SceneCount, userID, newVersion, projectID, in.ExpectedVersionNo,
		)
		if err := scanScript(row, &s); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				// 罕见: 在两次 query 之间被改了. 当冲突处理.
				return apperr.VersionConflict(int(current), int(in.ExpectedVersionNo))
			}
			return mapDBError(err, "update script")
		}

		// 写历史快照
		snapshot := comp.ShotsSnapshot
		if len(snapshot) == 0 {
			snapshot = json.RawMessage("[]")
		}
		_, err = tx.Exec(ctx,
			`INSERT INTO script_versions
			   (project_id, version_no, content, delta, shots_snapshot, word_count, scene_count, size_bytes, created_by)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			projectID, newVersion, in.Content, comp.Delta, snapshot,
			comp.WordCount, comp.SceneCount, comp.SizeBytes, userID,
		)
		if err != nil {
			return mapDBError(err, "write version snapshot")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// ---- script_versions ----

type ScriptVersion struct {
	ID            uuid.UUID
	ProjectID     uuid.UUID
	VersionNo     int32
	Content       string
	ShotsSnapshot json.RawMessage
	WordCount     int32
	SceneCount    int16
	SizeBytes     int32
	CreatedBy     *uuid.UUID
	CreatedAt     time.Time
}

type ScriptVersions struct {
	Pool *pgxpool.Pool
}

func NewScriptVersions(pool *pgxpool.Pool) *ScriptVersions { return &ScriptVersions{Pool: pool} }

const versionColumns = `id, project_id, version_no, content, shots_snapshot, word_count, scene_count, size_bytes, created_by, created_at`

func scanVersion(row pgx.Row, v *ScriptVersion) error {
	return row.Scan(
		&v.ID, &v.ProjectID, &v.VersionNo, &v.Content, &v.ShotsSnapshot,
		&v.WordCount, &v.SceneCount, &v.SizeBytes, &v.CreatedBy, &v.CreatedAt,
	)
}

// List 按 version_no DESC 返回, 上限 200 个.
func (r *ScriptVersions) List(ctx context.Context, teamID, userID, projectID uuid.UUID, limit int) ([]ScriptVersion, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var items []ScriptVersion
	err := withTeamCtx(ctx, r.Pool, teamID, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT `+versionColumns+` FROM script_versions
			 WHERE project_id = $1
			 ORDER BY version_no DESC
			 LIMIT $2`,
			projectID, limit,
		)
		if err != nil {
			return mapDBError(err, "list versions")
		}
		defer rows.Close()
		for rows.Next() {
			var v ScriptVersion
			if err := scanVersion(rows, &v); err != nil {
				return mapDBError(err, "scan version")
			}
			items = append(items, v)
		}
		return rows.Err()
	})
	return items, err
}

func (r *ScriptVersions) GetByNo(ctx context.Context, teamID, userID, projectID uuid.UUID, versionNo int32) (*ScriptVersion, error) {
	var v ScriptVersion
	err := withTeamCtx(ctx, r.Pool, teamID, userID, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx,
			`SELECT `+versionColumns+` FROM script_versions
			 WHERE project_id = $1 AND version_no = $2`,
			projectID, versionNo,
		)
		return scanVersion(row, &v)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.VersionNotFound()
		}
		return nil, err
	}
	return &v, nil
}

// ---- helpers ----

func mapDBError(err error, ctx string) error {
	if apperr.As(err) != nil {
		return err
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	return apperr.Internal(ctx).WithCause(err)
}
