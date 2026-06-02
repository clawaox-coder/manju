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

	"github.com/manju-org/manju/services/asset-service/internal/apperr"
)

// ---- 类型与枚举 ----

// AssetType 与 migration 0001+0002 中的 PG enum 同步.
// 6 类: character/scene/prop/music/sfx/voice. voice 由 T-009 ai-gateway 切片补回.
type AssetType string

const (
	TypeCharacter AssetType = "character"
	TypeScene     AssetType = "scene"
	TypeProp      AssetType = "prop"
	TypeMusic     AssetType = "music"
	TypeSFX       AssetType = "sfx"
	TypeVoice     AssetType = "voice"
)

func ParseAssetType(s string) (AssetType, bool) {
	switch s {
	case "character", "scene", "prop", "music", "sfx", "voice":
		return AssetType(s), true
	}
	return "", false
}

// ParseAssetTypeFromPath 把 URL 段 (复数形式) 映射到枚举.
// api.md §7.6 用复数路径: /v1/assets/characters/...
func ParseAssetTypeFromPath(seg string) (AssetType, bool) {
	switch seg {
	case "characters":
		return TypeCharacter, true
	case "scenes":
		return TypeScene, true
	case "props":
		return TypeProp, true
	case "music":
		return TypeMusic, true
	case "sfx":
		return TypeSFX, true
	case "voices":
		return TypeVoice, true
	}
	return "", false
}

// Asset 是 DB 行的 1:1 投影.
type Asset struct {
	ID           uuid.UUID
	TeamID       *uuid.UUID // 公共素材为 NULL
	Type         AssetType
	Name         string
	Description  *string
	Tags         []string
	FileURL      *string
	ThumbnailURL *string
	BgStyle      *string
	Avatar       *string
	DurationMs   *int32
	UsesCount    int32
	CreatedBy    *uuid.UUID
	Metadata     json.RawMessage
	CreatedAt    time.Time
	UpdatedAt    time.Time
	DeletedAt    *time.Time
}

// Cursor (updated_at, id) 复合游标 — 与 TS 端 base64url({u, i}) 对齐.
type Cursor struct {
	UpdatedAt time.Time `json:"u"`
	ID        uuid.UUID `json:"i"`
}

type ListOpts struct {
	Type     AssetType
	Q        string
	Tags     []string
	Cursor   *Cursor
	PageSize int
}

type ListResult struct {
	Items      []Asset
	PageSize   int
	HasMore    bool
	NextCursor *Cursor
}

// ---- repo ----

