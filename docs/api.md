---
doc: api
scope: [backend, integration]
applies-to:
  - "services/**"
  - "src/lib/api.ts"
  - "src/lib/api/**"
audience: [backend-agent, frontend-agent]
priority: critical
depends-on: [architecture, database, security]
provides: [http-contract, error-codes, websocket-spec, webhook-spec, sdk-stubs]
purpose: HTTP/WS/Webhook 协议契约. 写客户端代码或后端端点时必读. 修改前需同时更新本文档.
last-verified: 2026-05-24
---

# API 协议规约

## 1. 基础约定

```yaml
base-url:
  prod:      "https://api.manju-ai.studio"
  staging:   "https://api-staging.manju-ai.studio"
protocol:    "HTTPS, TLS 1.3+"
version:     "/v1"
encoding:    "UTF-8 JSON"
date-format: "ISO 8601 with TZ (RFC 3339)"
case:        "snake_case for fields"
```

## 2. 认证头

```http
Authorization: Bearer <jwt_access_token>      # 用户会话
X-API-Key: sk-mjs-xxxxxxxxxxxxxxxx            # 机器调用
X-Team-Id: <team_uuid>                        # 多团队用户切换上下文 (可选)
Idempotency-Key: <uuid>                       # POST 幂等键 (24h ttl)
```

## 3. 标准响应

### 成功
```json
{
  "data": { ... },
  "meta": { "request_id": "req_2026...", "request_ms": 142 }
}
```

### 列表 (cursor 分页)
```json
{
  "data": [ ... ],
  "meta": {
    "page_size": 20,
    "total": 158,
    "has_more": true,
    "next_cursor": "eyJpZCI6..."
  }
}
```

### 错误
```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "项目不存在或已被删除",
    "request_id": "req_2026...",
    "details": { "project_id": "..." }
  }
}
```

## 4. HTTP 状态码

| code | 用法 |
|---|---|
| 200 | 成功 GET/PATCH |
| 201 | 已创建 POST |
| 204 | 无内容 DELETE |
| 400 | 请求参数错误 (格式/类型) |
| 401 | 未认证 |
| 403 | 已认证但无权限 |
| 404 | 资源不存在 |
| 409 | 冲突 (重名 / 乐观锁失败) |
| 422 | 业务校验失败 (含 QUOTA_EXCEEDED) |
| 429 | 限流 |
| 500 | 服务器内部错误 |
| 502 | 上游 (AI provider) 错误 |
| 503 | 服务降级 / 维护 |

## 5. 错误码 (全表)

```yaml
errors:
  INVALID_TOKEN:           "Token 无效或过期"
  INSUFFICIENT_PERMISSION: "权限不足"
  RATE_LIMITED:            "触发限流"
  QUOTA_EXCEEDED:          "配额超限 (render/storage/seat/ai)"
  PROJECT_NOT_FOUND:       "项目不存在"
  INVALID_INPUT:           "输入校验失败"
  CONTENT_VIOLATION:       "内容违规"
  AI_PROVIDER_ERROR:       "AI 提供商错误"
  PAYMENT_REQUIRED:        "需要升级套餐"
  CONFLICT:                "乐观锁失败 / 名称重复"
  INTERNAL_ERROR:          "内部错误"
```

## 6. 分页

```yaml
strategy:    cursor-first
params:
  cursor:      string (opaque)
  page_size:   int (default 20, max 100)
sort:        "?sort=-updated_at,name"    # 前缀 - 倒序
filter:      "?status=done&genre=言情"   # 字段名直接做 query
```

## 7. 端点清单 (按服务分组)

### 7.1 auth-service

```yaml
POST   /v1/auth/register
  body: { email, password, name }
  ret:  201 { access_token, refresh_token, expires_in, user, team }
  side: 原子创建 user + team-default ("<name>'s Team", plan=free) + team_members(role=owner)
  rate: 3 req / hour / ip (security.md §8)

POST   /v1/auth/login
  body: { email, password, totp? }
  ret:  { access_token, refresh_token, expires_in, user, team }
  rate: 5 fail / 5min → 锁 15min (per-ip + per-account)

POST   /v1/auth/refresh
  body: { refresh_token }
  ret:  { access_token, refresh_token, expires_in }    # rotation: 颁发新对, 老 token 30s grace

POST   /v1/auth/logout
  body: { refresh_token }                              # 撤销 refresh_tokens 表 + redis 缓存

GET    /v1/auth/wechat/qrcode      → { ticket, qrcode_url }
GET    /v1/auth/wechat/status?ticket=...
POST   /v1/auth/wechat/callback

GET    /v1/me
  ret:  { user, team }                                 # team 含 role 字段
PATCH  /v1/me
  body: { name?, phone?, bio?, avatar? }
```

