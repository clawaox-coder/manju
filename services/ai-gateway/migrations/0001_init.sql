-- ai-gateway 0001_init: ai_tasks 表 + RLS
-- depends-on: auth-service 0001 (users/teams 已存在), project-service 0001 (projects)
-- see: database.md §5.7 (ai_tasks), §6 (RLS)
--
-- 设计说明 (T-009):
--   - 所有 AI 端点调用都写 ai_tasks 一条 (status queued/running/succeeded/failed)
--   - status 用 varchar(20) 而非 enum, 跟 docs 一致 (减少 schema 演变成本)
--   - team_id NOT NULL: AI 调用必须在 team 上下文里, 公共调用走不通
--   - prompt_hash 索引为部分索引 (WHERE NOT NULL) - 缓存命中检测预留

BEGIN;

CREATE TABLE ai_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id),
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  task_type     varchar(40) NOT NULL,
  provider      varchar(40) NOT NULL,
  model         varchar(80),
  status        varchar(20) NOT NULL DEFAULT 'queued',
  prompt_hash   varchar(64),
  input_tokens  integer,
  output_tokens integer,
  cost_credits  integer,
  duration_ms   integer,
  result_url    text,
  result_data   jsonb,
  error         text,
  cached        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  done_at       timestamptz
);

CREATE INDEX idx_ai_tasks_team_created ON ai_tasks (team_id, created_at DESC);
CREATE INDEX idx_ai_tasks_prompt_hash  ON ai_tasks (prompt_hash) WHERE prompt_hash IS NOT NULL;
CREATE INDEX idx_ai_tasks_project      ON ai_tasks (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_ai_tasks_status_team  ON ai_tasks (team_id, status, created_at DESC);

-- RLS: 同 asset/script 模式. 直接看 team_id, 不走 EXISTS (本表无跨表关联).
-- FORCE 必加.
ALTER TABLE ai_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_tasks_team_isolation ON ai_tasks
  USING (team_id = current_setting('app.team_id', true)::uuid);

COMMIT;
