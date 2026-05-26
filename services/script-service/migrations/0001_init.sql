-- script-service 0001_init: scripts + shots + RLS
-- depends-on: project-service 0001 (projects 已存在)
-- see: database.md §5.4 (scripts/shots), §6 (RLS)

BEGIN;

-- §5.4 scripts (1:1 with projects)
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

CREATE TRIGGER trg_scripts_updated
  BEFORE UPDATE ON scripts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- §5.4 shots (ordered list per project)
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
  voice_id      uuid,
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, order_index) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_shots_project_order ON shots (project_id, order_index);
CREATE TRIGGER trg_shots_updated
  BEFORE UPDATE ON shots FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- §6 RLS: scripts 通过 projects 表 join 检查 team_id
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY script_team_isolation ON scripts
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = scripts.project_id
        AND p.team_id = current_setting('app.team_id', true)::uuid
    )
  );

ALTER TABLE shots ENABLE ROW LEVEL SECURITY;

CREATE POLICY shot_team_isolation ON shots
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = shots.project_id
        AND p.team_id = current_setting('app.team_id', true)::uuid
    )
  );

COMMIT;
