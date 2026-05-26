// Package repo 直接用 pgx 实现数据访问. 所有操作都包在 WithTeamCtx 事务里,
// 让 RLS 兜底跨 team 隔离 (database.md §6).

package repo

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/manju-org/manju/services/project-service/internal/apperr"
)

// ---- types ----

type Project struct {
	ID           uuid.UUID
	TeamID       uuid.UUID
	OwnerID      uuid.UUID
	Name         string
	Genre        *string
	Status       string
	Progress     int16
	Version      string
	ThumbnailURL *string
	BgStyle      *string
	Metadata     json.RawMessage
	DeletedAt    *time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type Cursor struct {
	UpdatedAt time.Time `json:"u"`
	ID        uuid.UUID `json:"i"`
}

type ListOpts struct {
	Status   string  // "" = 不过滤
	Genre    string  // ""
	Q        string  // ""
	Cursor   *Cursor // nil = first page
	PageSize int     // 1..100
	Scope    string  // "all" (默认) | "mine"
}

type ListResult struct {
	Items      []Project
	PageSize   int
	HasMore    bool
	NextCursor *Cursor
}

// ---- repo struct ----

type Projects struct {
	Pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Projects {
	return &Projects{Pool: pool}
}

// WithTeamCtx 在事务里 SET LOCAL app.team_id / app.user_id, 给 RLS 用.
// 所有读写都应走这里, 不要直接拿 pool 查.
func (r *Projects) WithTeamCtx(ctx context.Context, teamID, userID uuid.UUID, fn func(pgx.Tx) error) error {
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

// ---- single-row ops ----

const projectColumns = `id, team_id, owner_id, name, genre, status, progress, version,
	thumbnail_url, bg_style, metadata, deleted_at, created_at, updated_at`

func scanProject(row pgx.Row, p *Project) error {
	return row.Scan(
		&p.ID, &p.TeamID, &p.OwnerID, &p.Name, &p.Genre, &p.Status,
		&p.Progress, &p.Version, &p.ThumbnailURL, &p.BgStyle, &p.Metadata,
		&p.DeletedAt, &p.CreatedAt, &p.UpdatedAt,
	)
}

type CreateInput struct {
	Name     string
	Genre    *string
	Metadata json.RawMessage
}

func (r *Projects) Create(ctx context.Context, teamID, userID uuid.UUID, in CreateInput) (*Project, error) {
	var p Project
	meta := in.Metadata
	if len(meta) == 0 {
		meta = json.RawMessage("{}")
	}
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx,
			`INSERT INTO projects (team_id, owner_id, name, genre, status, metadata)
			 VALUES ($1, $2, $3, $4, 'draft', $5)
			 RETURNING `+projectColumns,
			teamID, userID, in.Name, in.Genre, meta,
		)
		return scanProject(row, &p)
	})
	if err != nil {
		return nil, mapDBError(err, "create project")
	}
	return &p, nil
}

func (r *Projects) GetByID(ctx context.Context, teamID, userID, id uuid.UUID) (*Project, error) {
	var p Project
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx,
			`SELECT `+projectColumns+` FROM projects
			 WHERE id = $1 AND deleted_at IS NULL`, id,
		)
		return scanProject(row, &p)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.ProjectNotFound()
		}
		return nil, mapDBError(err, "get project")
	}
	return &p, nil
}

type UpdateInput struct {
	Name  *string // nil = 不改
	Genre *string // 注意: 这里嵌套了语义 — pointer-to-pointer 用 PatchInput 包一层更清晰, 但项目里 patch 只支持 name/genre, 简化处理.
}

// PatchFields: name / genre 只支持显式给定 (nil 表示不变).
// genre 想清空需要传 ""? 看 api.md §7.2 PATCH body: { name?, genre? }, genre 可 null.
// 此处 UpdateInput.Genre 用 (set bool, val *string) 二元组太啰嗦; 实际 handler 层用 map[string]any 解析,
// 由 service.Update 直接把 set map 传下来. 见下 PatchSet.
type PatchSet struct {
	Name  *string
	Genre *string // 即使 nil 也可能"想清空", 用 GenreTouched 标志
	GenreTouched bool
}

