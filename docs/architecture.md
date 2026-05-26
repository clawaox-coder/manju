---
doc: architecture
scope: [all]
applies-to: ["services/**", "src/**", "k8s/**"]
audience: [all-agents]
priority: critical
depends-on: [prd]
provides: [system-topology, service-boundaries, technology-choices, render-pipeline, collab-protocol]
purpose: 系统拓扑与服务边界. agent 决定"这个能力放哪个服务 / 跨服务怎么通信"时查询.
last-verified: 2026-05-25
---

# 技术架构

## 1. 拓扑

```
clients (web/ios/android)
        │ https / wss
        ▼
[ cdn + waf + lb ]   cloudflare + aliyun-slb
        │
        ▼
[ api-gateway ]      apisix
        │  rbac · ratelimit · audit · routing
        │
   ┌────┼────────────────┐
   ▼    ▼                ▼
[ business ]  [ collab ]      [ ai-gateway ]
go            python+pycrdt   python+fastapi
   │            │                 │
   ▼            ▼                 ▼
[ postgres ] [ redis ]       [ ai providers ]
[ s3      ]  [ kafka ]       claude / sd / sora / minimax
                                  │
                               ▼
                         [ render workers ]
                         go + ffmpeg + cuda
                               │
                               ▼
                         [ s3 / oss ]
```

## 2. 服务清单

```yaml
services:
  api-gateway:
    runtime: apisix
    role:    [authn, ratelimit, routing, audit, cors]
    sla:     "p99 < 5ms"

  auth-service:
    lang:    go
    db:      postgres
    owns:    [users, sessions, 2fa, oauth]
    exposes: ["/v1/auth/*", "/v1/me"]

  project-service:
    lang:    go
    db:      postgres
    cache:   redis
    owns:    [projects, drafts, shared, trash]
    exposes: ["/v1/projects/*", "/v1/drafts/*"]

  asset-service:
    lang:    go
    db:      postgres
    storage: s3
    owns:    [characters, scenes, props, music, sfx, voices]
    exposes: ["/v1/assets/*"]

  script-service:
    lang:    go
    db:      postgres
    owns:    [scripts, shots, script-versions]
    exposes: ["/v1/projects/:id/script", "/v1/projects/:id/shots"]

  render-service:
    lang:    go
    queue:   kafka
    storage: s3
    owns:    [render-jobs, render-workers]
    exposes: ["/v1/render/*"]
    workers: gpu-pool (k8s, t4 + a10 hybrid)

  ai-gateway:
    lang:    python + fastapi
    cache:   redis
    owns:    [ai-tasks, prompt-cache, provider-routing]
    exposes: ["/v1/ai/*"]
    providers:
      script:      [claude-sonnet-4-6, gpt-4o]
      image:       [sd-xl-turbo, midjourney-v7]
      tts:         [minimax, elevenlabs]
      video:       [sora, veo-2, self-research]
      consistency: [clip + custom-classifier]

  billing-service:
    lang:    go
    db:      postgres
    owns:    [plans, subscriptions, invoices, payments]
    exposes: ["/v1/billing/*"]
    integrations: [alipay, wechat-pay, stripe]

  notification-service:
    lang:    go
    cache:   redis
    queue:   redis-stream
    owns:    [notifications, email, webhooks]

  collab-service:
    lang:    python + fastapi
    transport: websocket
    cache:   redis (pubsub + presence)
    db:      postgres (collab_updates)
    crdt:    pycrdt (wire-compatible with browser yjs)
    owns:    [rooms, presence, yjs-sync, snapshot-merge]
    exposes: ["wss://api/v1/collab"]

  admin-service:
    lang:    go
    role:    [content-review-queue, ops-dashboard]
```

## 3. 技术选型决策

| 关注点 | 选型 | 替代品 | 理由 |
|---|---|---|---|
| 网关 | apisix | kong, nginx | etcd 配置, lua 插件, 国产可控 |
| 主数据库 | postgres@16 | mysql | 事务 + jsonb + RLS, 单库吃下大部分场景, 含剧本快照与 collab updates |
| 缓存 | redis@7 | memcached | 数据结构丰富, pubsub, stream |
| 队列 | kafka@3 | rabbitmq, pulsar | 事件溯源 + 重放 |
| 对象存储 | s3 + oss | minio | 双区容灾, cdn 集成 |
| 搜索 | meilisearch | elasticsearch | 中文友好, 内存小 |
| 业务语言 | go | node, java | 统一栈, 强类型 + cgo (ffmpeg) + 高并发 WS 扇出 (collab/notification), 金额安全 (billing) |
| ai / 协作 | python | node, go | ai sdk 生态最优; pycrdt 与浏览器 yjs wire 100% 兼容, 是 go-binding 不成熟时唯一生产级选择 |
| 容器编排 | k8s | nomad | 主流, gpu 调度成熟 |

## 4. 数据流

### 4.1 注册到产出第一个视频 (golden path)

```
1. POST /v1/auth/login                       → auth-service
2. POST /v1/projects                         → project-service
   └─ create team-default + project
3. PUT  /v1/projects/:id/script              → script-service
   └─ persist script + create version
4. POST /v1/ai/storyboard/generate           → ai-gateway
   ├─ claude-sonnet-4-6 拆分场景
   ├─ sd-xl-turbo 生成每镜画面
   └─ persist shots → script-service
5. POST /v1/ai/voice/match                   → ai-gateway
   └─ assign voice per shot
6. POST /v1/render                           → render-service
   ├─ enqueue job (kafka: render.requested)
   ├─ worker 拉取 + ffmpeg 合成
   ├─ upload s3
   └─ notify notification-service
7. wss /v1/collab → client                   → 推送 render.done event
```

