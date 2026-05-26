---
doc: prd
scope: [product]
applies-to: []
audience: [product-agent, all-agents]
priority: high
depends-on: []
provides: [user-personas, feature-scope, success-metrics, pricing-model, business-rules]
purpose: 产品形态与业务规则契约. agent 判断"该不该做这个功能 / 该这么做吗"时查询.
last-verified: 2026-05-24
---

# 产品需求规约 (PRD)

## 1. 产品定义

```yaml
name:        漫剧 AI Studio
category:    短剧创作 SaaS
positioning: 把"剧本 → 分镜 → 视频"全流程封装为 AI 辅助工作流
value-prop:  10 分钟产出第一部 AI 短剧 (传统 1-2 周)
```

## 2. 用户类型

```yaml
mcn:
  share:    35%
  needs:    [batch-output, quality-control, team-collab]
  pays:     team-plan
creator:
  share:    40%
  needs:    [low-barrier, style, commercial-license]
  pays:     pro-plan
comic-author:
  share:    15%
  needs:    [ip-derivative, character-consistency]
  pays:     pro-plan
writer-student:
  share:    10%
  needs:    [learn, prototype]
  pays:     free-plan
```

## 3. 功能矩阵

### 3.1 P0 (must-ship, 已在前端实现)

| 模块 | 路由 | 实现文件 | 关键交互 |
|---|---|---|---|
| dashboard | `/` | `src/pages/Dashboard.tsx` | hero + 4-stat + recent-projects + templates |
| projects | `/projects` | `src/pages/Projects.tsx` | grid/list 切换 + 筛选 + 搜索 + 右键菜单 |
| drafts | `/drafts` | `src/pages/Drafts.tsx` | 继续编辑 / 发布 / 删除 / 清空 |
| shared | `/shared` | `src/pages/Shared.tsx` | 团队分享, 离开共享 |
| trash | `/trash` | `src/pages/Trash.tsx` | 30 天倒计时, 恢复 / 永久删除 |
| script | `/script` | `src/pages/Script.tsx` | 左编辑器 + 右 AI 对话, 字数 / 场景统计 |
| storyboard | `/storyboard` | `src/pages/Storyboard.tsx` | 4 风格切换, 单镜重新生成 |
| consistency | `/consistency` | `src/pages/Consistency.tsx` | 综合评分 + 角色一致性 + 一键修复 |
| voice | `/voice` | `src/pages/Voice.tsx` | 配音卡片 + 分镜匹配 + 试听 |
| video | `/video` | `src/pages/Video.tsx` | **核心**: 3 栏 + dnd 时间轴 + 4 轨道 + 渲染对话框 |
| edit | `/edit` | `src/pages/Edit.tsx` | 6 风格预设 + 4 参数滑块 + 实时预览 |
| characters | `/characters` | `src/pages/Characters.tsx` | 4 列网格, 标签筛选, AI 生成 |
| scenes | `/scenes` | `src/pages/Scenes.tsx` | 4 列网格, 分类筛选 |
| props | `/props` | `src/pages/Props.tsx` | 6 列网格, 分类 + 右键菜单 |
| music | `/music` | `src/pages/Music.tsx` | 表格 + 播放控制 |
| sfx | `/sfx` | `src/pages/Sfx.tsx` | 表格 + 试听 + 波形 |
| settings | `/settings` | `src/pages/Settings.tsx` | 6 tab |
| billing | `/billing` | `src/pages/Billing.tsx` | 渐变卡片 + 4 用量条 + 套餐对比 + 发票 |
| apikeys | `/apikeys` | `src/pages/ApiKeys.tsx` | 列表 / 生成 / 撤销 / cURL 示例 |
| help | `/help` | `src/pages/Help.tsx` | 6 入口卡 + 快捷键 + FAQ |
| team | `/team` | `src/pages/Team.tsx` | 成员 + 权限 + 动态 |

### 3.2 P1 (next 12 months)

```yaml
dark-mode:           shipped         # src/hooks/useTheme.ts
mobile-responsive:   shipped         # src/components/layout/AppShell.tsx
i18n:                planned         # 简中/繁中/英/日
realtime-collab:     planned         # WebSocket, browser=yjs, server=python+pycrdt
comments:            planned         # 镜头级 + @mention
version-history:     planned         # 项目快照
share-link:          planned         # 短链 + iframe embed
```

### 3.3 P2

```yaml
one-click-publish:   [douyin, bilibili, video-account, youtube]
data-dashboard:      [plays, completion-rate, retention]
webhook:             render-done event push
ime-integration:     [slack, lark]
```

