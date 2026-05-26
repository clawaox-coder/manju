-- asset-service 0001_init: assets table + RLS
-- 6 asset types: character, scene, prop, music, sfx, voice

BEGIN;

-- enum type
CREATE TYPE asset_type AS ENUM ('character', 'scene', 'prop', 'music', 'sfx', 'voice');

-- assets table
CREATE TABLE assets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid REFERENCES teams(id) ON DELETE CASCADE,
  type          asset_type NOT NULL,
  name          varchar(100) NOT NULL,
  description   text,
  tags          text[] NOT NULL DEFAULT ARRAY[]::text[],
  file_url      text,
  thumbnail_url text,
  bg_style      varchar(50),
  avatar        varchar(10),
  duration_ms   int,
  uses_count    int NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES users(id),
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- indexes
CREATE INDEX idx_assets_team_type ON assets (team_id, type) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_tags ON assets USING gin (tags) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_name_trgm ON assets USING gin (name gin_trgm_ops) WHERE deleted_at IS NULL;

-- updated_at trigger
CREATE TRIGGER trg_assets_updated
  BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: team isolation (team_id matches OR public assets where team_id IS NULL)
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY asset_team_isolation ON assets
  USING (
    team_id = current_setting('app.team_id', true)::uuid
    OR team_id IS NULL
  );

COMMIT;
