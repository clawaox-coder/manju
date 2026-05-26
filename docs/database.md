---
doc: database
scope: [backend, data]
applies-to:
  - "services/**/migrations/**"
  - "services/**/repo/**"
  - "services/**/models/**"
audience: [backend-agent, data-agent]
priority: critical
depends-on: [architecture, security, prd]
provides: [schema, ddl, indexes, rls, partitioning, backup-policy]
purpose: 数据契约. agent 写迁移 / 仓储层 / 查询前必读. 修改 schema 必须先改本文档.
last-verified: 2026-05-25
---

# 数据库契约

## 1. 存储拓扑

```yaml
postgres@16:
  role:     primary store (含剧本快照与 collab updates, 不再有独立文档库)
  features: [transactions, jsonb, RLS, partitioning, GIN, pg_trgm, bytea]
  size-est-2y: ~350GB

redis@7:
  role:     cache + sessions + queue + presence
  cluster:  yes
  persist:  AOF + RDB

meilisearch:
  role:     search
  indexes:  [projects, assets]
```

## 2. 共享约定

```yaml
id-type:        "uuid (v7, timestamp-prefixed) generated with gen_random_uuid()"
timestamp:      timestamptz
deleted_at:     "soft-delete columns (nullable timestamptz)"
case:           snake_case for tables and columns
plural:         "table names plural (users, projects)"
fk-on-delete:   "CASCADE for child rows, RESTRICT for refs"
optimistic-lock:"version_no int 或 expected_updated_at"
unique:         "unique constraints use indexes (faster check)"
```

## 3. 扩展

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid, 列加密
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- 模糊搜索 GIN
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "citext";         -- case-insensitive email
```

## 4. 枚举类型

```sql
CREATE TYPE user_status     AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE team_role       AS ENUM ('owner', 'admin', 'editor', 'viewer');
CREATE TYPE plan_tier       AS ENUM ('free', 'pro', 'team', 'enterprise');
CREATE TYPE project_status  AS ENUM ('draft', 'rendering', 'done', 'archived');
CREATE TYPE render_status   AS ENUM ('queued', 'running', 'composing', 'encoding',
                                     'uploading', 'done', 'failed', 'cancelled');
CREATE TYPE invoice_status  AS ENUM ('pending', 'paid', 'refunded', 'failed');
CREATE TYPE key_permission  AS ENUM ('read', 'write', 'readwrite');
```

## 5. 表 DDL

### 5.1 users
```sql
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
```

### 5.2 teams + team_members
```sql
CREATE TABLE teams (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            varchar(100) NOT NULL,
  slug            varchar(50) UNIQUE,
  plan            plan_tier NOT NULL DEFAULT 'free',
  seat_total      smallint NOT NULL DEFAULT 1,
  renew_date      date,
  auto_renew      bool NOT NULL DEFAULT true,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

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
```

### 5.2a refresh_tokens (auth-service)

`refresh_tokens` 是权威的 refresh 列表 (审计 / 设备列表 / 强制下线). Redis (`refresh:<token_hash>`) 仅作高频校验缓存, 失效以本表为准.

```sql
CREATE TABLE refresh_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id       uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  token_hash    varchar(64) UNIQUE NOT NULL,           -- sha256(opaque token) hex
  parent_id     uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL,  -- rotation chain
  user_agent    text,
  ip            inet,
  device_id     varchar(64),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  revoked_reason varchar(40),                          -- logout | rotated | forced | password_change
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user_active
  ON refresh_tokens (user_id, expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_expires
  ON refresh_tokens (expires_at) WHERE revoked_at IS NULL;
```

> **Token rotation**: refresh 请求颁发新 token, 旧 token 标记 `revoked_at` + `revoked_reason='rotated'`, 同时 redis 缓存 30s grace TTL (security.md §2).

### 5.3 projects
```sql
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

CREATE TABLE project_collaborators (
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission   key_permission NOT NULL DEFAULT 'read',
  shared_by    uuid REFERENCES users(id),
  shared_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
```

### 5.4 scripts + shots
```sql
CREATE TABLE scripts (
  project_id     uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  content        text NOT NULL DEFAULT '',
  format         varchar(20) NOT NULL DEFAULT 'markdown',
  word_count     int NOT NULL DEFAULT 0,
  scene_count    smallint NOT NULL DEFAULT 0,
  updated_by     uuid REFERENCES users(id),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  version_no     int NOT NULL DEFAULT 1
);

CREATE TABLE script_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_no   int NOT NULL,
  content      text NOT NULL,                      -- 全量 markdown 快照
  delta        bytea,                              -- yjs binary update (合并后), nullable
  shots_snapshot jsonb NOT NULL DEFAULT '[]',
  word_count   int NOT NULL DEFAULT 0,
  scene_count  smallint NOT NULL DEFAULT 0,
  size_bytes   int NOT NULL,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version_no)
);
CREATE INDEX idx_script_versions_project ON script_versions (project_id, version_no DESC);

CREATE TABLE shots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  order_index   int NOT NULL,
  num           varchar(10),
  title         varchar(200),
  shot_type     varchar(50),
  duration_ms   int NOT NULL DEFAULT 5000,
  dialog        text,
  image_url     text,
  bg_style      varchar(50),
  voice_id      uuid,                                  -- references voices(id), deferred
  metadata      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, order_index) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX idx_shots_project ON shots (project_id, order_index);