type Assets struct {
	Pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Assets { return &Assets{Pool: pool} }

// WithTeamCtx 在事务里 SET LOCAL app.team_id / app.user_id, 给 RLS 用.
func (r *Assets) WithTeamCtx(ctx context.Context, teamID, userID uuid.UUID, fn func(pgx.Tx) error) error {
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

const assetColumns = `id, team_id, type, name, description, tags, file_url, thumbnail_url,
	bg_style, avatar, duration_ms, uses_count, created_by, metadata,
	created_at, updated_at, deleted_at`

// assetColumnList 是 assetColumns 的列名切片, 供 join 查询加表别名前缀用.
var assetColumnList = []string{
	"id", "team_id", "type", "name", "description", "tags", "file_url", "thumbnail_url",
	"bg_style", "avatar", "duration_ms", "uses_count", "created_by", "metadata",
	"created_at", "updated_at", "deleted_at",
}

// prefixedAssetColumns 给每个 asset 列加表别名前缀 (如 "a.id, a.team_id, ...").
// 用于 project_assets JOIN assets 时避免列名歧义, scan 顺序与 scanAsset 一致.
func prefixedAssetColumns(alias string) string {
	cols := make([]string, len(assetColumnList))
	for i, c := range assetColumnList {
		cols[i] = alias + "." + c
	}
	return strings.Join(cols, ", ")
}

func scanAsset(row pgx.Row, a *Asset) error {
	return row.Scan(
		&a.ID, &a.TeamID, &a.Type, &a.Name, &a.Description, &a.Tags,
		&a.FileURL, &a.ThumbnailURL, &a.BgStyle, &a.Avatar, &a.DurationMs,
		&a.UsesCount, &a.CreatedBy, &a.Metadata,
		&a.CreatedAt, &a.UpdatedAt, &a.DeletedAt,
	)
}

// ---- create ----

type CreateInput struct {
	Type         AssetType
	Name         string
	Description  *string
	Tags         []string
	FileURL      *string
	ThumbnailURL *string
	BgStyle      *string
	Avatar       *string
	DurationMs   *int32
	Metadata     json.RawMessage
}

func (r *Assets) Create(ctx context.Context, teamID, userID uuid.UUID, in CreateInput) (*Asset, error) {
	var a Asset
	tags := in.Tags
	if tags == nil {
		tags = []string{}
	}
	meta := in.Metadata
	if len(meta) == 0 {
		meta = json.RawMessage("{}")
	}
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx,
			`INSERT INTO assets
			   (team_id, type, name, description, tags, file_url, thumbnail_url,
			    bg_style, avatar, duration_ms, created_by, metadata)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			 RETURNING `+assetColumns,
			teamID, string(in.Type), in.Name, in.Description, tags,
			in.FileURL, in.ThumbnailURL, in.BgStyle, in.Avatar, in.DurationMs,
			userID, meta,
		)
		return scanAsset(row, &a)
	})
	if err != nil {
		return nil, mapDBError(err, "create asset")
	}
	return &a, nil
}

// ---- get ----

func (r *Assets) GetByID(ctx context.Context, teamID, userID uuid.UUID, t AssetType, id uuid.UUID) (*Asset, error) {
	var a Asset
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx,
			`SELECT `+assetColumns+` FROM assets
			 WHERE id = $1 AND type = $2 AND deleted_at IS NULL`,
			id, string(t),
		)
		return scanAsset(row, &a)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.AssetNotFound()
		}
		return nil, mapDBError(err, "get asset")
	}
	return &a, nil
}

// ---- patch ----
//
// PatchSet 用 *touched 标志区分 "未给" 与 "显式 null":
//   - 字段对应的 *Touched=false → SQL 中不出现 (保持原值)
//   - *Touched=true 且 *Value=nil → SQL 中写 NULL (清空字段)
//   - *Touched=true 且 *Value 非 nil → 写新值

type PatchSet struct {
	Name              *string
	Description       *string
	DescriptionTouch  bool
	Tags              []string
	TagsTouched       bool
	FileURL           *string
	FileURLTouch      bool
	ThumbnailURL      *string
	ThumbnailURLTouch bool
	BgStyle           *string
	BgStyleTouch      bool
	Avatar            *string
	AvatarTouch       bool
	DurationMs        *int32
	DurationMsTouch   bool
	Metadata          json.RawMessage // nil 或 len==0 表示未给
}

