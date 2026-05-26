-- auth-service 0001_init: users + teams + team_members + refresh_tokens
-- depends-on: -
-- see: database.md §5.1 (users), §5.2 (teams), §5.2a (refresh_tokens)
--
-- RLS 说明:
--   database.md §6 要求 team_members 启用 RLS, 但 auth-service 的登录/refresh 在没有
--   team 上下文时也需要查 team_members (用 user_id 找用户的 teams). 本切片暂不启用 RLS,
--   等业务服务 (project-service 等) 进入时, 通过单独的 0002_*_rls.sql 启用, 并为 auth-service
--   分配 BYPASSRLS 角色 (operations 任务, 不在本片).

BEGIN;

-- §3 扩展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "citext";

-- §4 枚举
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE team_role   AS ENUM ('owner', 'admin', 'editor', 'viewer');
CREATE TYPE plan_tier   AS ENUM ('free', 'pro', 'team', 'enterprise');

-- §9 通用触发器
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- §5.1 users
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext UNIQUE NOT NULL,
  phone             varchar(20) UNIQUE,
  password_hash     varchar(255),
  name              varchar(100) NOT NULL,
  avatar_url        text,
  bio               text,
  status            user_status NOT NULL DEFAULT 'active',
  two_factor_secret varchar(64),
  last_login_at     timestamptz,
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX idx_users_email ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_phone ON users (phone) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- §5.2 teams
CREATE TABLE teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(100) NOT NULL,
  slug        varchar(50) UNIQUE,
  plan        plan_tier NOT NULL DEFAULT 'free',
  seat_total  smallint NOT NULL DEFAULT 1,
  renew_date  date,
  auto_renew  bool NOT NULL DEFAULT true,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_teams_updated
  BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE team_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        team_role NOT NULL DEFAULT 'editor',
  joined_at   timestamptz NOT NULL DEFAULT now(),
  invited_by  uuid REFERENCES users(id),
  UNIQUE (team_id, user_id)
);
CREATE INDEX idx_team_members_user ON team_members (user_id);

-- §5.2a refresh_tokens (auth-service)
CREATE TABLE refresh_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id         uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  token_hash      varchar(64) UNIQUE NOT NULL,
  parent_id       uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  user_agent      text,
  ip              inet,
  device_id       varchar(64),
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  revoked_reason  varchar(40),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user_active
  ON refresh_tokens (user_id, expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_expires
  ON refresh_tokens (expires_at) WHERE revoked_at IS NULL;

COMMIT;
