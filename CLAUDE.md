# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 交流与注释默认使用中文（遵循仓库既有 `docs/` 风格与全局约定）。

## 项目是什么

漫剧 AI Studio（`manju-ai-studio`）—— AI 短剧创作平台，主流程 **剧本 → 分镜 → 视频**。
这是一个 **monorepo**：

- **前端**：仓库根目录，React 19 SPA（Vite 8 + TS 6），其中 `src/pages/Canvas/` 的 tldraw 画布 + 画布 AI Agent 是当前迭代重心。
- **后端**：`services/` 下 6 个微服务 —— 5 个 Go 服务 + 1 个 Python(FastAPI) 服务。

## ⚠️ 先读：文档与代码的已知偏差

`docs/` 是**面向 AI 智能体的设计规范**（见 `docs/INDEX.md`，有 frontmatter 协议和「任务→文档」映射表，写代码前值得查）。但其中部分**状态描述已过时**，直接照做会被误导：

| 文档/README 的说法 | 实际现状（以代码为准） |
|---|---|
| `backend: not-started` / `ai-gateway: not-started`（INDEX、README） | 6 个后端服务**已实现**并接入 CI |
| 前端「目前用本地 mock」 | 已有真实 API client 层（`src/lib/api/`）+ 每服务一个 hook；mock 仅残留于 editor/domain 状态 |
| `TanStack Query (待引入)` / `react-hook-form (待引入)`（coding-standards） | TanStack Query **已接入**（见 `src/hooks/use*Api.ts`） |
| `npm install` / `npm run dev`（README） | 包管理器是 **pnpm**（见下） |
| 文档里的绝对路径 `/Users/aox/manju` | 是另一环境的路径，按仓库相对路径理解即可 |

**结论**：把 `docs/` 当「设计意图 + 契约约定」读（命名规范、API 信封、错误码、RLS 模型这些仍然有效），但任何「是否已实现」的判断都要回到代码确认。

## 常用命令

### 前端（仓库根目录，用 pnpm）

```bash
pnpm install
pnpm dev            # vite, http://localhost:5173
pnpm build          # tsc -b && vite build（类型错误会 fail）
pnpm lint           # eslint .
pnpm test           # vitest run（jsdom）
pnpm test:watch
```

- 包管理器锁定为 `pnpm@11.3.0`，唯一锁文件是 `pnpm-lock.yaml`，工作区 `pnpm-workspace.yaml` 含 `services/*`。**用 pnpm，不要用 npm/yarn**（CI frontend job 已统一用 pnpm + `--frozen-lockfile`）。
- 跑单个测试：`pnpm exec vitest run src/test/auth.test.tsx`，或按用例名 `pnpm exec vitest run -t "用例关键字"`。
- e2e（Playwright，配置 `playwright.config.ts`，用例在 `e2e/`）：`pnpm exec playwright test`（需先起前端 + 后端）。

### Go 服务（`cd services/<svc>`，统一 Makefile）

```bash
make dev               # 本地起服务（需先起 scripts/dev 的 docker 栈）
make test              # = test-unit + test-integration
make test-unit         # go test -race -short ./internal/...（无需 docker）
make test-integration  # testcontainers 起 pg+minio（需 docker，较慢）
make lint              # go vet ./...
make build             # 编译到 bin/
make migrate           # atlas 应用迁移（用 SUPERUSER DSN）
make migrate-hash      # 写完新迁移后必跑，锁迁移目录
make sqlc              # 从 queries/ + migrations/ 生成 Go（仅装了 sqlc.yaml 的服务）
```