func (r *Projects) Patch(ctx context.Context, teamID, userID, id uuid.UUID, set PatchSet) (*Project, error) {
	if set.Name == nil && !set.GenreTouched {
		return r.GetByID(ctx, teamID, userID, id)
	}

	clauses := []string{}
	args := []any{}
	idx := 1
	if set.Name != nil {
		clauses = append(clauses, fmt.Sprintf("name = $%d", idx))
		args = append(args, *set.Name)
		idx++
	}
	if set.GenreTouched {
		clauses = append(clauses, fmt.Sprintf("genre = $%d", idx))
		args = append(args, set.Genre)
		idx++
	}
	args = append(args, id)

	var p Project
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, fmt.Sprintf(
			`UPDATE projects SET %s WHERE id = $%d AND deleted_at IS NULL RETURNING %s`,
			strings.Join(clauses, ", "), idx, projectColumns,
		), args...)
		return scanProject(row, &p)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.ProjectNotFound()
		}
		return nil, mapDBError(err, "patch project")
	}
	return &p, nil
}

func (r *Projects) Duplicate(ctx context.Context, teamID, userID, id uuid.UUID) (*Project, error) {
	var p Project
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		var orig Project
		row := tx.QueryRow(ctx,
			`SELECT `+projectColumns+` FROM projects WHERE id = $1 AND deleted_at IS NULL`, id,
		)
		if err := scanProject(row, &orig); err != nil {
			return err
		}
		newName := orig.Name + " (副本)"
		row = tx.QueryRow(ctx,
			`INSERT INTO projects (team_id, owner_id, name, genre, status, bg_style, thumbnail_url, metadata)
			 VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7)
			 RETURNING `+projectColumns,
			teamID, userID, newName, orig.Genre, orig.BgStyle, orig.ThumbnailURL, orig.Metadata,
		)
		return scanProject(row, &p)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.ProjectNotFound()
		}
		return nil, mapDBError(err, "duplicate project")
	}
	return &p, nil
}

