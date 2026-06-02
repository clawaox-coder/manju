-- ai-gateway 0002: ai_image_quota 表(平台付费图像生成的月度配额)
-- depends-on: 0001 (teams 已存在)
-- see: openspec/changes/canvas-image-generation/design.md Decision 3
--
-- 设计说明:
--   - 每个 team 每月一行;首次生成时按需 INSERT (used=0, limit=50)
--   - "限" 是 SQL 关键字相近,加引号以保留(同 PG 规范)
--   - month_yymm 为 'YYYY-MM' 字符串(7 字符),配合 PRIMARY KEY (team_id, month_yymm)
--   - RLS 与 ai_tasks 同模式:team_id 隔离 + FORCE

BEGIN;

CREATE TABLE ai_image_quota (
  team_id      uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  month_yymm   varchar(7) NOT NULL,
  used         integer NOT NULL DEFAULT 0,
  "limit"      integer NOT NULL DEFAULT 50,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, month_yymm)
);

ALTER TABLE ai_image_quota ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_image_quota FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_image_quota_team_isolation ON ai_image_quota
  USING (team_id = current_setting('app.team_id', true)::uuid);

COMMIT;