```

> **重排规则**:`BEGIN; UPDATE shots SET order_index=... WHERE id IN (...); COMMIT;`
> UNIQUE 约束 DEFERRABLE INITIALLY DEFERRED, 事务结束时检查, 避免临时冲突.

### 5.4a collab_updates (collab-service, python + pycrdt)

CRDT 操作日志, 替代历史方案中的 mongodb `yjs_updates` 集合. 由 collab-service (python) 写入, 浏览器侧仍使用 yjs (wire 兼容).

```sql
CREATE TABLE collab_updates (
  id           bigserial PRIMARY KEY,
  room_id      uuid NOT NULL,                       -- = project_id
  seq          bigint NOT NULL,                     -- 房间内单调递增
  client_id    bigint NOT NULL,                     -- yjs client id
  update       bytea NOT NULL,                      -- yjs binary update
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, seq)
);
CREATE INDEX idx_collab_updates_room_time ON collab_updates (room_id, created_at);
CREATE INDEX idx_collab_updates_room_seq  ON collab_updates (room_id, seq DESC);
```

> **保留策略**: 每日 cron 删除 `created_at < now() - INTERVAL '90 days'` 的行 (替代 mongo ttl-index).
> **快照协议**: collab-service 每累积 100 updates 或 1h, 用 pycrdt 合并出新 `script_versions` 行 (含完整 content + 合并后的 delta), 之后旧 `collab_updates` 可裁剪.

### 5.5 资产 (统一结构, 仅展示 characters)

```sql
CREATE TABLE characters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid REFERENCES teams(id) ON DELETE CASCADE,   -- NULL = 公共
  name            varchar(100) NOT NULL,
  description     text,
  tags            text[] NOT NULL DEFAULT ARRAY[]::text[],
  image_url       text,
  thumbnail_url   text,
  bg_style        varchar(50),
  avatar          varchar(10),                                    -- emoji
  uses_count      int NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES users(id),
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX idx_characters_team ON characters (team_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_characters_tags ON characters USING gin (tags);
CREATE INDEX idx_characters_name_trgm ON characters USING gin (name gin_trgm_ops);

-- scenes / props / music / sfx / voices 同样结构, 字段一致
```

### 5.6 render_jobs (按月分区)
```sql
CREATE TABLE render_jobs (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL,
  project_id      uuid NOT NULL,
  user_id         uuid NOT NULL,
  status          render_status NOT NULL DEFAULT 'queued',
  progress        smallint NOT NULL DEFAULT 0,
  stage           varchar(20),
  priority        smallint NOT NULL DEFAULT 50,
  preset          varchar(50),
  resolution      varchar(20),
  format          varchar(10),
  result_url      text,
  thumbnail_url   text,
  size_bytes      bigint,
  duration_ms     int,
  cost_credits    int,
  error           text,
  worker_id       varchar(50),
  queued_at       timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  done_at         timestamptz,
  metadata        jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (id, queued_at)
) PARTITION BY RANGE (queued_at);

CREATE TABLE render_jobs_2026_06 PARTITION OF render_jobs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE INDEX idx_render_jobs_status_priority ON render_jobs
  (status, priority DESC, queued_at) WHERE status IN ('queued','running');
CREATE INDEX idx_render_jobs_team ON render_jobs (team_id, queued_at DESC);
CREATE INDEX idx_render_jobs_project ON render_jobs (project_id, queued_at DESC);
```

### 5.7 ai_tasks
```sql
CREATE TABLE ai_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL,
  user_id       uuid NOT NULL,
  project_id    uuid,
  task_type     varchar(40) NOT NULL,   -- e.g. script.continue
  provider      varchar(40) NOT NULL,
  model         varchar(80),
  status        varchar(20) NOT NULL DEFAULT 'queued',
  prompt_hash   varchar(64),            -- 缓存命中检测
  input_tokens  int,
  output_tokens int,
  cost_credits  int,
  duration_ms   int,
  result_url    text,
  result_data   jsonb,
  error         text,
  cached        bool NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  done_at       timestamptz
);
CREATE INDEX idx_ai_tasks_team_created ON ai_tasks (team_id, created_at DESC);
CREATE INDEX idx_ai_tasks_prompt_hash ON ai_tasks (prompt_hash) WHERE prompt_hash IS NOT NULL;
```

### 5.8 api_keys
```sql
CREATE TABLE api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name         varchar(100) NOT NULL,
  prefix       varchar(20) NOT NULL,
  key_hash     varchar(255) NOT NULL,            -- bcrypt
  tail         varchar(8) NOT NULL,              -- last 4 chars for identification
  permission   key_permission NOT NULL DEFAULT 'readwrite',
  created_by   uuid REFERENCES users(id),
  last_used_at timestamptz,
  last_used_ip inet,
  revoked_at   timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_team ON api_keys (team_id);