- 工具链要求：**Go 1.25+、docker、[atlas](https://atlasgo.io)、[sqlc](https://sqlc.dev)**。
- 跑单个 Go 测试：`go test -run TestXxx ./internal/...`。
- 模块路径统一为 `github.com/manju-org/manju/services/<svc>`。

### ai-gateway（`cd services/ai-gateway`，Python 3.12）

```bash
pip install -r requirements.txt
make dev    # uvicorn app.main:app --reload --port 8005
make test   # pytest tests/
make lint   # ruff check app/
```

### 本地基础设施（一次性搭好整套依赖）

```bash
cd scripts/dev
cp .env.example .env.local       # 一次性
./jwtgen.sh                      # 生成 RS256 密钥对 secrets/jwt-{private,public}.pem
docker compose up -d             # pg + redis + minio + kafka + 全部服务
```

`docker-compose.prod.yml` 是生产编排（含 `frontend` nginx 镜像 + `render-worker`）；`scripts/dev/docker-compose.yml` 是本地开发栈，二选一，别混用。

### CI（`.github/workflows/ci.yml`）

5 个 job：`frontend`（tsc --noEmit + eslint `--max-warnings=20` + build）、`go-services`（matrix：build/vet/`test -short`）、`ai-gateway`（pytest，排除 integration）、`docker-build`（构建全部 7 个镜像）、`integration-tests`（render-service 的 testcontainers 集成测试）。

## 架构总览

### 全局形态与端口

前端是独立 SPA，通过 **HTTP 直连**各服务（**没有 vite proxy / 网关聚合**），跨域靠各 Go 服务的 `CORS_ORIGINS` 放行 `:5173`。

| 服务 | 端口 | 语言 | 职责 | 额外依赖 |
|---|---|---|---|---|
| auth-service | 8001 | Go | 登录/JWT 签发/刷新、team 成员 | redis |
| project-service | 8002 | Go | 项目 CRUD | — |
| script-service | 8003 | Go | 剧本 | — |
| asset-service | 8004 | Go | 资产（角色/场景/道具/音乐/音效）+ 上传预签 + 项目↔资产关联 | minio(S3) |
| ai-gateway | 8005 | Python | AI 任务（剧本续写、分镜生成…）、画布 Agent 后端 | Anthropic API |
| render-service | 8006 | Go | 渲染任务 + 异步 worker | minio + kafka + ffmpeg |

### 前端数据流

```
页面/组件 → src/hooks/use*Api.ts (TanStack Query) → src/lib/api/*.ts → client.ts(fetch) → 各服务
                                                          ↘ src/store/index.ts (zustand+persist, editor/UI 状态 + 残留 mock)
```

- **`src/lib/api/client.ts`** 是唯一 fetch 封装：统一抛 `ManjuError`(code/status/requestId/details)、自动带 `Authorization: Bearer`、遇 `401 INVALID_TOKEN` 自动 refresh 并**重试一次**。
- 每服务一个 client 模块（`auth/projects/scripts/assets/ai/render.ts`）+ 一个 hook（`useAuthApi` 等），**1:1 对应后端服务**。base URL 走 `VITE_PUBLIC_*_API_BASE` 环境变量，默认 `localhost:8001..8006`。
- **响应信封**：单对象 `{ data }`（`request()` 自动剥 `.data`）；列表 `{ data, meta }`（`requestEnvelope()`，`meta` 含 cursor 分页 `next_cursor/has_more/page_size`）。错误信封 `{ error: { code, message, request_id, details } }`。
- 状态边界：server-state 用 TanStack Query；global-ui / editor 用 zustand（`src/store/`，persist）；URL 用 react-router。**禁止在组件里直接 fetch**。
- 页面级懒加载统一用 `src/lib/lazyWithRetry.ts`，不要直接用 `React.lazy`。
- **Canvas**（`src/pages/Canvas/`）：基于 tldraw，自定义 `ManjuNode` 形状（`canvas/ManjuNodeUtil` + `View`），`buildGraph.ts` 组装节点图，`persistence.ts` 持久化，`agent/`（`AgentStateMachine` + `AgentMessages` + types）驱动画布上的 AI Agent，`chat/` 是对话面板。

### Go 服务统一分层（5 个服务结构完全一致）

入口 `cmd/server/main.go` 装配：`config.FromEnv()` → pgx pool → (S3/redis) → `token.LoadVerifier`(JWT 公钥) → repo → service → handler → chi 路由。请求流：

```
chi router → 中间件链(Recoverer/Tracing/RequestContext/AccessLog/CORS/RateLimit/RequireAuth[/RequireWriteRole])
          → handler（解析+校验，internal/handler）
          → service（业务逻辑，internal/service）
          → repo（pgx/sqlc，internal/repo）
```

固定子包：`config`(环境变量) / `handler` / `service` / `repo` / `httpx`(HTTP 辅助+信封) / `apperr`(错误码) / `token`(JWT 验证) / `middleware` / `logger`(zerolog)。
每个服务都暴露 `/healthz` 和 `/metrics`(Prometheus)，业务路由挂在 `/v1` 下且整体 `RequireAuth`，写操作再叠 `RequireWriteRole`。可观测性：otel tracing（OTLP）+ Prometheus + zerolog 结构化日志。**新增服务/端点时照搬这套骨架，不要另起炉灶。**

### render-service 异步管线

除标准 server 外多一个 `cmd/worker`（kafka 消费者）。`POST /v1/render` 投递到 kafka topic **`render.requested`**（16 partition，`key=team_id`），worker 用 `internal/ffmpeg` 执行渲染、产物入 S3。本地首次可能撞「Unknown Topic」，按 `scripts/dev/README.md` 手动建 topic。

### 数据库 & RLS —— ⚠️ 最容易踩的坑

所有服务共用**单个** postgres 库 `manju`，靠 **Row-Level Security 按 `team` 隔离**。库里有**两个 role**：

- **`manju`**：SUPERUSER —— **会绕过 RLS**，**只**用于 atlas 迁移（`MIGRATE_DATABASE_URL`）。
- **`manju_app`**：非 owner，运行期 DSN（`DATABASE_URL`）—— RLS 真正生效。

**用错 role（拿 `manju` 当运行 DSN）会让 RLS 静默失效、跨 team 数据泄漏**，且本地自测看起来「正常」。Makefile 已把这两个 DSN 分开（`DATABASE_URL` vs `MIGRATE_DATABASE_URL`），改库相关代码前务必读 `scripts/dev/README.md` 和 `docs/database.md`。

迁移用 **atlas**（每个 Go 服务有 `atlas.hcl`），查询代码用 **sqlc**（装了 `sqlc.yaml` 的服务从 `queries/` + `migrations/` 生成；目前 `queries/` 实际有内容的是 auth / project）。写完迁移记得 `make migrate-hash`。

### 鉴权

auth-service 用 **RS256 私钥签发** access/refresh JWT；其余服务用**共享公钥**（`JWT_PUBLIC_KEY_PATH` → `token.LoadVerifier`）验证，无需互相调用。服务间内部调用走 internal token（Go 的 `internal/token` + ai-gateway 的 `app/internal_token.py`）。本地密钥由 `scripts/dev/jwtgen.sh` 生成。

## 关键约定（跨前后端统一，详见 `docs/coding-standards.md` 与 `docs/INDEX.md §6`）

- **租户一律叫 `team`**（不用 org/workspace/tenant）。
- **ID 用 UUID v7 字符串**；时间戳 **ISO 8601 带时区**；金额用整数分、字段后缀 `_cents`；时长用整数毫秒、后缀 `_ms`；AI 任务类型点分（`script.continue`、`storyboard.generate`）。
- **API 字段是 snake_case**，前端在 api client 边界转 camelCase（类型定义对齐 `docs/api.md`）。
- **TS**：strict 全开；禁 `any`/`enum`/`as` 强转/`namespace`；type-only import 必须带 `type` 关键字；`@/` 别名指向 `src/`（`tsconfig.app.json` + `vite.config.ts` 已配）。
- **React**：只用函数组件 + hooks；`ui/*` 原语用 forwardRef + displayName；className 透传用 `cn()`；不预防式 memo。
- **无生产用户阶段**：直接改 API/DB，**不做向后兼容层**。
- commit message：`<type>(<scope>): <subject>`（type ∈ feat/fix/refactor/perf/docs/test/chore/style/build/ci），body 解释 WHY；注释只写 WHY，不复述 WHAT。

## 变更管理：OpenSpec

仓库用 **OpenSpec** 管理较大变更（`openspec/changes/` 下有进行中的 `improve-canvas-interaction`、`improve-dark-mode`、`project-reference-assets`）。对应 skill 可用：`opsx:propose` / `opsx:apply` / `opsx:archive` / `opsx:explore`。做成规模的功能时，优先走这套流程产出 proposal/spec/tasks。
