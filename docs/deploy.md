---
doc: deploy
scope: [devops]
applies-to:
  - ".github/workflows/**"
  - "k8s/**"
  - "Dockerfile*"
  - "scripts/deploy/**"
audience: [devops-agent, sre-agent, backend-agent]
priority: high
depends-on: [architecture, security]
provides: [environments, ci-cd, k8s-conventions, rollout-strategy, runbook]
purpose: 部署与运维契约. agent 写 CI/CD / k8s manifest / 发版前必读.
last-verified: 2026-05-25
---

# 部署与运维

## 1. 环境

```yaml
environments:
  local:
    purpose:       开发
    infra:         docker-compose
    persistence:   ephemeral
    file:          docker-compose.yml

  dev:
    purpose:       集成测试
    infra:         k8s 1-node
    region:        aliyun-shanghai
    persistence:   shared db
    domain:        "*.dev.manju.internal"

  staging:
    purpose:       UAT, 预发
    infra:         k8s 3-node, 1-az
    region:        aliyun-shanghai
    persistence:   独立 db (复制部分 prod 数据脱敏)
    domain:        "*.staging.manju-ai.studio"

  prod:
    purpose:       生产
    infra:         k8s multi-az, 2-region active-active
    region:        aliyun-shanghai (primary), aliyun-shenzhen (dr)
    persistence:   主从 + 异地备份
    domain:        "*.manju-ai.studio"

config-source:
  local:         .env.local
  dev/staging:   k8s ConfigMap + Secret
  prod:          k8s ConfigMap + sealed-secret (sops 加密)
  禁止:          "在镜像里打包 prod 配置"
```

## 2. CI/CD 流水线

```yaml
ci:
  trigger:       "PR + push to main"
  provider:      github-actions
  workflows:     ".github/workflows/*.yml"

stages:
  pr-checks:
    parallel:
      - lint
      - typecheck
      - unit-tests
      - integration-tests
      - security-scan (sast + secrets)
    sequential-after:
      - build-image (multi-stage docker)
      - push-to-acr (aliyun-cr.cn-shanghai.aliyuncs.com)
      - e2e (playwright on chromium)
      - lighthouse-ci (frontend)
    gates:
      - all-green
      - 1+ approval
      - coverage-not-decreased
      - bundle-size-not-increased >5%

cd:
  trigger:       "merge to main"
  flow:
    - deploy-to-dev          (auto, 立即)
    - smoke-test             (auto, < 2 min)
    - deploy-to-staging      (auto, 等 dev 验证 30 min)
    - e2e-full-matrix        (chromium + webkit + firefox)
    - human-approval         (gh environment protection)
    - deploy-to-prod         (canary 1% → 10% → 50% → 100%)

rollback:
  trigger:       "5xx-error-rate > 5% over 5 min | manual"
  action:        "argo-rollouts undo, 自动回到上个稳定版本"
  data:          "数据库迁移不自动回滚 (向前兼容设计)"

argo-config:
  rollout-strategy: canary
  stable-replicas:  N
  canary-steps:
    - { setWeight: 1,  pause: { duration: "10m" } }
    - { setWeight: 10, pause: { duration: "10m" } }
    - { setWeight: 50, pause: { duration: "20m" } }
    - { setWeight: 100 }
  analysis:
    metrics:
      - "http-5xx-rate < 1%"
      - "p99-latency-ms < 500"
      - "container-restart < 3"
```

## 3. Docker 镜像规范

```yaml
base-images:
  go:         "alpine + scratch (multi-stage)"
  python:     "python:3.12-slim"
  node:       "node:22-alpine  # builder-only, 仅前端 vite build 阶段使用; 运行时全部走 nginx"

dockerfile-rules:
  - "multi-stage: builder + runtime, runtime 仅含运行时"
  - "non-root user (uid 10001)"
  - "HEALTHCHECK 必填"
  - "EXPOSE 文档化端口"
  - "LABEL: maintainer, version, git-commit, build-time"
  - "镜像大小 < 200MB (后端) / < 50MB (前端 nginx)"

registry:
  prod:       "registry.cn-shanghai.aliyuncs.com/manju/<svc>:<git-sha>"
  retention:  "保留最近 50 tag + 所有 release tag"
  signing:    cosign + sigstore (m2 引入)

scanning:
  - trivy (build-time)
  - aliyun-scc (registry-side)
  - alerts:    "critical CVE 自动 PR 升级"
```

## 4. Kubernetes 规范

