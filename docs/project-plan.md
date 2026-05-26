---
doc: project-plan
scope: [meta]
applies-to: []
audience: [pm-agent, all-agents]
priority: low
depends-on: [prd, architecture]
provides: [milestones, current-status, agent-task-pool]
purpose: 工作流跟踪. agent 接活时查 §3 决定优先级.
last-verified: 2026-05-25
---

# 项目计划

## 1. 当前状态

```yaml
phase:           m0-frontend-prototype-done
frontend:        shipped
backend:         not-started
ai-gateway:      not-started
infra:           not-started

shipped-frontend:
  pages:         21
  ui-primitives: 17
  hooks:         3 (useShortcuts, useConfirm, useTheme)
  store:         zustand + persist
  features:      [dark-mode, mobile-responsive, route-error-boundary, lazy-retry,
                  shortcuts-overlay, command-search, context-menus, dnd-timeline,
                  framer-motion, error-boundary]
```

## 2. 里程碑

```yaml
m1-backend-mvp:
  window:    2026-Q3
  goal:      "100 内测用户跑通 end-to-end"
  deliverables:
    - auth-service (login, jwt, 2fa)
    - project-service (CRUD + soft-delete)
    - script-service (script + shots)
    - asset-service (5 类资产 + S3 上传)
    - ai-gateway 接入 1 个能力 (推荐 script.continue)
    - render-service + 1 个 GPU worker
    - 前端 mock → API (TanStack Query)
    - basic k8s + ci/cd
  exit-criteria:
    - "用户从注册到产出 1080p 1min 视频 < 30 min"
    - "服务可用性 >= 99%"
    - "100 内测激活率 >= 70%"

m2-public-beta:
  window:    2026-Q4
  goal:      "首批付费 100 人"
  deliverables:
    - collab-service (python + pycrdt over websocket, browser 仍用 yjs)
    - billing-service + 支付 (alipay + wechat-pay)
    - 智能剪辑 (6 风格)
    - 角色一致性 v2
    - api-keys + 文档站
    - 暗色 / 移动 / i18n 完整化
  exit-criteria:
    - "付费转化 >= 5%"
    - "d7 留存 >= 40%"

m3-team-ga-mobile:
  window:    2027-Q1
  goal:      "MCN 客户为主, wau 5k"
  deliverables:
    - 团队版 GA
    - 模板市场
    - ios / android (react-native)
    - 数据看板
    - 一键分发 (douyin, bilibili, video-account)
    - webhook + zapier

m4-enterprise-overseas:
  window:    2027-Q2
  goal:      "大客户 5 家 + 海外 10k 注册"
  deliverables:
    - 私有部署 / on-prem
    - sso (saml + oidc)
    - 审计日志 + 合规导出
    - 多语言 (en, ja, ko)
    - aws / gcp 区域
    - paypal / stripe
    - gdpr 合规
```

## 3. Agent 任务池 (m1 必做项, 顺序执行)

```yaml
tasks:
  - id: T-001
    title: 招聘 / 分配团队
    status: blocked-on-human
    blocker: "需要人类决定团队规模"

  - id: T-002
    title: bootstrap k8s + ci/cd
    blockedBy: [T-001]
    deliverables:
      - "k8s staging (3 nodes) + prod (3 nodes)"
      - "github-actions: lint + typecheck + test + build + deploy"
      - "argocd / flux gitops"
      - "prometheus + grafana + loki"

  - id: T-003
    title: postgres + redis + s3 + kafka 基础设施
    blockedBy: [T-002]

  - id: T-004
    title: auth-service mvp
    blockedBy: [T-003]
    spec: api.md#auth-service
    schema: database.md#users teams team_members
    estimate: 2 sprints

  - id: T-005
    title: project-service mvp (含 drafts/shared/trash)
    blockedBy: [T-004]
    spec: api.md#project-service
    schema: database.md#projects
    estimate: 2 sprints

  - id: T-006
    title: 前端 mock 替换为 API
    blockedBy: [T-005]
    files:
      - "src/data/mock.ts → src/lib/api/* (TanStack Query)"
      - "src/store/index.ts (移除领域数据, 仅留 UI state)"
    estimate: 1.5 sprints

  - id: T-007
    title: asset-service + s3 上传
    blockedBy: [T-005]
    estimate: 2 sprints

  - id: T-008
    title: script-service + shots
    blockedBy: [T-005]
    estimate: 1.5 sprints

  - id: T-009
    title: ai-gateway + script.continue (sse 流式)
    blockedBy: [T-008]
    spec: api.md#ai-gateway
    estimate: 2 sprints

  - id: T-010
    title: render-service + 1 gpu worker
    blockedBy: [T-008]
    spec: api.md#render-service, architecture.md#render-pipeline
    estimate: 3 sprints

  - id: T-011
    title: 内测发布 + 100 用户招募
    blockedBy: [T-006, T-009, T-010]
```

## 4. 资源估算

```yaml
team-mvp-6p:
  composition: "pm × 1, fullstack × 3, ai × 1, designer × 1"
  monthly-cost: 360_000_cny       # 估含五险
  m1-duration: "12 weeks"
  m1-cost:     1_080_000_cny

team-mvp-14p:
  composition: "pm 1, designer 1, fe 2, be 3, ai 2, gpu 1, sre 1, qa 1, ops 1, cs 0.5"
  monthly-cost: 710_000_cny
  m1-duration: "8 weeks"
  m1-cost:     1_420_000_cny

infra-monthly-est:
  gpu-render:    50_000_cny
  k8s-compute:   15_000_cny
  databases:     10_000_cny
  s3-cdn:        8_000_cny
  ai-api-calls:  30_000_cny
  monitoring:    3_000_cny
  security:      4_000_cny
  network:       6_000_cny
  total:         126_000_cny
```

## 5. 风险与依赖

```yaml
critical-path:
  T-004 → T-005 → T-008 → T-010 → T-011
  blockers-must-clear:
    - "k8s gpu 调度配置"
    - "ai provider 商务合同"
    - "支付通道合规审批"

cancellation-criteria:
  m1-fail:
    - "内测用户 < 50"
    - "完整产出率 < 30%"
    - "端到端时长 > 3 min"
    - "安全事故 >= 1"
  m2-fail:
    - "wau < 1k"
    - "付费转化 < 2%"
    - "d30 留存 < 15%"
    - "p0 故障 > 3 次"
  action:    "36h 全员复盘 → 决定调整方向 (b2b / 跨境 / 工具化)"
```

## 6. Definition of Done

```yaml
per-task-must:
  - "代码 PR review 通过 (1+ approval)"
  - "测试添加 (unit + integration)"
  - "文档更新 (api / db / 用户文档)"
  - "监控埋点 (业务 + 性能)"
  - "灰度计划 (1% → 10% → 50% → 100%)"
  - "回滚方案"
  - "安全评审 (涉及敏感数据)"

per-sprint:
  - "demo (周五)"
  - "retro (周五)"
  - "okr 进度复盘 (周末)"
```

## 7. 与文档同步要求

```yaml
when-changing-schema:
  must-update: [database.md]

when-changing-api:
  must-update: [api.md]

when-changing-ui-token:
  must-update: [design-system.md]

when-changing-rules:
  must-update: [coding-standards.md]

when-changing-security:
  must-update: [security.md]

enforcement:
  - "pr ci 检查 docs/ 是否同时更新"
  - "未更新文档的 pr 不允许合并"
```