### 4.2 实时协作 (yjs over websocket)

```
client A 编辑剧本 (浏览器 yjs)
   │ yjs.update (binary, wire-compatible)
   ▼
collab-service (python + pycrdt)
   ├─ persist to postgres (collab_updates)
   ├─ redis publish "room:<project_id>"
   ├─ snapshot merge → script_versions (每 100 updates 或 1h)
   └─ broadcast to other clients
       │
       ▼
   client B, C 应用 update (CRDT 自动合并)
```

## 5. 渲染管线

```yaml
priority-queue:
  topic:       kafka "render.requested"
  partition:   16
  consumer:    render-orchestrator
  sort:        "priority DESC, queued_at ASC"

priorities:
  enterprise:  p0   # < 30s 排队
  team:        p1   # < 2 min
  pro:         p2   # < 5 min
  free:        p3   # < 30 min

worker:
  runtime:     go
  binary:      ffmpeg + custom-compositor
  gpu:         t4 (default) | a10 (4k+)
  k8s:         HPA based on queue-length
  spot:        70% of pool, on-demand 30%

stages:
  - queued
  - rendering      # 拉取资源
  - composing      # 合成画面
  - encoding       # h.264 / h.265
  - uploading      # 上传 s3
  - done | failed

retry:
  max-attempts: 3
  backoff:      "1m, 5m, 15m"
```

## 6. ai-gateway 设计

```yaml
contract:
  endpoint:        "POST /v1/ai/:capability"
  capabilities:    [script.continue, storyboard.generate, voice.match,
                    consistency.check, edit.auto, image.generate, tts.synthesize]

routing:
  selector:        "capability + tenant-plan + region"
  primary:         declared per capability
  fallback:        on error or latency > threshold
  failover-threshold:
    timeout_ms:    30000
    error-rate:    0.05 (over 1m window)

cache:
  key:             "sha256(prompt + model + params + tenant_settings_version)"
  store:           redis
  ttl_days:        30
  hit-rate-target: ">40%"

cost-accounting:
  per-request:     "log input_tokens, output_tokens, duration_ms, cost_credits"
  sink:            "kafka topic: billing.usage"
  consumer:        billing-service

rate-limit:
  per-team:        "as declared in plan.ai_tokens_monthly"
  per-key:         "60 req/min default"
  enforcement:     api-gateway
```

## 7. 协作协议

```yaml
transport:    websocket
url:          "wss://api/v1/collab?token=<jwt>&room=<project_id>"
heartbeat:    "client → ping every 25s, server → pong"

room-model:
  room_id:    "= project_id"
  capacity:   "20 concurrent users per room"

crdt:
  library:    "pycrdt (server) ↔ yjs (browser), wire-compatible"
  doc-types:
    script:   Y.Text
    shots:    Y.Array<Y.Map>
    comments: Y.Array<Y.Map>

events:
  c2s:        [join, cursor.move, yjs.update, comment.new, ping]
  s2c:        [presence.join, presence.leave, yjs.update, notification.new, pong]

note:
  - "render.progress / render.done 由 notification-service (go) 推送,
     collab-service 只管 CRDT sync 与 awareness."

persistence:
  postgres:   "collab_updates (room_id, seq, update bytea, ts), ttl 90 days (cleanup cron)"
  snapshot:   "merged to script_versions after 100 updates or 1h"
```

## 8. 跨服务通信

```yaml
sync:
  protocol:     "http/2 + grpc"
  timeout_ms:   1000
  retries:      3 (idempotent only)
  circuit-breaker: hystrix-like (5xx > 50% / 10s)

async:
  protocol:     "kafka"
  topics:
    - render.requested
    - render.done
    - render.failed
    - billing.usage
    - audit.event
    - notification.queued
  delivery:     "at-least-once"
  consumer:     "must be idempotent"
```

## 9. 部署边界

```yaml
environments:
  local:        docker-compose
  dev:          k8s single-node
  staging:      k8s 3 nodes (1 az)
  prod:         k8s multi-az, 2 regions (active-active)

regions:
  cn:           aliyun-shanghai (primary), aliyun-shenzhen (dr)
  overseas:     aws-ap-northeast-1 (planned)
```

## 10. 可观测性

```yaml
metrics:        prometheus + custom
log:            loki + promtail
trace:          opentelemetry → tempo
client-error:   sentry
dashboards:     grafana
alert:          alertmanager → 钉钉 + on-call rotation

slo:
  api-availability: "99.9% over 30d"
  api-p99-ms:       "<500"
  render-success:   ">98%"
  page-fcp-ms:      "<1500"
```

## 11. 关键约束

```yaml
multi-tenancy:
  enforcement:   "postgres RLS + service-layer team_id check"
  see:           database.md#row-level-security

stateless-services:
  rule:          "业务服务不存本地 state, 重启可丢"
  exception:     render-worker (临时 ffmpeg 中间产物)

uniform-error:
  contract:      "all services return {error: {code, message, request_id, details}}"
  see:           api.md#standard-response

uniform-id:
  format:        "uuid v7 (timestamp-prefixed)"
  except:        "invoice id = INV-YYYY-MM-XXXX"
```
