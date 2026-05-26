-- render-service 0001_init: render_status enum + render_jobs 分区表 + RLS
-- depends-on: auth-service 0001 (teams/users), project-service 0001 (projects)
-- see: database.md §4 (enums), §5.6 (render_jobs), §6 (RLS)
--
-- 设计说明 (T-010):
--   - render_jobs 按 queued_at 月分区. m1 预建 5 个月分区 (2026_05~2026_09)
--   - PK 必须含分区键 (queued_at), 单 id 不构成 unique
--   - status varchar(20)? 不: docs §4 已声明 render_status enum, 严格按 docs
--   - RLS 直接 team_id 过 (无跨表). FORCE 必加 (asset/script/ai 同模式)
--   - idempotency_key 在表里 (POST /v1/render 幂等), partial UNIQUE 索引

BEGIN;

-- 1. enum
DO $$ BEGIN
  CREATE TYPE render_status AS ENUM (
    'queued', 'running', 'composing', 'encoding',
    'uploading', 'done', 'failed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. 父表
CREATE TABLE render_jobs (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id          uuid NOT NULL,
  project_id       uuid NOT NULL,
  user_id          uuid NOT NULL,
  status           render_status NOT NULL DEFAULT 'queued',
  progress         smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  stage            varchar(20),
  priority         smallint NOT NULL DEFAULT 50,
  preset           varchar(50),
  resolution       varchar(20),
  format           varchar(10),
  result_url       text,
  thumbnail_url    text,
  size_bytes       bigint,
  duration_ms      int,
  cost_credits     int,
  error            text,
  worker_id        varchar(50),
  attempt          smallint NOT NULL DEFAULT 0,
  idempotency_key  varchar(80),
  queued_at        timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  done_at          timestamptz,
  metadata         jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (id, queued_at)
) PARTITION BY RANGE (queued_at);

-- 3. 分区 (5 个月覆盖当前+未来. atlas 自动滚动新分区由 m2 的 cron job 负责)
CREATE TABLE render_jobs_2026_05 PARTITION OF render_jobs
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE render_jobs_2026_06 PARTITION OF render_jobs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE render_jobs_2026_07 PARTITION OF render_jobs
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE render_jobs_2026_08 PARTITION OF render_jobs
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE render_jobs_2026_09 PARTITION OF render_jobs
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- 4. 索引 (docs §5.6 + idempotency)
CREATE INDEX idx_render_jobs_status_priority ON render_jobs
  (status, priority DESC, queued_at) WHERE status IN ('queued', 'running');
CREATE INDEX idx_render_jobs_team    ON render_jobs (team_id, queued_at DESC);
CREATE INDEX idx_render_jobs_project ON render_jobs (project_id, queued_at DESC);

-- idempotency: (team_id, idempotency_key) 唯一, 仅当 key 非空. 父表+所有分区都需要,
-- 但 partial UNIQUE 不能跨分区强制全局唯一. m1 简化: 在每个分区内唯一 + 应用层
-- 在 POST 前 SELECT 检查最近 24h (典型 idempotency 窗口) 任一分区. 后续 m2 改为
-- 单独 idempotency 表 (跨分区强制唯一).
CREATE UNIQUE INDEX idx_render_jobs_idem_2026_05 ON render_jobs_2026_05
  (team_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX idx_render_jobs_idem_2026_06 ON render_jobs_2026_06
  (team_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX idx_render_jobs_idem_2026_07 ON render_jobs_2026_07
  (team_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX idx_render_jobs_idem_2026_08 ON render_jobs_2026_08
  (team_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX idx_render_jobs_idem_2026_09 ON render_jobs_2026_09
  (team_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 5. FK (分区父表的 FK 自动应用到所有分区)
ALTER TABLE render_jobs
  ADD CONSTRAINT render_jobs_team_fk    FOREIGN KEY (team_id)    REFERENCES teams(id)    ON DELETE CASCADE,
  ADD CONSTRAINT render_jobs_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  ADD CONSTRAINT render_jobs_user_fk    FOREIGN KEY (user_id)    REFERENCES users(id);

-- 6. RLS (docs §6: render_jobs 列在隔离列表). 与 asset/script/ai 模式一致: 直接
-- team_id 过, 无跨表 EXISTS. FORCE 必加 (manju superuser 在 dev 撞 leak 之前测过).
ALTER TABLE render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE render_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY render_jobs_team_isolation ON render_jobs
  USING (team_id = current_setting('app.team_id', true)::uuid);

COMMIT;
