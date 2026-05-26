-- project-service 0001_init: projects + project_collaborators + RLS
-- depends-on: auth-service 0001 (users, teams 已存在)
-- see: database.md §5.3 (projects), §6 (RLS)
--
-- 注意: 本服务的迁移与 auth-service 共享同一个 postgres database. atlas migrate
-- 假定 schema 是同一个 "manju" db, 但每个服务有自己的 migrations 目录. 生产应区分 schema
-- 或更严格走 db-per-service (后续讨论).

BEGIN;

-- §4 枚举 (project_status auth 没建)
CREATE TYPE project_status AS ENUM ('draft', 'rendering', 'done', 'archived');

-- 应用层 RLS 上下文 (database.md §6 example).
-- project-service 连接后:
--   SET LOCAL app.team_id = '<jwt.team_id>';
--   SET LOCAL app.user_id = '<jwt.sub>';

-- §5.3 projects
CREATE TABLE projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES users(id),
  name            varchar(200) NOT NULL,
  genre           varchar(50),
  status          project_status NOT NULL DEFAULT 'draft',
  progress        smallint NOT NULL DEFAULT 0,
  version         varchar(20) NOT NULL DEFAULT 'V1',
  thumbnail_url   text,
  bg_style        varchar(50),
  metadata        jsonb NOT NULL DEFAULT '{}',
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_team_status_updated
  ON projects (team_id, status, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_team_deleted
  ON projects (team_id, deleted_at DESC) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_projects_name_trgm
  ON projects USING gin (name gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_projects_updated
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE project_collaborators (
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission   varchar(20) NOT NULL DEFAULT 'read',
  shared_by    uuid REFERENCES users(id),
  shared_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX idx_project_collab_user ON project_collaborators (user_id);

-- §6 RLS: 只让本 team 看本 team 的 projects + 自己参与的 shared projects.
-- FORCE 是必需的: 默认 PG 让 table owner 与 superuser 绕过 RLS;
-- 生产中 service 账号常被授为 owner, 不 FORCE 等于没启用. 见 database.md §6.
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

CREATE POLICY project_team_isolation ON projects
  USING (
    team_id = current_setting('app.team_id', true)::uuid
    OR EXISTS (
      SELECT 1 FROM project_collaborators c
      WHERE c.project_id = projects.id
        AND c.user_id = current_setting('app.user_id', true)::uuid
    )
  );

ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_collaborators FORCE ROW LEVEL SECURITY;
-- 注: 这里不再回查 projects (会与 projects.USING 形成 RLS 递归被 PG 拒绝).
-- 用户可见自己作为协作者的条目; 团队成员要看本团队所有 collab 记录, 让应用层做 JOIN
-- via projects (那条查询走 projects.USING 自然限定到本团队).
CREATE POLICY project_collab_user_visible ON project_collaborators
  USING (user_id = current_setting('app.user_id', true)::uuid);

COMMIT;
