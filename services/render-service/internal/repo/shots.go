package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Shot struct {
	ID         string
	OrderIndex int
	DurationMs int32
	Dialog     *string
	ImageURL   *string
}

func ListShotsByProject(ctx context.Context, pool *pgxpool.Pool, projectID string) ([]Shot, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, order_index, duration_ms, dialog, image_url
		FROM shots
		WHERE project_id = $1
		ORDER BY order_index ASC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var shots []Shot
	for rows.Next() {
		var s Shot
		if err := rows.Scan(&s.ID, &s.OrderIndex, &s.DurationMs, &s.Dialog, &s.ImageURL); err != nil {
			return nil, err
		}
		shots = append(shots, s)
	}
	return shots, rows.Err()
}
