---
doc: coding-standards
scope: [all]
applies-to:
  - "**/*.{ts,tsx,js,jsx,go,py}"
  - "**/.editorconfig"
  - "**/.eslintrc*"
audience: [all-agents]
priority: critical
depends-on: [architecture]
provides: [language-rules, naming, git-flow, pr-rules, comment-policy]
purpose: 写代码前必读. 命名/结构/Git/PR/注释/错误处理统一约束.
last-verified: 2026-05-24
---

# 编码规范

## 1. 强制原则

```yaml
keep-simple:
  - "不为假设需求加抽象 / 配置 / 工厂"
  - "3 段相似代码 > 1 个错误抽象"
  - "feature flag 只用于真的需要灰度的场景, 不用作 todo 标记"

trust-boundaries:
  - "内部代码互相信任, 不做 defensive 校验"
  - "校验只在边界 (用户输入 / 外部 API / 跨服务调用)"

no-dead-code:
  - "禁止保留 //removed, //old 注释"
  - "禁止 _unused 变量 (eslint 强制报错)"
  - "未用的 import 必须删 (vite 不会自动 tree-shake dev)"

no-narration-comments:
  - "well-named identifier > comment"
  - "只在解释 WHY (隐藏约束 / 反直觉 workaround) 时写注释"
  - "禁止: '// 加粗按钮', '// 用于 X flow', '// 见 issue #123'"

backwards-compat:
  - "无人类生产用户前, 直接改 API / DB, 不做兼容层"
  - "有用户后, 走 §6 deprecation 流程"
```

## 2. TypeScript 规则

```yaml
config:
  strict: true                       # tsconfig.app.json 已开
  noUnusedLocals: true
  noUnusedParameters: true
  noImplicitAny: true
  verbatimModuleSyntax: true         # 强制 import type
  erasableSyntaxOnly: true

types-first:
  - "domain 类型放 src/types/index.ts"
  - "组件 props 用 interface <Name>Props"
  - "API 响应类型与 api.md 字段名严格对齐 (snake_case)"
  - "前端转换为 camelCase 在 api client 边界做 (src/lib/api/*)"

forbidden:
  - "any (用 unknown + 类型守卫)"
  - "as 强转 (除非有运行时 guard)"
  - "namespace (用 module)"
  - "enum (用 const + as const 联合类型)"
  - "// @ts-ignore (用 @ts-expect-error + comment)"

imports:
  - "type-only import 必加 type 关键字: import type { X } from '...'"
  - "外部包优先, 内部包次之, 相对路径最后"
  - "@/ 别名优先于相对路径 (除非同目录)"
```

## 3. React 规则

```yaml
component-pattern:
  - "函数组件 + hooks, 禁止 class"
  - "forwardRef 用于 ui/* 原语"
  - "displayName 必填 (ui/*)"
  - "className 透传必须用 cn(); 不要硬拼字符串"

hooks-rules:
  - "Rules of Hooks: 顶层 + 一致顺序"
  - "依赖数组完整 (eslint-plugin-react-hooks)"
  - "异步副作用必须有 cleanup (cancellation)"
  - "禁止 useEffect 做派生 state (用 useMemo / 直接计算)"

state-boundaries:
  server-state:    "TanStack Query (待引入)"
  global-ui:       "zustand (src/store/)"
  form:            "react-hook-form (待引入)"
  url:             "react-router params + searchParams"
  local-component: useState

lazy-loading:
  - "页面级用 lazyWithRetry (src/lib/lazyWithRetry.ts)"
  - "禁止 React.lazy 直接用 (无重试, dev 易白屏)"

forbidden:
  - "在组件内直接 fetch (用 query hook 或 api 模块)"
  - "AnimatePresence 包 <Outlet /> (见 design-system.md §10)"
  - "useEffect 内 setState 不带条件 (无限循环)"
  - "把 props 复制到 state (除非作为初始值)"
```

## 4. 命名规则

```yaml
files:
  ts-source:        "kebab-case.ts   (utils, hooks, api)"
  react-component:  "PascalCase.tsx  (Button.tsx)"
  ui-primitive:     "kebab-case.tsx  (按 shadcn 惯例: button.tsx)"
  test:             "<src>.test.ts | <src>.test.tsx"
  type-only:        "<domain>.types.ts (如必要)"
  config:           "kebab-case.config.ts"

identifiers:
  variable:         camelCase
  function:         camelCase
  component:        PascalCase
  type/interface:   PascalCase (不加 I/T 前缀)
  enum-const:       UPPER_SNAKE
  zustand-store:    "useStore | use<Domain>Store"
  hook:             "use<Verb>"
  bool:             "is/has/should/can prefix (isLoading, hasError)"

backend-go:
  package:          lower (no underscore)
  exported:         PascalCase
  unexported:       camelCase
  receiver-name:    "1-2 letters, consistent per type"

backend-python:
  module:           snake_case
  class:            PascalCase
  function:         snake_case
  constant:         UPPER_SNAKE
```

## 5. 错误处理

```yaml
frontend:
  display:        toast (sonner) for transient, dialog for blocking
  boundary:       "RouteErrorBoundary (src/app/RouteErrorBoundary.tsx) reset on navigate"
  api-error:      "throw ManjuError from api client, components 不处理细节, 用 onError hook"
  fetch-retry:    "TanStack Query retry: 3 attempts, exponential backoff"

backend:
  contract:       "uniform { error: { code, message, request_id, details } }"
  see:            api.md#error-codes
  log-level:
    expected-4xx: info
    5xx:          error
    timeout:      warn
  trace-id:       "每个错误必带 request_id (api.md 标准响应)"

retry-policy:
  idempotent:     ok-to-retry (GET, idempotent POST with key)
  non-idempotent: never-auto-retry
  max-attempts:   3
  backoff:        "exponential 100ms × 2^n, jitter ±25%"

panic/throw:
  rule:           "已知错误用结构化 error code; unknown panic 让 ErrorBoundary 接住"
```