## 4. 套餐与配额

```yaml
plans:
  free:
    price_cents_monthly:   0
    render_per_month:      5
    storage_gb:            5
    seats:                 1
    ai_tokens_monthly:     100_000
    watermark:             forced
  pro:
    price_cents_monthly:   9900
    render_per_month:      50
    storage_gb:            50
    seats:                 1
    ai_tokens_monthly:     500_000
    watermark:             optional
    output_resolution:     [720p, 1080p, 2k, 4k]
  team:
    price_cents_monthly:   59900
    render_per_month:      120
    storage_gb:            200
    seats:                 10
    ai_tokens_monthly:     1_000_000
    api_access:            true
    sla:                   "99.9%"
  enterprise:
    price:                 contact-sales
    everything:            unlimited
    deployment:            [shared, private-cloud, on-prem]
    sso:                   [saml, oidc]
    audit_log:             true
```

## 5. 非功能契约

```yaml
performance:
  fcp_ms:              "<1500"
  tti_ms:              "<3000"
  page_transition_ms:  "<200"
  render_1080p_60s:    "<90000"     # 1 min 视频 < 90s
  ai_storyboard_1000w: "<30000"
  api_p99_ms:          "<500"
  concurrent_users:    5000

availability:
  uptime:              "99.9%"
  rpo_seconds:         300
  rto_seconds:         1800

a11y:
  standard:            "WCAG 2.1 AA"
  keyboard_full:       true
  contrast_min:        4.5
  aria_complete:       true

browser:
  chrome:              "last-2"
  edge:                "last-2"
  safari:              "last-2"
  firefox:             "latest"
  ie:                  not-supported

compliance:
  content_review:      true
  aigc_watermark:      true
  icp_filing:          required
  gdpr:                required-when-overseas
```

## 6. 北极星与关键指标

```yaml
north-star:
  metric:   "月活创作者中完成至少 1 部视频的比例"
  target_q1: 30%
  target_q4: 60%

key-metrics:
  registered_users:    {q3: 5000, q4: 10000, y1: 100000}
  wau:                 {q3: 2000, q4: 5000,  y1: 50000}
  paid_conversion:     {q4: 0.05, y1: 0.12}
  arpu_paid_cents:     {q4: 15000, y1: 30000}
  d30_retention:       {q4: 0.30, y1: 0.50}
  nps:                 {q4: 30, y1: 50}
```

## 7. 业务规则 (must-enforce by code)

```yaml
deletion:
  soft-delete-tables:    [projects, characters, scenes, props, music, sfx, voices, drafts]
  trash-retention-days:  30
  hard-delete-on:        "deleted_at + 30 days"
  restore-from-trash:    allowed
  see:                   database.md#soft-delete

quotas:
  enforcement:           [api-gateway, service-layer]
  exceed-action:         "return 422, code=QUOTA_EXCEEDED"
  warning-at:            0.80
  reset-on:              "1st of month, 00:00 UTC+8"
  see:                   api.md#error-codes

content-safety:
  pre-render-check:      mandatory
  fail-action:           [reject, audit-log, notify-user]
  provider:              [tencent-yaq, netease-yidun]
  see:                   security.md#content-safety

aigc-watermark:
  free-plan:             forced
  pro-plan:              optional
  team-plan:             optional
  text:                  "AIGC | 漫剧AI Studio"
  position:              bottom-right
  size:                  "5% of frame width"

idempotency:
  required-on:           [POST /v1/render, POST /v1/billing/subscribe, POST /v1/projects]
  header:                "Idempotency-Key"
  ttl_hours:             24

priority-queue:
  enterprise:            p0
  team:                  p1
  pro:                   p2
  free:                  p3
  see:                   architecture.md#render-pipeline
```

## 8. 风险登记

```yaml
risks:
  - id: ai-content-review-fail
    probability: high
    impact: high
    mitigation: "二级审核: AI + 人工队列"
  - id: gpu-cost-spike
    probability: medium
    impact: high
    mitigation: "spot + 自建 + 缓存中间产物"
  - id: render-queue-backlog
    probability: high
    impact: medium
    mitigation: "优先级队列 + 弹性扩容"
  - id: user-violation-upload
    probability: high
    impact: high
    mitigation: "上传扫描 + 用户协议 + 举报通道"
```

## 9. 范围外 (out-of-scope)

```yaml
not-in-scope:
  - "广告投放管理"
  - "演员真人形象上传 (肖像权风险)"
  - "成片直接发布到平台 (P1 才做)"
  - "音乐版权交易"
  - "Web3 / NFT"
```
