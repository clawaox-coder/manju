---
doc: index
scope: [meta]
applies-to: ["docs/**"]
audience: [all-agents]
priority: critical
purpose: 文档总索引. agent 第一次接触项目时读这一份, 根据任务选择性加载具体文档.
last-verified: 2026-05-24
---

# 文档索引

## 0. 读者契约

所有 `docs/` 下的文档**目标读者是 AI 智能体**, 不是人类开发者. 风格契约:
- 显式规则 > 描述性散文
- 决策表 > 主观建议
- 可测试断言 > 模糊目标
- 文件路径精确到行 (用 `src/components/ui/button.tsx:42`)
- 跨引用用 `see: api.md#auth`, 禁止复制粘贴

## 1. Frontmatter 协议

每份文档顶部 YAML 字段:

```yaml
doc:           string         # 文档标识 (kebab-case, 唯一)
scope:         string[]       # [frontend|backend|ai|devops|product|meta]
applies-to:    glob[]         # 哪些源码文件由这份文档治理
audience:      string[]       # [frontend-agent|backend-agent|...|all-agents]
priority:      critical|high|medium|low
depends-on:    string[]       # 阅读本文档前应已知 doc 列表
provides:      string[]       # 本文档定义的契约 / 概念
purpose:       string         # 一句话目的
last-verified: YYYY-MM-DD     # 上次人工核对日期
```

## 2. 文档清单

| doc | scope | priority | applies-to (主) | 何时加载 |
|---|---|---|---|---|
| `index` | meta | critical | `docs/**` | 第一次进项目 |
| `prd` | product | high | - | 需要产品上下文时 |
| `architecture` | all | critical | 系统级 | 决策技术选型 / 跨服务变更 |
| `api` | backend, integration | critical | `services/**`, `src/lib/api.ts` | 改 API / 写 client |
| `database` | backend, data | critical | `services/**/migrations/**`, `services/**/repo/**` | 改 schema / 写查询 |
| `design-system` | frontend | high | `src/components/ui/**`, `src/styles/**` | 写 UI |
| `coding-standards` | all | critical | `**/*.{ts,tsx,go,py}` | 写代码前 |
| `test-plan` | all | high | `**/*.test.{ts,go,py}`, `tests/**`, `e2e/**` | 写测试 |
| `deploy` | devops | high | `.github/workflows/**`, `k8s/**`, `Dockerfile*` | CI/CD / 部署 |
| `security` | all | critical | 跨域 | 涉及鉴权 / 数据 / 加密 |
| `project-plan` | meta | low | - | 跟踪进度 |

## 3. 任务到文档映射

```yaml
# agent 决策表
任务关键词        -> 必读文档
"写 React 页面"   -> [coding-standards, design-system, api]
"写 API 端点"     -> [api, database, security, coding-standards]
"改数据库"        -> [database, security, deploy]
"加新组件"        -> [design-system, coding-standards]
"写测试"          -> [test-plan, coding-standards]
"部署 / CI"       -> [deploy, security]
"涉及登录/权限"   -> [security, api, database]
"性能优化"        -> [architecture]
"产品决策"        -> [prd]
```

## 4. 当前实现状态

```yaml
frontend:   shipped         # /Users/aox/manju, 21 页面 + 17 UI 原语
backend:    not-started     # docs 中规划, 未实现
infra:      not-started
ai-gateway: not-started

mock-data:  src/data/mock.ts   # 前端目前用本地 mock
```

## 5. 关键路径

```
项目根              /Users/aox/manju
前端入口            src/main.tsx → src/app/App.tsx → src/app/router.tsx
前端类型定义        src/types/index.ts
状态管理            src/store/index.ts
Mock 数据           src/data/mock.ts
UI 原语             src/components/ui/*.tsx (17 个)
页面                src/pages/*.tsx (21 个)
布局                src/components/layout/*.tsx
样式 token          src/index.css
```

## 6. 命名约定 (跨文档统一)

- **租户**: 一律称 `team` (不用 `org` / `workspace` / `tenant`)
- **资源 ID**: UUID v7 (timestamp-prefixed), 字符串
- **时间戳**: ISO 8601 with timezone, 例 `2026-05-24T13:42:18.123Z`
- **货币金额**: 整数 cents, 字段名后缀 `_cents` (例 `amount_cents: 59900`)
- **时长**: 毫秒整数, 字段名后缀 `_ms` (例 `duration_ms: 5000`)
- **路径**: 绝对路径或 `@/` 别名 (`@/components/ui/button`)
- **环境**: `local | dev | staging | prod`
- **AI 任务类型**: 点分隔 (`script.continue`, `storyboard.generate`)