func (r *Assets) Patch(ctx context.Context, teamID, userID uuid.UUID, t AssetType, id uuid.UUID, set PatchSet) (*Asset, error) {
	clauses := []string{}
	args := []any{}
	idx := 1

	add := func(col string, val any) {
		clauses = append(clauses, fmt.Sprintf("%s = $%d", col, idx))
		args = append(args, val)
		idx++
	}

	if set.Name != nil {
		add("name", *set.Name)
	}
	if set.DescriptionTouch {
		add("description", set.Description) // 允许 nil → SQL NULL
	}
	if set.TagsTouched {
		tags := set.Tags
		if tags == nil {
			tags = []string{}
		}
		add("tags", tags)
	}
	if set.FileURLTouch {
		add("file_url", set.FileURL)
	}
	if set.ThumbnailURLTouch {
		add("thumbnail_url", set.ThumbnailURL)
	}
	if set.BgStyleTouch {
		add("bg_style", set.BgStyle)
	}
	if set.AvatarTouch {
		add("avatar", set.Avatar)
	}
	if set.DurationMsTouch {
		add("duration_ms", set.DurationMs)
	}
	if len(set.Metadata) > 0 {
		add("metadata", set.Metadata)
	}

	if len(clauses) == 0 {
		return r.GetByID(ctx, teamID, userID, t, id)
	}

	// type 参数防越权改类型: WHERE 限定 + 不允许通过 PATCH 改 type
	args = append(args, id, string(t))
	idIdx := idx
	typeIdx := idx + 1

	var a Asset
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, fmt.Sprintf(
			`UPDATE assets SET %s
			 WHERE id = $%d AND type = $%d AND deleted_at IS NULL
			 RETURNING %s`,
			strings.Join(clauses, ", "), idIdx, typeIdx, assetColumns,
		), args...)
		return scanAsset(row, &a)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.AssetNotFound()
		}
		return nil, mapDBError(err, "patch asset")
	}
	return &a, nil
}

// ---- soft delete ----

func (r *Assets) SoftDelete(ctx context.Context, teamID, userID uuid.UUID, t AssetType, id uuid.UUID) error {
	return r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		ct, err := tx.Exec(ctx,
			`UPDATE assets SET deleted_at = now()
			 WHERE id = $1 AND type = $2 AND deleted_at IS NULL`,
			id, string(t),
		)
		if err != nil {
			return mapDBError(err, "soft-delete asset")
		}
		if ct.RowsAffected() == 0 {
			return apperr.AssetNotFound()
		}
		return nil
	})
}

// ---- list (cursor 分页 + 过滤) ----

func (r *Assets) List(ctx context.Context, teamID, userID uuid.UUID, t AssetType, opts ListOpts) (*ListResult, error) {
	pageSize := clamp(opts.PageSize, 1, 100)
	if pageSize == 0 {
		pageSize = 20
	}

	clauses := []string{"deleted_at IS NULL", "type = $1"}
	args := []any{string(t)}
	idx := 2

	if opts.Q != "" {
		clauses = append(clauses, fmt.Sprintf("name ILIKE $%d", idx))
		args = append(args, "%"+opts.Q+"%")
		idx++
	}
	if len(opts.Tags) > 0 {
		clauses = append(clauses, fmt.Sprintf("tags @> $%d", idx))
		args = append(args, opts.Tags)
		idx++
	}
	if opts.Cursor != nil {
		clauses = append(clauses,
			fmt.Sprintf("(updated_at < $%d OR (updated_at = $%d AND id < $%d))", idx, idx, idx+1))
		args = append(args, opts.Cursor.UpdatedAt, opts.Cursor.ID)
		idx += 2
	}

	args = append(args, pageSize+1)
	sql := fmt.Sprintf(
		`SELECT %s FROM assets WHERE %s ORDER BY updated_at DESC, id DESC LIMIT $%d`,
		assetColumns, strings.Join(clauses, " AND "), idx,
	)

	var items []Asset
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, sql, args...)
		if err != nil {
			return mapDBError(err, "list query")
		}
		defer rows.Close()
		for rows.Next() {
			var a Asset
			if err := scanAsset(rows, &a); err != nil {
				return mapDBError(err, "scan asset")
			}
			items = append(items, a)
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
		next = &Cursor{UpdatedAt: last.UpdatedAt, ID: last.ID}
	}
	return &ListResult{
		Items:      items,
		PageSize:   pageSize,
		HasMore:    hasMore,
		NextCursor: next,
	}, nil
}

// ---- cursor codec (与 TS 端 base64url({u, i}) 对齐) ----

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

// ---- helpers ----

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

func mapDBError(err error, ctx string) error {
	if apperr.As(err) != nil {
		return err
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	return apperr.Internal(ctx).WithCause(err)
}
