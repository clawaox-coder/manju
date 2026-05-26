---
doc: test-plan
scope: [all]
applies-to:
  - "**/*.test.{ts,tsx,go,py}"
  - "tests/**"
  - "e2e/**"
audience: [test-agent, all-agents]
priority: high
depends-on: [api, database, coding-standards]
provides: [test-pyramid, coverage-targets, tooling, fixtures, e2e-scenarios]
purpose: 测试契约. agent 写测试时必读. PR 不通过测试不允许合并.
last-verified: 2026-05-25
---

# 测试计划

## 1. 测试金字塔

```yaml
ratio:
  unit:        70%   # 函数 / 组件 / hooks 隔离测试
  integration: 20%   # 多模块 + 真实 DB / Redis
  e2e:         10%   # 浏览器端到端
```

## 2. 覆盖率目标

```yaml
core-modules:
  threshold:   80%
  modules:
    - "src/lib/*"
    - "src/hooks/*"
    - "src/store/*"
    - "services/*/handlers/*"
    - "services/*/services/*"
    - "services/ai-gateway/routers/*"

others:
  threshold:   60%

excluded:
  - "src/data/mock.ts"
  - "src/components/ui/* (shadcn 拷贝, 上游已测)"
  - "src/main.tsx, src/app/router.tsx (薄黏合层)"
  - "**/types.ts, **/*.d.ts"
  - "**/index.ts (barrel re-export)"

enforcement:
  ci:          "coverage 报告上传到 Codecov"
  failing:     "PR coverage 下降 > 1% 阻断合并"
```

## 3. 工具链

```yaml
frontend:
  unit:        vitest + @testing-library/react
  e2e:         playwright (chromium + webkit)
  visual:      "playwright @screenshot 像素对比"
  mock:        msw (api mocking)
  fixtures:    "src/data/mock.ts 复用"

backend-go:
  unit:        "go test 内置"
  integration: testcontainers-go
  api:         "httptest"

backend-python:
  unit:        pytest
  integration: pytest + testcontainers
  api:         httpx async

cross-service:
  contract:    pact (consumer-driven contracts)
  load:        k6
  chaos:       chaos-mesh (k8s)
```

## 4. 单元测试规则

```yaml
naming:        "<src>.test.{ts,tsx,go,py}"
location:     co-located with source

structure:
  - "describe (subject) > it (scenario)"
  - "Arrange / Act / Assert 分段, 必要时空行分隔"
  - "1 测试 1 行为断言"
  - "失败信息可读: expect(x).toBe(y) > 用 .toEqual / .toMatchObject"

forbidden:
  - "测试间共享 mutable state"
  - "依赖测试顺序 (随机化运行)"
  - "测试 console.log"
  - "snapshot 测试用于复杂组件 (改一行 diff 100 行)"
  - "测试 console.error 在 React 中泄漏 (使用 spy)"

mocking:
  - "mock 边界依赖 (网络 / db / time)"
  - "禁止 mock 自己写的纯函数 (直接调)"
  - "useFakeTimers 测试定时器"
  - "msw 拦截 fetch, 不要 jest.mock fetch"

example-react-component:
  | import { render, screen, fireEvent } from '@testing-library/react';
  | import { Button } from './button';
  | describe('Button', () => {
  |   it('renders children', () => {
  |     render(<Button>Click</Button>);
  |     expect(screen.getByRole('button', { name: 'Click' })).toBeInTheDocument();
  |   });
  |   it('calls onClick', () => {
  |     const fn = vi.fn();
  |     render(<Button onClick={fn}>X</Button>);
  |     fireEvent.click(screen.getByRole('button'));
  |     expect(fn).toHaveBeenCalledOnce();
  |   });
  | });
```

## 5. 集成测试规则

```yaml
scope:        "多模块协作 + 真实下游 (db, redis, mq)"
isolation:    "每个 test file 独立 db (testcontainers)"
fixtures:     "shared/fixtures/*.ts 提供 factory"
cleanup:      "afterEach 清空表 (TRUNCATE CASCADE)"

example-be-api:
  | describe('POST /v1/projects', () => {
  |   let ctx: TestContext;
  |   beforeAll(async () => { ctx = await setupTestEnv(); });
  |   afterAll(() => ctx.teardown());
  |
  |   it('creates project', async () => {
  |     const res = await ctx.api
  |       .post('/v1/projects')
  |       .set('Authorization', `Bearer ${ctx.tokens.alice}`)
  |       .send({ name: 'p1', genre: '都市', from: 'idea' });
  |     expect(res.status).toBe(201);
  |     expect(res.body.data).toMatchObject({ name: 'p1', status: 'draft' });
  |     const row = await ctx.db.query('SELECT * FROM projects WHERE name=$1', ['p1']);
  |     expect(row.rowCount).toBe(1);
  |   });
  |
  |   it('rejects without auth', async () => {
  |     const res = await ctx.api.post('/v1/projects').send({});
  |     expect(res.status).toBe(401);
  |     expect(res.body.error.code).toBe('INVALID_TOKEN');
  |   });
  | });
```

## 6. E2E 测试

