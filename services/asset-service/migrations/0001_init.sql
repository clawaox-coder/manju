-- asset-service 0001_init: assets 单表 + 5 类型 enum + RLS + 索引
-- depends-on: auth-service 0001 (users, teams 已存在; set_updated_at() 已建)
-- see: database.md §5.5 (资产), §6 (RLS); api.md §7.6 (5 collection)
--
-- 设计选择 (T-007 用户决策):
--   - 单表 assets + asset_type enum (character/scene/prop/music/sfx), 而非 6 张独立表
--   - URL 走 /v1/assets/{type}, 路径前缀分流 (api.md §7.6 风格)
--   - voices 暂不入表, 留给 T-009 ai-gateway/voice 切片

BEGIN;

-- §4 枚举: 5 种资产类型 (不含 voice)
CREATE TYPE asset_type AS ENUM ('character', 'scene', 'prop', 'music', 'sfx');

-- §5.5 assets (合并 5 表的统一结构)
CREATE TABLE assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid REFERENCES teams(id) ON DELETE CASCADE,
  type            asset_type NOT NULL,
  name            varchar(100) NOT NULL,
  description     text,
  tags            text[] NOT NULL DEFAULT ARRAY[]::text[],
  file_url        text,
  thumbnail_url   text,
  bg_style        varchar(50),
  avatar          varchar(10),
  duration_ms     int,
  uses_count      int NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES users(id),
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- 索引: 列表查询主走 (team_id, type), 按 updated_at 排序
CREATE INDEX idx_assets_team_type_updated
  ON assets (team_id, type, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_team_deleted
  ON assets (team_id, deleted_at DESC) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_assets_tags
  ON assets USING gin (tags) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_name_trgm
  ON assets USING gin (name gin_trgm_ops) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_assets_updated
  BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- §6 RLS: team_id 匹配 OR team_id IS NULL (公共素材).
-- FORCE 是必需的: 默认 PG 让 table owner 与 superuser 绕过 RLS;
-- 生产中 service 账号常被授为 owner, 不 FORCE 等于没启用 (见 project-service 0001 头注释)。
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;

CREATE POLICY asset_team_isolation ON assets
  USING (
    team_id = current_setting('app.team_id', true)::uuid
    OR team_id IS NULL
  );

COMMIT;
