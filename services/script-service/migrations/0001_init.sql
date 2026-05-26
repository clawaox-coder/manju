-- script-service 0001_init: scripts + script_versions + shots + RLS
-- depends-on: auth-service 0001 (users 已存在; set_updated_at 已建)
--             project-service 0001 (projects 已存在)
-- see: database.md §5.4 (scripts/shots), §6 (RLS)
--
-- 设计说明 (T-008):
--   - scripts: 1:1 with projects, PK = project_id, 乐观锁 version_no
--   - script_versions: 每次 PUT 同事务写一条快照 (yjs delta 留给 collab 切片填)
--   - shots: 有序列表, UNIQUE (project_id, order_index) DEFERRABLE 兜底重排冲突
--   - RLS: 通过 EXISTS join projects 表, 不在本表存 team_id (database.md §6 模式)
--   - FORCE ROW LEVEL SECURITY: 同 project-service 必加, 否则 service 账号若是 owner 绕过

BEGIN;

-- ---- scripts (1:1) ----
CREATE TABLE scripts (
  project_id    uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  content       text NOT NULL DEFAULT '',
  format        varchar(20) NOT NULL DEFAULT 'markdown',
  word_count    integer NOT NULL DEFAULT 0,
  scene_count   smallint NOT NULL DEFAULT 0,
  updated_by    uuid REFERENCES users(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version_no    integer NOT NULL DEFAULT 1
);

-- scripts 不需要 set_updated_at 触发器 — service 层在 PUT 时显式写 updated_at + updated_by.
-- 触发器会覆盖手写值, 所以这里不加.

-- ---- script_versions (历史快照) ----
CREATE TABLE script_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_no      integer NOT NULL,
  content         text NOT NULL,
  delta           bytea,                                  -- yjs binary update, T-008 暂不写
  shots_snapshot  jsonb NOT NULL DEFAULT '[]',
  word_count      integer NOT NULL DEFAULT 0,
  scene_count     smallint NOT NULL DEFAULT 0,
  size_bytes      integer NOT NULL,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version_no)
);
CREATE INDEX idx_script_versions_project_version
  ON script_versions (project_id, version_no DESC);

-- ---- shots ----
CREATE TABLE shots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  order_index   integer NOT NULL,
  num           varchar(10),
  title         varchar(200),
  shot_type     varchar(50),
  duration_ms   integer NOT NULL DEFAULT 5000,
  dialog        text,
  image_url     text,
  bg_style      varchar(50),
  voice_id      uuid,                                     -- references voices(id) future
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, order_index) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX idx_shots_project_order ON shots (project_id, order_index);
CREATE TRIGGER trg_shots_updated
  BEFORE UPDATE ON shots FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---- RLS ----
-- 三张表都走 EXISTS projects (database.md §6 模式). 不存递归 (子查询的表是 projects, 不回查自身).

ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts FORCE ROW LEVEL SECURITY;
CREATE POLICY script_team_isolation ON scripts
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = scripts.project_id
        AND p.team_id = current_setting('app.team_id', true)::uuid
    )
  );

ALTER TABLE script_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY script_version_team_isolation ON script_versions
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = script_versions.project_id
        AND p.team_id = current_setting('app.team_id', true)::uuid
    )
  );

ALTER TABLE shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE shots FORCE ROW LEVEL SECURITY;
CREATE POLICY shot_team_isolation ON shots
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = shots.project_id
        AND p.team_id = current_setting('app.team_id', true)::uuid
    )
  );

COMMIT;
