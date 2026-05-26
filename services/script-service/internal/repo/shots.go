// repo.shots: ordered list per project. 含 after_shot_id 插入 / 删除重排 / reorder bulk.

package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/manju-org/manju/services/script-service/internal/apperr"
)

type Shot struct {
	ID         uuid.UUID
	ProjectID  uuid.UUID
	OrderIndex int32
	Num        *string
	Title      *string
	ShotType   *string
	DurationMs int32
	Dialog     *string
	ImageURL   *string
	BgStyle    *string
	VoiceID    *uuid.UUID
	Metadata   json.RawMessage
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type Shots struct {
	Pool *pgxpool.Pool
}

func NewShots(pool *pgxpool.Pool) *Shots { return &Shots{Pool: pool} }

const shotColumns = `id, project_id, order_index, num, title, shot_type, duration_ms, dialog,
	image_url, bg_style, voice_id, metadata, created_at, updated_at`

func scanShot(row pgx.Row, s *Shot) error {
	return row.Scan(
		&s.ID, &s.ProjectID, &s.OrderIndex, &s.Num, &s.Title, &s.ShotType,
		&s.DurationMs, &s.Dialog, &s.ImageURL, &s.BgStyle, &s.VoiceID,
		&s.Metadata, &s.CreatedAt, &s.UpdatedAt,
	)
}

// List 按 order_index 升序返回, 不分页 (m1 单项目 shot 数 < 1000).
func (r *Shots) List(ctx context.Context, teamID, userID, projectID uuid.UUID) ([]Shot, error) {
	var items []Shot
	err := withTeamCtx(ctx, r.Pool, teamID, userID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT `+shotColumns+` FROM shots WHERE project_id = $1 ORDER BY order_index`,
			projectID,
		)
		if err != nil {
			return mapDBError(err, "list shots")
		}
		defer rows.Close()
		for rows.Next() {
			var s Shot
			if err := scanShot(rows, &s); err != nil {
				return mapDBError(err, "scan shot")
			}
			items = append(items, s)
		}
		return rows.Err()
	})
	return items, err
}

func (r *Shots) Get(ctx context.Context, teamID, userID, projectID, shotID uuid.UUID) (*Shot, error) {
	var s Shot
	err := withTeamCtx(ctx, r.Pool, teamID, userID, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx,
			`SELECT `+shotColumns+` FROM shots WHERE id = $1 AND project_id = $2`,
			shotID, projectID,
		)
		return scanShot(row, &s)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.ShotNotFound()
		}
		return nil, err
	}
	return &s, nil
}

// CreateInput: title/shot_type/duration_ms/dialog 都 optional, AfterShotID 决定插入位置.
type CreateShotInput struct {
	Title       *string
	ShotType    *string
	DurationMs  *int32 // 默认 5000ms
	Dialog      *string
	AfterShotID *uuid.UUID // nil = 追加末尾
}

// Insert 插入 shot, 视 AfterShotID 决定位置:
//   - nil:   order_index = max+1 (追加末尾)
//   - 给值:  在该 shot 之后, 把后续行的 order_index +1, 然后插入到 after.order_index+1
//
// UNIQUE (project_id, order_index) 是 DEFERRABLE INITIALLY DEFERRED, 事务结束才检查, 不会撞.
func (r *Shots) Insert(ctx context.Context, teamID, userID, projectID uuid.UUID, in CreateShotInput) (*Shot, error) {
	var s Shot
	dur := int32(5000)
	if in.DurationMs != nil {
		dur = *in.DurationMs
	}

	err := withTeamCtx(ctx, r.Pool, teamID, userID, func(tx pgx.Tx) error {
		visible, err := projectVisible(ctx, tx, projectID)
		if err != nil {
			return apperr.Internal("check project").WithCause(err)
		}
		if !visible {
			return apperr.ProjectNotFound()
		}

		var newOrder int32
		if in.AfterShotID != nil {
			var afterIdx int32
			err := tx.QueryRow(ctx,
				`SELECT order_index FROM shots WHERE id = $1 AND project_id = $2`,
				*in.AfterShotID, projectID,
			).Scan(&afterIdx)
			if errors.Is(err, pgx.ErrNoRows) {
				return apperr.InvalidInput("after_shot_id 对应的 shot 不存在")
			}
			if err != nil {
				return mapDBError(err, "lookup after shot")
			}
			// shift 后续行
			if _, err := tx.Exec(ctx,
				`UPDATE shots SET order_index = order_index + 1
				 WHERE project_id = $1 AND order_index > $2`,
				projectID, afterIdx,
			); err != nil {
				return mapDBError(err, "shift shots after insert")
			}
			newOrder = afterIdx + 1
		} else {
			var maxIdx *int32
			if err := tx.QueryRow(ctx,
				`SELECT max(order_index) FROM shots WHERE project_id = $1`, projectID,
			).Scan(&maxIdx); err != nil {
				return mapDBError(err, "lookup max order_index")
			}
			if maxIdx == nil {
				newOrder = 0
			} else {
				newOrder = *maxIdx + 1
			}
		}

		row := tx.QueryRow(ctx,
			`INSERT INTO shots (project_id, order_index, title, shot_type, duration_ms, dialog)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING `+shotColumns,
			projectID, newOrder, in.Title, in.ShotType, dur, in.Dialog,
		)
		return scanShot(row, &s)
	})
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// PatchSet 字段语义同 asset-service: *Touched 标志区分 unset / explicit null.
type PatchShotSet struct {
	Num             *string
	NumTouch        bool
	Title           *string
	TitleTouch      bool
	ShotType        *string
	ShotTypeTouch   bool
	DurationMs      *int32
	DurationMsTouch bool
	Dialog          *string
	DialogTouch     bool
	ImageURL        *string
	ImageURLTouch   bool
	BgStyle         *string
	BgStyleTouch    bool
	VoiceID         *uuid.UUID
	VoiceIDTouch    bool
	Metadata        json.RawMessage
}

func (r *Shots) Patch(ctx context.Context, teamID, userID, projectID, shotID uuid.UUID, set PatchShotSet) (*Shot, error) {
	clauses := []string{}
	args := []any{}
	idx := 1
	add := func(col string, val any) {
		clauses = append(clauses, fmt.Sprintf("%s = $%d", col, idx))
		args = append(args, val)
		idx++
	}
	if set.NumTouch {
		add("num", set.Num)
	}
	if set.TitleTouch {
		add("title", set.Title)
	}
	if set.ShotTypeTouch {
		add("shot_type", set.ShotType)
	}
	if set.DurationMsTouch {
		add("duration_ms", set.DurationMs)
	}
	if set.DialogTouch {
		add("dialog", set.Dialog)
	}
	if set.ImageURLTouch {
		add("image_url", set.ImageURL)
	}
	if set.BgStyleTouch {
		add("bg_style", set.BgStyle)
	}
	if set.VoiceIDTouch {
		add("voice_id", set.VoiceID)
	}
	if len(set.Metadata) > 0 {
		add("metadata", set.Metadata)
	}

	if len(clauses) == 0 {
		return r.Get(ctx, teamID, userID, projectID, shotID)
	}

	args = append(args, shotID, projectID)
	idIdx := idx
	projIdx := idx + 1

	var s Shot
	err := withTeamCtx(ctx, r.Pool, teamID, userID, func(tx pgx.Tx) error {
		row := tx.QueryRow(ctx, fmt.Sprintf(
			`UPDATE shots SET %s WHERE id = $%d AND project_id = $%d RETURNING %s`,
			strings.Join(clauses, ", "), idIdx, projIdx, shotColumns,
		), args...)
		return scanShot(row, &s)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.ShotNotFound()
		}
		return nil, err
	}
	return &s, nil
}

// Delete: 删除 + 把 order_index > 被删值的全部 -1, 保持紧凑.
func (r *Shots) Delete(ctx context.Context, teamID, userID, projectID, shotID uuid.UUID) error {
	return withTeamCtx(ctx, r.Pool, teamID, userID, func(tx pgx.Tx) error {
		var deletedIdx int32
		err := tx.QueryRow(ctx,
			`DELETE FROM shots WHERE id = $1 AND project_id = $2 RETURNING order_index`,
			shotID, projectID,
		).Scan(&deletedIdx)
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.ShotNotFound()
		}
		if err != nil {
			return mapDBError(err, "delete shot")
		}
		if _, err := tx.Exec(ctx,
			`UPDATE shots SET order_index = order_index - 1
			 WHERE project_id = $1 AND order_index > $2`,
			projectID, deletedIdx,
		); err != nil {
			return mapDBError(err, "shift shots after delete")
		}
		return nil
	})
}

// Reorder: 给定 shot id 数组 (新顺序), 全量重排. 必须覆盖项目下全部 shot.
// 用 DEFERRABLE 让 UNIQUE 约束事务末尾才检查 — 中间过程允许临时撞值.
func (r *Shots) Reorder(ctx context.Context, teamID, userID, projectID uuid.UUID, orderedIDs []uuid.UUID) ([]Shot, error) {
	if len(orderedIDs) == 0 {
		return nil, apperr.InvalidInput("order 不能为空")
	}
	// 去重检查
	seen := make(map[uuid.UUID]struct{}, len(orderedIDs))
	for _, id := range orderedIDs {
		if _, dup := seen[id]; dup {
			return nil, apperr.InvalidInput("order 包含重复 id").WithDetail("duplicate", id.String())
		}
		seen[id] = struct{}{}
	}

	var items []Shot
	err := withTeamCtx(ctx, r.Pool, teamID, userID, func(tx pgx.Tx) error {
		// 集合校验: 给的 id 集合必须 == 项目下现有 shot id 集合
		rows, err := tx.Query(ctx,
			`SELECT id FROM shots WHERE project_id = $1`, projectID)
		if err != nil {
			return mapDBError(err, "list shot ids")
		}
		current := make(map[uuid.UUID]struct{})
		for rows.Next() {
			var id uuid.UUID
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return mapDBError(err, "scan shot id")
			}
			current[id] = struct{}{}
		}
		rows.Close()

		if len(current) != len(orderedIDs) {
			return apperr.InvalidInput("order 长度与项目 shot 数不一致").
				WithDetail("got", len(orderedIDs)).
				WithDetail("expected", len(current))
		}
		for _, id := range orderedIDs {
			if _, ok := current[id]; !ok {
				return apperr.InvalidInput("order 含项目外的 shot id").WithDetail("unknown", id.String())
			}
		}

		// DEFERRABLE 让事务末尾才检查 UNIQUE.
		if _, err := tx.Exec(ctx, `SET CONSTRAINTS ALL DEFERRED`); err != nil {
			return apperr.Internal("set constraints deferred").WithCause(err)
		}
		for i, id := range orderedIDs {
			if _, err := tx.Exec(ctx,
				`UPDATE shots SET order_index = $1 WHERE id = $2 AND project_id = $3`,
				int32(i), id, projectID,
			); err != nil {
				return mapDBError(err, "reorder update")
			}
		}

		// 返回新顺序
		queryRows, err := tx.Query(ctx,
			`SELECT `+shotColumns+` FROM shots WHERE project_id = $1 ORDER BY order_index`,
			projectID,
		)
		if err != nil {
			return mapDBError(err, "list after reorder")
		}
		defer queryRows.Close()
		for queryRows.Next() {
			var s Shot
			if err := scanShot(queryRows, &s); err != nil {
				return mapDBError(err, "scan after reorder")
			}
			items = append(items, s)
		}
		return queryRows.Err()
	})
	return items, err
}