CREATE INDEX idx_api_keys_prefix ON api_keys (prefix, key_hash) WHERE revoked_at IS NULL;
```

### 5.9 invoices
```sql
CREATE TABLE invoices (
  id              varchar(50) PRIMARY KEY,            -- INV-YYYY-MM-XXXX
  team_id         uuid NOT NULL REFERENCES teams(id),
  plan            plan_tier NOT NULL,
  amount_cents    int NOT NULL,
  currency        char(3) NOT NULL DEFAULT 'CNY',
  status          invoice_status NOT NULL DEFAULT 'pending',
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  payment_method  varchar(50),
  payment_intent  varchar(200),
  paid_at         timestamptz,
  refunded_at     timestamptz,
  pdf_url         text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_team_created ON invoices (team_id, created_at DESC);
```

### 5.10 notifications
```sql
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        varchar(50) NOT NULL,            -- e.g. render.done
  icon        varchar(20),
  color       varchar(20),
  title       varchar(200) NOT NULL,
  body        text,
  link_url    text,
  metadata    jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread
  ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
```

### 5.11 audit_logs (按月分区)
```sql
CREATE TABLE audit_logs (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id     uuid,
  user_id     uuid,
  action      varchar(80) NOT NULL,            -- e.g. project.create, api_key.revoke
  target_type varchar(50),
  target_id   varchar(80),
  ip          inet,
  user_agent  text,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX idx_audit_logs_team_created ON audit_logs (team_id, created_at DESC);
CREATE INDEX idx_audit_logs_user_created ON audit_logs (user_id, created_at DESC);
```

### 5.12 webhooks
```sql
CREATE TABLE webhooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES teams(id),
  url         text NOT NULL,
  events      text[] NOT NULL,
  secret_hash varchar(255) NOT NULL,
  active      bool NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_delivery_at     timestamptz,
  last_delivery_status int
);

CREATE TABLE webhook_deliveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id    uuid REFERENCES webhooks(id) ON DELETE CASCADE,
  event         varchar(50),
  payload       jsonb,
  status_code   int,
  response_body text,
  attempt       smallint,
  next_retry_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

## 6. Row-Level Security (RLS)

强制所有团队级表启用 RLS:

```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_team_isolation ON projects
  USING (team_id = current_setting('app.team_id', true)::uuid);

-- 应用层连接后立即设置上下文
SET LOCAL app.team_id = '<team_uuid>';
SET LOCAL app.user_id = '<user_uuid>';
```

```yaml
must-enable-rls:
  - team_members
  - projects
  - project_collaborators
  - scripts
  - shots
  - characters
  - scenes
  - props
  - music
  - sfx
  - voices
  - render_jobs
  - ai_tasks
  - api_keys
  - invoices
  - notifications        # 用 user_id 隔离
  - audit_logs
  - webhooks
```

## 7. 索引策略

```yaml
rules:
  - "复合索引: 高基数列放前"
  - "部分索引 (WHERE deleted_at IS NULL): 软删除场景节省 50%+"
  - "BRIN 索引: 大型时间序表 (audit_logs, ai_tasks)"
  - "GIN: 数组 / JSONB / 模糊搜索"
  - "避免索引超过 5 个 (写入放大)"

examples:
  partial:    "CREATE INDEX ... WHERE deleted_at IS NULL"
  brin:       "CREATE INDEX ... USING brin (created_at)"
  jsonb-path: "CREATE INDEX ON projects ((metadata->>'key'))"
```

## 8. 软删除规则

```yaml
soft-delete-tables: [projects, characters, scenes, props, music, sfx, voices, drafts]

mechanism:
  column:    deleted_at (nullable timestamptz)
  list-query: "WHERE deleted_at IS NULL"
  trash-query: "WHERE deleted_at IS NOT NULL AND deleted_at > now() - INTERVAL '30 days'"

hard-delete-cron:
  schedule:  "daily at 03:00 UTC+8"
  rule:      "DELETE WHERE deleted_at < now() - INTERVAL '30 days'"
  also-cleanup: "s3 files associated"

never-soft-delete:
  - audit_logs (compliance)
  - invoices   (compliance)
  - users      (anonymize fields instead, see security.md)
```

## 9. 触发器

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 对每张含 updated_at 的表创建
CREATE TRIGGER trg_projects_updated
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**audit_logs 通过应用层中间件写, 不用 db trigger** (业务上下文更丰富, 不影响 OLTP 性能).

## 10. (已废弃) MongoDB 集合

历史方案曾使用 mongodb 存 `script_versions` 与 `yjs_updates`. 自 2026-05-25 后端栈调整为 go + python 起, 此组件已**整体下线**:

- `script_versions` → 见 §5.4 同名 postgres 表 (content + delta bytea 全部入 pg)
- `yjs_updates` → 见 §5.4a `collab_updates` 表

新代码不应再引入 mongodb 客户端. 本节保留仅供 0.x 到 1.0 历史比对.

## 11. Redis 命名空间

```yaml
session:<token>:                "JWT access token 黑名单 (吊销前未过期 token), ttl=token 剩余有效期"
refresh:<sha256(token)>:        "refresh token 校验缓存 (权威为 postgres.refresh_tokens), ttl 30d"
rate:<api_key>:<endpoint>:      "rate limit counter, ttl 60s"
rate:login:<ip>:                "login 失败计数, ttl 5m, 阈值 5 → 锁 15m"
rate:register:<ip>:             "register 节流, ttl 1h, 阈值 3"
cache:project:<id>:             "project detail cache, ttl 5m"
cache:ai:<prompt_hash>:         "AI result cache, ttl 30d"
presence:<room>:                "online users set, refreshed 30s"
queue:render:<priority>:        "render queue zset, persisted to kafka"
quota:<team>:<resource>:        "usage counter, reset monthly"
lock:<resource>:                "distributed lock (redlock), ttl 5-30s"
```

## 12. Meilisearch 索引

```json
// projects index
{
  "uid": "projects",
  "primaryKey": "id",
  "searchableAttributes": ["name", "genre", "tags", "owner_name"],
  "filterableAttributes": ["team_id", "status", "genre", "deleted_at"],
  "sortableAttributes": ["updated_at", "name", "progress"]
}

// assets index (合并 5 个资产表)
{
  "uid": "assets",
  "primaryKey": "global_id",      // "characters:<uuid>"
  "searchableAttributes": ["name", "description", "tags"],
  "filterableAttributes": ["team_id", "type", "deleted_at"]
}
```

**同步**:DB 写入 → Kafka `db.change` topic → Meilisearch 消费 (异步, eventually consistent).

## 13. 备份与容灾

```yaml
postgres:
  full:        "pgBackRest, 每天 03:00"
  incremental: "WAL 持续归档"
  retention:   "30 天"
  off-site:    "异地 (北京 → 上海)"
  rpo:         "<5 min"
  rto:         "<30 min"
  replicas:    "1 sync + 2 async, 跨 AZ"

redis:
  topology:    "1 主 + 2 从 + sentinel"
  persist:     "AOF + RDB"
  loss-tolerated: "缓存数据允许丢失, 会话需保留"

s3:
  versioning:  enabled
  crr:         "cross-region replication"
  lifecycle:   "90d → IA, 1y → archive"
```

## 14. 迁移规则

```yaml
tool:           atlas (preferred) | flyway
location:       "services/<svc>/migrations/"
naming:         "NNNN_description.sql"
direction:      "forward-only (no down)"

deploy-order:
  1. schema-migration   (向后兼容, 加列 NULL)
  2. application-deploy (新代码同时支持新旧)
  3. data-backfill      (独立脚本, 避免长事务)
  4. cleanup-migration  (删旧列, 改 NOT NULL)

big-table-rules:
  - "ADD COLUMN ... NULL (不要 NOT NULL DEFAULT, 重写表)"
  - "CREATE INDEX CONCURRENTLY"
  - "分批 UPDATE: WHERE id BETWEEN <range>, 每批 10k, 间隔 100ms"

forbidden-in-migration:
  - "DROP COLUMN (先停用再下线)"
  - "RENAME (用 ADD + COPY + DROP 分两次发布)"
  - "长事务超过 1 分钟"
```

## 15. 容量规划 (2 年)

| 表 | 行数 | 单行 | 总大小 |
|---|---|---|---|
| users | 200K | 1KB | 200MB |
| teams | 50K | 0.5KB | 25MB |
| projects | 2M | 2KB | 4GB |
| scripts | 1M | 10KB | 10GB |
| script_versions | 5M | 12KB | 60GB |
| collab_updates (90d 滚动) | 200M | 0.4KB | 80GB |
| shots | 30M | 0.5KB | 15GB |
| assets total | 5M | 1KB | 5GB |
| render_jobs | 50M | 1KB | 50GB |
| ai_tasks | 200M | 0.5KB | 100GB |
| audit_logs | 500M | 0.3KB | 150GB |
| **total** | | | **~475GB** |

```yaml
postgres-prod-spec:
  primary:    "16 vCPU / 64 GB / 1.5 TB SSD"
  replica:    "8 vCPU / 32 GB" x 2

redis-prod-spec:
  cluster:    "6 nodes x 8 GB"
```