```yaml
cluster:
  version:       "1.30+"
  ingress:       nginx-ingress | apisix-ingress
  cni:           calico
  storage:       "rook-ceph (sata) + nvme (cache)"
  gpu:           "nvidia-device-plugin + mig"

namespaces:
  layout:
    - manju-system        # operators, prometheus, etc
    - manju-prod          # all services
    - manju-prod-batch    # cron jobs, render workers
    - manju-staging
    - manju-dev

labels-required:
  app.kubernetes.io/name:        "<service>"
  app.kubernetes.io/version:     "<git-sha>"
  app.kubernetes.io/component:   "<api|worker|cron>"
  app.kubernetes.io/managed-by:  argocd

resource-rules:
  requests:    "总是设, 避免被驱逐"
  limits:      "memory 设, cpu 不设 (避免 throttle)"
  ratios:
    api-service:    "cpu 100m, mem 256Mi (req); mem 512Mi (limit)"
    worker:         "cpu 500m, mem 1Gi"
    gpu-worker:     "cpu 4, mem 16Gi, nvidia.com/gpu: 1"

readiness-liveness:
  required:    "每个 pod 必有"
  liveness:    "/healthz (轻量, 不查 db)"
  readiness:   "/readyz (查 db + 依赖)"
  initial-delay: 15s
  period:      10s

hpa:
  api:         "cpu > 70% 扩容, min 2 max 10"
  worker:      "queue-length > 50 扩容 (kafka-lag-exporter)"
  gpu:         "queue-length > 10 扩容"

pdb:
  required:    "所有 stateless service"
  min-available: "50%"

network-policy:
  default-deny: "命名空间外流量"
  explicit-allow: "service-to-service 必须明确"
```

## 5. 配置与密钥

```yaml
config-map:
  use-for:
    - non-sensitive env vars
    - feature flags (静态)
    - upstream service hosts
  example:
    apiVersion: v1
    kind: ConfigMap
    metadata:
      name: project-service-config
    data:
      LOG_LEVEL: info
      KAFKA_BOOTSTRAP: kafka.manju-system.svc:9092

secret:
  use-for:
    - database password
    - jwt-signing-key
    - ai-provider api-key
    - third-party (alipay, wechat-pay)

management:
  prod:      "sealed-secret + sops, git-stored encrypted"
  staging:   "k8s secret + 限制 rbac 读取权限"
  dev:       "明文 secret 可接受"

rotation:
  jwt-keys:          每月
  ai-provider-keys:  季度
  database-password: 半年
  禁止:              "硬编码到镜像"

dynamic-config:
  feature-flags:    growthbook
  ab-tests:         growthbook
  rate-limits:      apisix admin api
  ban-list:         redis 实时同步
```

## 6. 数据库部署

```yaml
postgres:
  topology:    "primary + 2 streaming replicas"
  spec:        "16vCPU / 64GB / 1.5TB SSD (prod, 含剧本快照与 collab updates)"
  backup:      "pgBackRest, daily full + continuous WAL"
  monitor:    [pg_exporter, query-stats]
  migration:   atlas + ci-job
  forbidden:
    - "在 prod 直接 psql + DDL"
    - "未通过 staging 的 schema 变更"

redis:
  topology:    "1 master + 2 replica + sentinel"
  spec:        "8GB ram each (prod cluster: 6 nodes)"
  persistence: AOF + RDB

s3:
  buckets:
    - manju-prod-assets        # 公开 CDN
    - manju-prod-userdata      # 私有, 签名访问
    - manju-prod-renders       # 私有, 签名访问
    - manju-prod-backups       # private, no public access ever
  policies:
    - bucket-versioning
    - cross-region-replication
    - block-public-access (除 assets)
    - server-side-encryption (sse-s3)
```

## 7. 监控告警

```yaml
metrics:
  collector:   prometheus + node-exporter + kube-state-metrics
  app:         opentelemetry sdk (4 个 signals)
  scrape:      "15s 间隔"
  retention:   "本地 15d, 长期 thanos 90d"

logs:
  collector:   loki + promtail
  format:      "json structured"
  required-fields:
    - request_id
    - user_id (可选)
    - team_id (可选)
    - service
    - level
    - timestamp
  retention:   "30d hot, 90d cold (s3)"

traces:
  collector:   otel-collector → tempo
  sampling:    "1% prod, 100% dev/staging"
  retention:   7d

dashboards:
  grafana:
    - business-overview        # 注册 / wau / 付费转化
    - api-health               # 5xx, p99, rps
    - render-pipeline          # queue, gpu util
    - ai-spend                 # token cost per provider
    - cost-tracker             # cloud monthly

alerts:
  channel:     钉钉机器人 + pagerduty (p0/p1)
  rotation:    "8 人 7×24, 1 周轮换"
  rules:
    - "api 5xx > 1% over 5m → p1"
    - "api p99 > 1s over 5m → p2"
    - "container restart > 3 in 10m → p1"
    - "disk > 85% → p2"
    - "kafka lag > 1000 → p2"
    - "render queue > 100 → p2"
    - "ai-provider error > 10% over 5m → p1"

client-monitoring:
  tool:        sentry
  capture:     "js error, perf, replay (10%)"
  pii-scrub:   "邮箱 / 手机 / token 自动脱敏"
```

