package repo

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// project_assets: 项目 ↔ 资产 多对多关联 (role 区分用途). 见 migration 0003.
// 复用 Assets receiver + WithTeamCtx (统一 RLS 上下文 + 事务).

// LinkAsset 把资产以指定 role 关联到项目. 幂等 (PK 三元组冲突时不报错).
func (r *Assets) LinkAsset(ctx context.Context, teamID, userID, projectID, assetID uuid.UUID, role string) error {
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		_, e := tx.Exec(ctx,
			`INSERT INTO project_assets (project_id, asset_id, role, team_id)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (project_id, asset_id, role) DO NOTHING`,
			projectID, assetID, role, teamID,
		)
		return e
	})
	if err != nil {
		return mapDBError(err, "link project asset")
	}
	return nil
}

// UnlinkAsset 解除某项目某 role 下的一个资产关联. 幂等.
func (r *Assets) UnlinkAsset(ctx context.Context, teamID, userID, projectID, assetID uuid.UUID, role string) error {
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		_, e := tx.Exec(ctx,
			`DELETE FROM project_assets
			 WHERE project_id = $1 AND asset_id = $2 AND role = $3`,
			projectID, assetID, role,
		)
		return e
	})
	if err != nil {
		return mapDBError(err, "unlink project asset")
	}
	return nil
}

// ListByProjectRole 返回某项目某 role 下的资产 (join assets, 跳过已软删).
// 按关联创建时间倒序 (最近关联的在前).
func (r *Assets) ListByProjectRole(ctx context.Context, teamID, userID, projectID uuid.UUID, role string) ([]Asset, error) {
	out := []Asset{}
	err := r.WithTeamCtx(ctx, teamID, userID, func(tx pgx.Tx) error {
		rows, e := tx.Query(ctx,
			`SELECT `+prefixedAssetColumns("a")+`
			 FROM project_assets pa
			 JOIN assets a ON a.id = pa.asset_id
			 WHERE pa.project_id = $1 AND pa.role = $2 AND a.deleted_at IS NULL
			 ORDER BY pa.created_at DESC`,
			projectID, role,
		)
		if e != nil {
			return e
		}
		defer rows.Close()
		for rows.Next() {
			var a Asset
			if e := scanAsset(rows, &a); e != nil {
				return e
			}
			out = append(out, a)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, mapDBError(err, "list project assets")
	}
	return out, nil
}