func (r *Projects) SoftDelete(ctx context.Context, teamID, userID, id uuid.UUID) error {
	return r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`UPDATE projects SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, id,
		)
		if err != nil {
			return mapDBError(err, "soft-delete project")
		}
		if ct.RowsAffected() == 0 {
			return apperr.ProjectNotFound()
		}
		return nil
	})
}

func (r *Projects) Restore(ctx context.Context, teamID, userID, id uuid.UUID) (*Project, error) {
	var p Project
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx,
			`UPDATE projects SET deleted_at = NULL
			 WHERE id = $1 AND deleted_at IS NOT NULL
			 RETURNING `+projectColumns, id,
		)
		return scanProject(row, &p)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.ProjectNotFound()
		}
		return nil, mapDBError(err, "restore project")
	}
	return &p, nil
}

func (r *Projects) Purge(ctx context.Context, teamID, userID, id uuid.UUID) error {
	return r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`DELETE FROM projects WHERE id = $1 AND deleted_at IS NOT NULL`, id,
		)
		if err != nil {
			return mapDBError(err, "purge project")
		}
		if ct.RowsAffected() == 0 {
			return apperr.ProjectNotFound()
		}
		return nil
	})
}

// ---- list (with cursor pagination + filters) ----

func (r *Projects) List(ctx context.Context, teamID, userID uuid.UUID, opts ListOpts) (*ListResult, error) {
	pageSize := clamp(opts.PageSize, 1, 100)
	if pageSize == 0 {
		pageSize = 20
	}

	clauses := []string{"deleted_at IS NULL"}
	args := []any{}
	idx := 1

	if opts.Status != "" {
		clauses = append(clauses, fmt.Sprintf("status = $%d", idx))
		args = append(args, opts.Status)
		idx++
	}
	if opts.Genre != "" {
		clauses = append(clauses, fmt.Sprintf("genre = $%d", idx))
		args = append(args, opts.Genre)
		idx++
	}
	if opts.Q != "" {
		clauses = append(clauses, fmt.Sprintf("name ILIKE $%d", idx))
		args = append(args, "%"+opts.Q+"%")
		idx++
	}
	if opts.Scope == "mine" {
		clauses = append(clauses, fmt.Sprintf("team_id = $%d", idx))
		args = append(args, teamID)
		idx++
	}
	if opts.Cursor != nil {
		clauses = append(clauses, fmt.Sprintf("(updated_at < $%d OR (updated_at = $%d AND id < $%d))", idx, idx, idx+1))
		args = append(args, opts.Cursor.UpdatedAt, opts.Cursor.ID)
		idx += 2
	}

	args = append(args, pageSize+1)
	sql := fmt.Sprintf(
		`SELECT %s FROM projects WHERE %s ORDER BY updated_at DESC, id DESC LIMIT $%d`,
		projectColumns, strings.Join(clauses, " AND "), idx,
	)

	return r.runList(ctx, teamID, userID, sql, args, pageSize, useUpdatedAtCursor)
}

func (r *Projects) ListShared(ctx context.Context, teamID, userID uuid.UUID, cursor *Cursor, pageSize int) (*ListResult, error) {
	pageSize = clamp(pageSize, 1, 100)
	if pageSize == 0 {
		pageSize = 20
	}

	clauses := []string{
		"p.deleted_at IS NULL",
		"EXISTS (SELECT 1 FROM project_collaborators c WHERE c.project_id = p.id AND c.user_id = $1)",
	}
	args := []any{userID}
	idx := 2

	if cursor != nil {
		clauses = append(clauses, fmt.Sprintf("(p.updated_at < $%d OR (p.updated_at = $%d AND p.id < $%d))", idx, idx, idx+1))
		args = append(args, cursor.UpdatedAt, cursor.ID)
		idx += 2
	}

	args = append(args, pageSize+1)
	cols := qualify("p", projectColumns)
	sql := fmt.Sprintf(
		`SELECT %s FROM projects p WHERE %s ORDER BY p.updated_at DESC, p.id DESC LIMIT $%d`,
		cols, strings.Join(clauses, " AND "), idx,
	)

	return r.runList(ctx, teamID, userID, sql, args, pageSize, useUpdatedAtCursor)
}

func (r *Projects) ListTrash(ctx context.Context, teamID, userID uuid.UUID, cursor *Cursor, pageSize int) (*ListResult, error) {
	pageSize = clamp(pageSize, 1, 100)
	if pageSize == 0 {
		pageSize = 20
	}

	clauses := []string{
		"team_id = $1",
		"deleted_at IS NOT NULL",
		"deleted_at > now() - INTERVAL '30 days'",
	}
	args := []any{teamID}
	idx := 2

	if cursor != nil {
		clauses = append(clauses, fmt.Sprintf("(deleted_at < $%d OR (deleted_at = $%d AND id < $%d))", idx, idx, idx+1))
		args = append(args, cursor.UpdatedAt, cursor.ID) // cursor.UpdatedAt 这里实际语义是 deleted_at
		idx += 2
	}

	args = append(args, pageSize+1)
	sql := fmt.Sprintf(
		`SELECT %s FROM projects WHERE %s ORDER BY deleted_at DESC, id DESC LIMIT $%d`,
		projectColumns, strings.Join(clauses, " AND "), idx,
	)

	return r.runList(ctx, teamID, userID, sql, args, pageSize, useDeletedAtCursor)
}

// ---- bulk mutations ----

func (r *Projects) ClearAllDrafts(ctx context.Context, teamID, userID uuid.UUID) (int64, error) {
	var n int64
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`UPDATE projects SET deleted_at = now()
			 WHERE team_id = $1 AND status = 'draft' AND deleted_at IS NULL`, teamID,
		)
		if err != nil {
			return mapDBError(err, "clear drafts")
		}
		n = ct.RowsAffected()
		return nil
	})
	return n, err
}

func (r *Projects) DeleteDraft(ctx context.Context, teamID, userID, id uuid.UUID) error {
	return r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`UPDATE projects SET deleted_at = now()
			 WHERE id = $1 AND status = 'draft' AND deleted_at IS NULL`, id,
		)
		if err != nil {
			return mapDBError(err, "delete draft")
		}
		if ct.RowsAffected() == 0 {
			return apperr.ProjectNotFound()
		}
		return nil
	})
}

func (r *Projects) EmptyTrash(ctx context.Context, teamID, userID uuid.UUID) (int64, error) {
	var n int64
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`DELETE FROM projects WHERE team_id = $1 AND deleted_at IS NOT NULL`, teamID,
		)
		if err != nil {
			return mapDBError(err, "empty trash")
		}
		n = ct.RowsAffected()
		return nil
	})
	return n, err
}

func (r *Projects) LeaveShared(ctx context.Context, teamID, userID, projectID uuid.UUID) error {
	return r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`DELETE FROM project_collaborators WHERE project_id = $1 AND user_id = $2`,
			projectID, userID,
		)
		if err != nil {
			return mapDBError(err, "leave shared")
		}
		if ct.RowsAffected() == 0 {
			return apperr.ProjectNotFound()
		}
		return nil
	})
}

// ---- list helpers ----

type cursorMode int

const (
	useUpdatedAtCursor cursorMode = iota
	useDeletedAtCursor
)

func (r *Projects) runList(ctx context.Context, teamID, userID uuid.UUID, sql string, args []any, pageSize int, mode cursorMode) (*ListResult, error) {
	var items []Project
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, sql, args...)
		if err != nil {
			return mapDBError(err, "list query")
		}
		defer rows.Close()
		for rows.Next() {
			var p Project
			if err := scanProject(rows, &p); err != nil {
				return mapDBError(err, "scan project")
			}
			items = append(items, p)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}

	hasMore := len(items) > pageSize
	if hasMore {
		items = items[:pageSize]
	}
	var next *Cursor
	if hasMore && len(items) > 0 {
		last := items[len(items)-1]
		var ts time.Time
		switch mode {
		case useDeletedAtCursor:
			if last.DeletedAt != nil {
				ts = *last.DeletedAt
			}
		default:
			ts = last.UpdatedAt
		}
		next = &Cursor{UpdatedAt: ts, ID: last.ID}
	}
	return &ListResult{
		Items:      items,
		PageSize:   pageSize,
		HasMore:    hasMore,
		NextCursor: next,
	}, nil
}

// EncodeCursor / DecodeCursor 与 TS 端 base64url({u, i}) 对齐.
func EncodeCursor(c *Cursor) string {
	if c == nil {
		return ""
	}
	type wire struct {
		U string `json:"u"`
		I string `json:"i"`
	}
	b, _ := json.Marshal(wire{U: c.UpdatedAt.UTC().Format(time.RFC3339Nano), I: c.ID.String()})
	return base64.RawURLEncoding.EncodeToString(b)
}

func DecodeCursor(s string) (*Cursor, error) {
	if s == "" {
		return nil, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, apperr.InvalidInput("cursor 格式错误").WithCause(err)
	}
	type wire struct {
		U string `json:"u"`
		I string `json:"i"`
	}
	var w wire
	if err := json.Unmarshal(raw, &w); err != nil {
		return nil, apperr.InvalidInput("cursor 解码失败").WithCause(err)
	}
	t, err := time.Parse(time.RFC3339Nano, w.U)
	if err != nil {
		return nil, apperr.InvalidInput("cursor 时间戳错误").WithCause(err)
	}
	id, err := uuid.Parse(w.I)
	if err != nil {
		return nil, apperr.InvalidInput("cursor id 错误").WithCause(err)
	}
	return &Cursor{UpdatedAt: t, ID: id}, nil
}

// ---- internal helpers ----

func clamp(v, lo, hi int) int {
	if v == 0 {
		return 0
	}
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// mapDBError: 不识别的 db 错误统一包成 Internal; 已是 AppError 的不动.
func mapDBError(err error, ctx string) error {
	if apperr.As(err) != nil {
		return err
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return err // caller 判断 ErrNoRows
	}
	return apperr.Internal(ctx).WithCause(err)
}

// qualify 把 "id, team_id, ..." 前缀化为 "p.id, p.team_id, ...".
func qualify(alias, cols string) string {
	parts := strings.Split(cols, ",")
	for i, p := range parts {
		parts[i] = " " + alias + "." + strings.TrimSpace(p)
	}
	return strings.TrimSpace(strings.Join(parts, ","))
}