```yaml
tool:          playwright
config:        "playwright.config.ts (project: chromium, webkit)"
base-url:      "http://localhost:5173 (local) | https://staging.* (ci)"
parallel:      4 workers
retry:         "ci=2, local=0"
trace:         "on-first-retry"
screenshot:    "only-on-failure"
video:         retain-on-failure

scenarios-p0:
  - id: e2e-001-signup-to-first-video
    flow:
      - 访问 /
      - 点击新建项目
      - 选择剧本 → 输入名称 → 选择题材
      - 在 /script 粘贴示例剧本
      - 点击 "下一步: 生成分镜"
      - 等待 storyboard 加载 (mock 1.5s)
      - 点击 "下一步: 视频生成"
      - 点击 "渲染并导出"
      - 等待渲染对话框 100%
      - 验证导出对话框出现, 含 "下载到本地" 按钮
    assertions:
      - "页面切换无白屏"
      - "渲染对话框可关闭 (esc)"

  - id: e2e-002-keyboard-shortcuts
    steps:
      - "按 ? 弹出快捷键面板"
      - "按 esc 关闭"
      - "按 Ctrl+K 聚焦搜索框"
      - "进入 /video, 按 Space 播放"

  - id: e2e-003-theme-toggle
    steps:
      - "点击右上角主题按钮"
      - "选 dark → <html> 含 .dark"
      - "刷新页面 → 仍是 dark (持久化)"

  - id: e2e-004-projects-filter
    steps:
      - "进入 /projects"
      - "搜索 '修仙'"
      - "筛选 '渲染中'"
      - "切换列表视图"

  - id: e2e-005-recycle-bin
    steps:
      - "在 /projects 右键删除一个项目"
      - "确认对话框"
      - "前往 /trash 验证存在"
      - "点击恢复"
      - "返回 /projects 验证回归"

scenarios-p1:
  - "团队邀请成员 (m2)"
  - "支付升级套餐 (m2)"
  - "实时协作 2 个浏览器同步 (m2)"
```

## 7. 视觉回归 (visual regression)

```yaml
tool:          playwright @screenshot
baseline:      "tests/visual/__screenshots__/"
trigger:       "PR 自动跑, 像素 diff > 0.1% 标记 review"
pages-covered:
  - /
  - /projects (grid + list)
  - /script
  - /storyboard
  - /video
  - /settings (all 6 tabs)
  - /billing
  - dark mode 全部上述
```

## 8. 性能测试

```yaml
frontend-budget:
  fcp_ms:       1500
  tti_ms:       3000
  bundle-main:  300KB gzip
  enforce:      lighthouse-ci on every PR

backend-load:
  tool:         k6
  scenarios:
    smoke:      "1 vu, 1m, 验证可达"
    normal:     "100 vu, 10m, P99 < 500ms"
    stress:     "1000 vu, 30m, 不崩溃"
    spike:      "0 → 500 → 0, 30s peak"
  ci-trigger:   "nightly + before-release"

render-load:
  scenario:    "50 concurrent render jobs"
  pass:         "队列堆积 < 10 个, gpu 利用率 > 70%"
```

## 9. 安全测试

```yaml
sast:
  - eslint-plugin-security (frontend)
  - gosec (go)
  - bandit (python)
  - snyk (依赖)

dast:
  - owasp-zap baseline scan (nightly)
  - burpsuite manual (季度)

pen-test:
  - "外部白盒, 每年 1 次"

依赖:
  - "npm audit / go list -m -u all / pip-audit"
  - "p0 漏洞 24h 修, p1 7 天, p2 30 天"

secrets-scan:
  - gitleaks pre-commit hook
  - trufflehog ci scan
```

## 10. 测试数据

```yaml
test-database:
  - "每个集成测试用独立 schema (test_<random>)"
  - "禁止用 prod / staging 数据"

fixtures-frontend:
  - "src/data/mock.ts 复用 (已有 mock 数据)"
  - "新加 mock 必须真实模拟边界场景 (空列表, 大量数据, 错误响应)"

factories:
  - "shared/test/factories/*.ts: makeUser(), makeProject() 等"
  - "默认值合法, 可覆盖任意字段"

seeding:
  - "scripts/seed-dev.ts 写本地 dev db"
  - "禁止单元测试依赖 seed (数据漂移会导致 flaky)"
```

## 11. Flaky 测试治理

```yaml
detection:
  - "测试失败 → 重试 2 次"
  - "重试后才 pass → 自动标记 flaky"
  - "连续 5 次 flaky → 自动 skip + 创建 ticket"

forbidden:
  - "sleep / wait fixed time"
  - "依赖 wall-clock time (用 fake timer)"
  - "依赖网络真实响应 (用 msw)"

quarantine:
  - ".test.skip 必须有 issue link + owner"
  - "skip > 30 天自动报警"
```

## 12. CI 测试流水线

```yaml
on-pr:
  parallel:
    - "lint (eslint / gofmt / black)"
    - "typecheck (tsc / go vet / mypy)"
    - "unit (frontend + each backend service)"
    - "integration (testcontainers, 一服务一个)"
  sequential-after-unit:
    - "build (vite / docker)"
    - "e2e (playwright, 仅 chromium 跑 p0)"
    - "lighthouse-ci (frontend)"

on-main-merge:
  - "e2e full matrix (chromium + webkit + firefox)"
  - "visual regression"
  - "deploy staging"

nightly:
  - "load test (k6)"
  - "dast (zap)"
  - "dependency audit"

quality-gate:
  - "覆盖率不能下降"
  - "bundle 大小不能增长 > 5%"
  - "lighthouse 分数不能下降"
```

## 13. 提交契约

```yaml
agent-self-check-before-pr:
  - [ ] "npm run build  → exit 0"
  - [ ] "npm run lint   → exit 0 (0 warning)"
  - [ ] "npm test       → all pass"
  - [ ] "本地手测主路径 (golden path)"
  - [ ] "暗色 + 移动适配通过 (UI 变更)"
  - [ ] "更新对应 docs"
```