**Token 契约** (与 security.md §2 对齐):
- access_token: JWT RS256, claims `{sub, team_id, role, iat, exp, jti}`, TTL 15min
- refresh_token: opaque 32 bytes (base64url), TTL 30 天, 存 `refresh_tokens` 表 + `refresh:<sha256(token)>` redis 缓存
- 本地阶段: access + refresh 均走 JSON body. 接入 api-gateway 后 refresh 切 httpOnly cookie.

### 7.2 project-service

```yaml
GET    /v1/projects
  query: status, genre, q, sort, cursor, page_size

GET    /v1/projects/:id

POST   /v1/projects
  body: { name, genre, from: "script"|"idea"|"template", template_id? }
  ret:  201 with { data: <project> }

PATCH  /v1/projects/:id
  body: { name?, genre? }

POST   /v1/projects/:id/duplicate

DELETE /v1/projects/:id            # soft-delete (入回收站)
POST   /v1/projects/:id/restore
DELETE /v1/projects/:id/purge      # 永久删除

GET    /v1/drafts
DELETE /v1/drafts/:id
POST   /v1/drafts                  # 清空全部草稿

GET    /v1/shared                  # 与我分享的项目
POST   /v1/shared/:id/leave        # 离开

GET    /v1/trash
POST   /v1/trash/:id/restore
DELETE /v1/trash/:id
POST   /v1/trash/empty
```

### 7.3 script-service

```yaml
GET    /v1/projects/:id/script
  ret:  { content, format, word_count, scene_count, version_no, updated_at, updated_by }

PUT    /v1/projects/:id/script
  body: { content, expected_version_no }    # 乐观锁
  ret:  200 or 409

GET    /v1/projects/:id/script/versions
GET    /v1/projects/:id/script/versions/:version_no
POST   /v1/projects/:id/script/versions/:version_no/restore

GET    /v1/projects/:id/shots
POST   /v1/projects/:id/shots
  body: { title, shot_type, duration_ms, dialog, after_shot_id? }
PATCH  /v1/projects/:id/shots/:shot_id
DELETE /v1/projects/:id/shots/:shot_id
PUT    /v1/projects/:id/shots/reorder
  body: { order: [shot_id...] }
```

### 7.4 ai-gateway

```yaml
POST   /v1/ai/script/continue       # SSE 流式
  body: { project_id, context, instruction }
  sse:  start | delta | done | error

POST   /v1/ai/storyboard/generate   # 异步
  body: { project_id, style, shot_ids?, regenerate_all }
  ret:  { task_id, status: "queued" }

POST   /v1/ai/consistency/check
  body: { project_id }
  ret:  { avg_score, total_issues, characters: [...] }

POST   /v1/ai/consistency/fix
  body: { project_id, character_name, issue_index }

POST   /v1/ai/voice/match
  body: { project_id, auto_assign }

POST   /v1/ai/edit/auto
  body: { project_id, preset, params: { transition, bgm_intensity, subtitle_style, pace_cut } }

GET    /v1/ai/tasks/:task_id        # 异步任务查询
  ret:  { status, progress, result_data?, result_url?, error? }
```

### 7.5 render-service

```yaml
POST   /v1/render                   # idempotent
  header: Idempotency-Key
  body:   { project_id, resolution: "720p|1080p|2k|4k", format: "mp4|mov|webm",
            preset?, include_subtitle, watermark }
  ret:    { job_id, status: "queued", estimated_seconds, queue_position }

GET    /v1/render/:job_id
  ret:  { job_id, status, progress, stage, result_url?, thumbnail_url?,
          duration_ms?, size_bytes?, queued_at, started_at?, done_at?, error? }

DELETE /v1/render/:job_id

GET    /v1/render?project_id=...
```

### 7.6 asset-service

```yaml
# 5 个资源共享相同 CRUD 模式
collections:
  characters: /v1/assets/characters
  scenes:     /v1/assets/scenes
  props:      /v1/assets/props
  music:      /v1/assets/music
  sfx:        /v1/assets/sfx
  voices:     /v1/assets/voices

# 通用模式
GET    {collection}
  query: q, tags, cat, sort, cursor, page_size
POST   {collection}
  body: { name, description, tags, reference_image_url?, ai_generate? }
PATCH  {collection}/:id
DELETE {collection}/:id            # soft-delete

POST   /v1/projects/:id/shots/:shot_id/apply-asset
  body: { asset_type, asset_id }
```

### 7.7 billing-service

```yaml
GET    /v1/billing/usage
  ret:  { plan, renew_date, auto_renew, usage: { render, storage, seat, ai } }

GET    /v1/billing/plans

POST   /v1/billing/subscribe        # idempotent
  body: { plan, period: "monthly"|"yearly", payment_method_id }

POST   /v1/billing/cancel
  body: { reason? }

PATCH  /v1/billing/auto-renew
  body: { enabled: bool }

GET    /v1/billing/invoices
GET    /v1/billing/invoices/:id/pdf
```

