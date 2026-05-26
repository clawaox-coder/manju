-- project-service queries (for sqlc).
-- regen via `make sqlc`. 当前手写实现在 internal/repo/projects.go, 这里仅占位.
-- 注: 涉及动态条件的 List/Search 查询难以用 sqlc 表达, 暂留在 repo 层手写.

-- name: CreateProject :one
INSERT INTO projects (team_id, owner_id, name, genre, status, metadata)
VALUES ($1, $2, $3, $4, 'draft', $5)
RETURNING *;

-- name: GetProjectByID :one
SELECT * FROM projects
WHERE id = $1 AND deleted_at IS NULL;

-- name: UpdateProjectFields :one
UPDATE projects SET
  name  = COALESCE(sqlc.narg('name'),  name),
  genre = COALESCE(sqlc.narg('genre'), genre)
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteProject :execrows
UPDATE projects
SET deleted_at = now()
WHERE id = $1 AND deleted_at IS NULL;

-- name: RestoreProject :one
UPDATE projects
SET deleted_at = NULL
WHERE id = $1 AND deleted_at IS NOT NULL
RETURNING *;

-- name: PurgeProject :execrows
DELETE FROM projects
WHERE id = $1 AND deleted_at IS NOT NULL;

-- name: ClearAllDrafts :execrows
UPDATE projects
SET deleted_at = now()
WHERE team_id = $1
  AND status = 'draft'
  AND deleted_at IS NULL;

-- name: DeleteDraft :execrows
UPDATE projects
SET deleted_at = now()
WHERE id = $1
  AND status = 'draft'
  AND deleted_at IS NULL;

-- name: EmptyTrash :execrows
DELETE FROM projects
WHERE team_id = $1
  AND deleted_at IS NOT NULL;

-- name: LeaveShared :execrows
DELETE FROM project_collaborators
WHERE project_id = $1 AND user_id = $2;
