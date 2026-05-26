-- auth-service queries (for sqlc)
-- regen via `make sqlc`. Hand-written equivalents live in internal/repo/db/*.go
-- and must be kept in lock-step (until sqlc is part of CI).

-- name: CreateUser :one
INSERT INTO users (email, password_hash, name)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE email = $1 AND deleted_at IS NULL;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1 AND deleted_at IS NULL;

-- name: TouchUserLogin :exec
UPDATE users SET last_login_at = now() WHERE id = $1;

-- name: UpdateUserProfile :one
UPDATE users SET
  name       = COALESCE(sqlc.narg('name'),       name),
  phone      = COALESCE(sqlc.narg('phone'),      phone),
  bio        = COALESCE(sqlc.narg('bio'),        bio),
  avatar_url = COALESCE(sqlc.narg('avatar_url'), avatar_url)
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- name: CreateTeam :one
INSERT INTO teams (name, plan, seat_total)
VALUES ($1, 'free', 1)
RETURNING *;

-- name: CreateTeamMember :one
INSERT INTO team_members (team_id, user_id, role)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetTeamByID :one
SELECT * FROM teams WHERE id = $1;

-- name: GetPrimaryTeamMembershipByUser :one
SELECT * FROM team_members
WHERE user_id = $1
ORDER BY joined_at ASC
LIMIT 1;

-- name: CreateRefreshToken :one
INSERT INTO refresh_tokens
  (user_id, team_id, token_hash, parent_id, user_agent, ip, device_id, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetActiveRefreshTokenByHash :one
SELECT * FROM refresh_tokens
WHERE token_hash = $1
  AND revoked_at IS NULL
  AND expires_at > now();

-- name: RevokeRefreshToken :exec
UPDATE refresh_tokens
SET revoked_at = now(), revoked_reason = $2
WHERE id = $1 AND revoked_at IS NULL;

-- name: RevokeAllRefreshTokensForUser :exec
UPDATE refresh_tokens
SET revoked_at = now(), revoked_reason = $2
WHERE user_id = $1 AND revoked_at IS NULL;