### 7.8 api-keys

```yaml
GET    /v1/api-keys

POST   /v1/api-keys
  body: { name, permission: "read"|"write"|"readwrite" }
  ret:  { id, name, key: "<明文,只显示一次>", prefix, tail, permission, created_at,
          warning: "此密钥只显示一次,请立即复制" }

POST   /v1/api-keys/:id/revoke
DELETE /v1/api-keys/:id
```

### 7.9 团队

```yaml
GET    /v1/teams/:id
GET    /v1/teams/:id/members
POST   /v1/teams/:id/invites
  body: { email, role: "owner"|"admin"|"editor"|"viewer" }
DELETE /v1/teams/:id/members/:user_id
PATCH  /v1/teams/:id/members/:user_id
  body: { role }
```

### 7.10 文件上传

```yaml
POST   /v1/upload/sign
  body: { filename, content_type, size_bytes, purpose: "character|scene|music|..." }
  ret:  { upload_url, method: "PUT", headers, file_url, expires_in }

# 客户端流程:
# 1. POST /v1/upload/sign
# 2. PUT 文件到 upload_url
# 3. 用 file_url 作为资源 reference 调对应 asset POST
```

### 7.11 通知

```yaml
GET    /v1/notifications?unread=true
POST   /v1/notifications/:id/read
POST   /v1/notifications/read-all
```

## 8. WebSocket / 实时协作

```yaml
url:        "wss://api/v1/collab?token=<jwt>&room=<project_id>"
auth:       jwt in query (websocket 不能改头), 服务端 upgrade 时校验
heartbeat:
  client:   "{type:'ping'} every 25s"
  server:   "{type:'pong', ts}"
  timeout:  60s no-pong → server close

c2s-events:
  join:          { type: "join", room: "<project_id>" }
  cursor.move:   { type: "cursor.move", x, y, selection: [start, end] }
  yjs.update:    { type: "yjs.update", update: "<base64>" }
  comment.new:   { type: "comment.new", shot_id, text }

s2c-events:
  presence.join: { type: "presence.join", user: { id, name, color } }
  presence.leave:{ type: "presence.leave", user_id }
  yjs.update:    { type: "yjs.update", from: <user_id>, update: "<base64>" }
  render.progress: { type: "render.progress", job_id, progress }
  render.done:     { type: "render.done", job_id, result_url }
  notification.new: { type: "notification.new", data: {...} }
```

## 9. Webhook

```yaml
events:
  - render.done
  - render.failed
  - project.shared
  - quota.warning      # at 80%
  - quota.exceeded
  - team.member_joined

configure:
  POST /v1/webhooks
    body: { url, events: [...], secret }

delivery:
  headers:
    X-Manju-Signature: "sha256=<HMAC-SHA256(body, secret)>"
    X-Manju-Event:     "render.done"
    X-Manju-Delivery:  "<uuid>"

retry:
  attempts:  5
  backoff:   "1m, 5m, 30m, 2h, 12h"
  give-up:   "non-2xx after 5 attempts"
```

## 10. 限流

```yaml
defaults:
  per-key:   "60 req/min, 1000 req/h"

per-plan:
  free:      "60/m, 1000/h"
  pro:       "300/m, 5000/h"
  team:      "600/m, 20000/h"
  enterprise:"6000/m, unlimited/h"

headers-on-response:
  X-RateLimit-Limit:     "60"
  X-RateLimit-Remaining: "47"
  X-RateLimit-Reset:     "1716543200"   # unix ts

on-exceed:
  status: 429
  body:   { error: { code: "RATE_LIMITED", ... } }
  retry-after: header in seconds
```

## 11. 幂等性

```yaml
required-endpoints:
  - "POST /v1/render"
  - "POST /v1/billing/subscribe"
  - "POST /v1/projects"
  - "POST /v1/api-keys"
  - "POST /v1/upload/sign"

mechanism:
  header:     "Idempotency-Key: <uuid>"
  ttl_hours:  24
  storage:    "redis SET key:result"
  same-key-same-body:     "return first response"
  same-key-different-body:"return 409 with code=CONFLICT"
```

## 12. 版本管理

```yaml
current:      v1 (beta)
strategy:     "url-prefix versioning"
breaking:     "新版 v2, 旧版至少维护 12 个月"
deprecation:  'response 加 _deprecated_warning 字段 + Deprecation header'
changelog:    docs/changelog-api.md
```

## 13. SDK 规范 (内部团队实现时)

```yaml
client-libs:
  node:    "@manju/sdk (typed)"
  python:  "manju (typed via pydantic)"
  go:      "github.com/manju-org/sdk"

contract:
  - "自动重试 idempotent 端点"
  - "自动 refresh token"
  - "自动 SSE / WebSocket 重连"
  - "结构化错误 throw (ManjuError)"
```