## 8. 发布流程

```yaml
versioning:    semver (vMAJOR.MINOR.PATCH)
tag-format:    "v<X>.<Y>.<Z>"
release-branch: "release/v<X>.<Y>"

steps:
  1. cut release/v<X>.<Y> from main
  2. ci 跑全套 (e2e, load)
  3. deploy to staging, soak 24h
  4. 提交发布报告 (changelog + risk)
  5. 人工审批
  6. argo canary rollout (见 §2)
  7. soak prod 4h, monitor dashboards
  8. 全量 + post-release smoke test

hotfix:
  branch:      "hotfix/<issue>"
  from:        main (or last release tag)
  flow:        "跳过 staging, 直接 canary 1% → 100%, 4h gating"
  approval:    "p0 故障可 oncall 直接批"
  post-fix:    "必须回填测试 + retro within 48h"
```

## 9. Runbook (常见故障)

```yaml
api-5xx-spike:
  detect:    "alert: http-5xx-rate > 5% over 5m"
  steps:
    - 1. "查 grafana api-health dashboard 定位 service"
    - 2. "查 loki ERROR 关键字 → 找堆栈"
    - 3. "查 tempo trace 看依赖延迟"
    - 4. "若是单实例: kubectl delete pod -l app=<svc>"
    - 5. "若是全实例: argo-rollouts undo"
    - 6. "若是依赖 (db/redis): 看依赖 dashboard"

render-queue-backlog:
  detect:    "render-queue-length > 100"
  steps:
    - 1. "查 worker pod 数 → 看是否 hpa 没扩"
    - 2. "kubectl scale 强制扩容到 max"
    - 3. "查 ai-provider 是否限流 → 切备用 provider"
    - 4. "若 gpu 资源耗尽: spot fleet 申请"

database-connection-exhausted:
  detect:    'app log: "too many connections"'
  steps:
    - 1. "查 pg_stat_activity 找长事务"
    - 2. "pg_terminate_backend(pid) 杀长事务"
    - 3. "查应用 pool 配置, 调小 max-conn"
    - 4. "升级 db 实例 (临时)"

disk-full:
  detect:    "disk > 90%"
  steps:
    - 1. "node-exporter 看哪个 mountpoint"
    - 2. "若 logs: rotate + 提前清旧"
    - 3. "若 db: 立即扩盘 (aliyun rds 支持热扩)"
    - 4. "若 s3 缓存: 清 cdn / lifecycle 提前归档"
```

## 10. 容量规划

```yaml
review-cadence:    "月度容量评审"

scale-triggers:
  cpu-avg-7d:      ">50% → 扩 30%"
  memory-peak:     ">70% → 扩 50%"
  db-connections:  ">70% → 升档"
  storage:         ">70% → 扩 50%"
  cost-anomaly:    "月环比 > 30% → 复盘"

cost-attribution:
  by-team:         "通过 k8s label 聚合 cost"
  by-tenant:       "通过 prometheus label (team_id) 聚合 ai/render 成本"
```

## 11. 灾难恢复 (DR)

```yaml
rpo:               "<5 min"
rto:               "<30 min"

drills:
  cadence:         "季度 chaos mesh"
  scenarios:
    - "kill primary db, 验证自动 failover"
    - "kill an az, 验证流量切换"
    - "kafka broker 全挂, 验证恢复"
    - "ai provider 全部异常, 验证降级"

backup-restore-drill:
  cadence:         "季度"
  test:            "从异地备份恢复整套 db 到隔离环境"
```

## 12. 合规

```yaml
icp-filing:        required
content-review:    "接 tencent-yaq / netease-yidun"
data-residency:    "国内用户数据不出境"
audit-log:         "保留 90d, s3 immutable"

privacy:
  - "用户导出全部数据接口"
  - "删除账户接口 (T+30 物理删除)"
  - "cookie 同意横幅"
```