## 6. Git 工作流

```yaml
branches:
  main:           production, protected, no force-push
  develop:        integration (m1 后可省, 直接 main)
  feature/*:      "feature/<ticket-id>-<short-name>"
  fix/*:          "fix/<ticket-id>-<short-name>"
  hotfix/*:       直接从 main, merge 回 main + develop
  release/*:      candidate release branches

commit-message:
  format:         "<type>(<scope>): <subject>"
  types:          [feat, fix, refactor, perf, docs, test, chore, style, build, ci]
  example:        "feat(video): add multi-track timeline drag"
  body:           "解释 WHY 不写 WHAT (well-named code 自解释)"
  footer:         "BREAKING CHANGE: ... | Closes #123"

pr-rules:
  size:           "< 400 lines diff (超过拆分)"
  reviews:        "1+ approval"
  ci:             "lint + typecheck + test + build 全绿"
  description:    "必含: 改了什么, 为什么改, 怎么验证, 影响范围"
  link:           "linear / issue 链接"

merge-strategy:
  feature → main: squash + merge
  hotfix → main:  merge commit (保留紧急修复时间线)

forbidden:
  - "force push 到共享分支"
  - "--no-verify 跳 hook (除非用户明确要求)"
  - "--no-gpg-sign"
  - "amend 已 push 的 commit"
  - "rm -rf .git / clone 替代 fix conflict"
```

## 7. PR 验收清单

```yaml
must:
  - [ ] tsc 0 error (npm run build)
  - [ ] lint 0 error / 0 warning
  - [ ] unit tests added or updated
  - [ ] e2e if user-facing flow
  - [ ] 关联文档更新 (api / db / design / coding)
  - [ ] 灰度计划 (如涉及破坏性变更)
  - [ ] 回滚方案
  - [ ] 监控埋点 (业务 + 性能)
  - [ ] dark mode 通过 (前端)
  - [ ] mobile 通过 (前端 + 涉及 UI)

forbidden-in-pr:
  - 提交 .env / 密钥 / token
  - 提交 node_modules / dist / .DS_Store
  - 提交 console.log (除非临时调试 + 立即删除)
  - 临时变量名 (tmp, foo, x)
```

## 8. 注释策略

```yaml
when-write-comment:
  - "解释 WHY 非显而易见的决策"
  - "标注隐藏约束 / 不变量"
  - "记录怪异 workaround 的根因"
  - "TODO / FIXME 必带 ticket id"

when-not-write:
  - "解释 WHAT 代码做什么"
  - "重述函数名 / 变量名"
  - "记录当前 PR / 任务上下文"
  - "回头看会过时的内容"

forbidden:
  - "// 删除按钮"           # well-named already
  - "// 用于 X 流程"        # belongs in PR description
  - "// 见 issue #123"      # git blame / history 有
  - "// removed: ..."       # 直接删

format:
  ts/tsx:   "// single line | /** JSDoc for public API */"
  go:       "// always single line"
  python:   "# single line | \"\"\"docstring\"\"\""
  no-banner: '不要 "// ============ section ============" 长横线'
```

## 9. 文件结构

```yaml
src-tree:
  - "见 README.md"
  - "新增组件先想能不能放进已有目录, 不要无脑新建"

barrel-files:
  - "禁止 src/components/ui/index.ts barrel"
  - "原因: 阻碍 tree-shaking, 易循环引用"
  - "直接 import: from '@/components/ui/button'"

co-location:
  - "页面级 hook 放页面文件下方 (一文件)"
  - "组件级 hook 不复用时, 内联到组件"
  - "复用 hook 提到 src/hooks/"
```

## 10. 性能规则

```yaml
react:
  - "memo / useMemo / useCallback 不预防式用, 测出热点再加"
  - "长列表 > 100 行用 @tanstack/react-virtual"
  - "图片 loading='lazy' + decoding='async'"
  - "framer-motion 用 will-change-transform 提示 GPU"

bundle:
  - "页面级 lazyWithRetry"
  - "三方库 > 50KB 必须按需引入 (lucide-react 已是按需)"
  - "主 bundle < 300KB gzip (当前 ~207KB)"
  - "图标禁止 import entire lucide-react"

network:
  - "TanStack Query staleTime > 30s 避免抖动"
  - "infinite query / cursor 分页"
  - "下载大文件用 <a download> 或 streamSaver, 不全部入内存"
```

## 11. 安全编码

```yaml
xss:
  - "禁止 dangerouslySetInnerHTML (除非已 DOMPurify)"
  - "禁止 eval / Function constructor"
  - "用户输入永远当不可信"

secrets:
  - ".env.local 个人配置 (gitignore)"
  - ".env.example 模板, 不含真值"
  - "前端环境变量只放 PUBLIC (VITE_PUBLIC_*) 前缀"
  - "禁止 hard-code api key / token"

deps:
  - "新增依赖前 dependency-cruise 看 license + 维护活跃度"
  - "定期 npm audit, p0 漏洞 24h 内修"
```

## 12. 测试 (详见 test-plan.md)

```yaml
ratio:           "unit 70% + integration 20% + e2e 10%"
coverage-min:    "core 80%, others 60%"
naming:          "<src>.test.ts"
isolation:       "测试间互不依赖, 可并行"
db:              "integration 用 testcontainers, e2e 用真实 staging"
```
