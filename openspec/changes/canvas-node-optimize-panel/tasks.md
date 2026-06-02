# 实现计划:按 P0–P6 依赖顺序

关键路径:P1(后端端点)→ P2(面板外壳 + 锚定)→ P3(内容节点变体接线)→ P5(替换点选 + 镜子刷新)。
P4(枢纽节点)可与 P3 并行;P0 可提前。

## P0. 暖身:契约与类型(低风险,先做)

- [x] P0.1 定「场景切分契约」:把前端 `parseScenes`(`/^#{1,3}\s+/` + 首段无标题归场景 1)整理成明确规则文档 + 一组样例(content → scenes[]),供前后端各自实现对齐 — 抽出 `src/pages/Canvas/sceneSplit.ts` + `sceneSplit.test.ts`(5 样例锁定),buildGraph 已切换
- [x] P0.2 `src/lib/api/ai.ts`:声明三个专门优化接口的 TS 类型与 client 函数签名(`rewriteScene` / `optimizeShot` / `optimizeCharacter`),先打桩 — 已加,走 request() 期望 { data } 信封
- [x] P0.3 定义节点 → 实体解析:`nodeId`(`script-{i}` / `char-{id}` / `shot-{id}` / `ai-gen` / `video-out`)→ `{ kind, entityRef }` 的纯函数 + 单测 — `src/pages/Canvas/nodeEntity.ts` + `nodeEntity.test.ts`(6 用例)

## P1. 后端:专门优化端点(全栈关键前置)

- [x] P1.1 ai-gateway `POST /v1/ai/shot/optimize`:text → LLM 改这一镜对白 → 直写 shots(`update_shot_dialog`)。**image/both → 501(后端无图像生成,二期)**——实现暴露:storyboard 仅产文本、`image_url` 无人写。
- [x] P1.2 ai-gateway `POST /v1/ai/script/rewrite-scene`:取 script(直读共享库)→ 按场景切分契约定位该场 → LLM 仅重写该场 → `replace_scene` 原子拼回 → 乐观版本写回 → 冲突返 409。**直写共享库(非 HTTP 调 script-service)**,与 repo/shots.py 同模式。
- [x] P1.3 ai-gateway `POST /v1/ai/character/optimize`:LLM 改写角色 `description` → 直写 assets(`update_asset_description`);非角色 → 400。
- [x] P1.4 三端点共享 `_run_and_record`(取上下文→LLM→记 ai_tasks)+ `HTTPException` 错误信封;**完全不碰 `chat_respond`/对话接口**。顺手修复 `routes/ai.py` 既存 bug:`TTSRequest` 类丢失致 import 时 NameError(CI 未 import routes 故未暴露)。
- [x] P1.5 后端单测:`tests/test_scene_split.py`(8,切分+精准替换+边界)+ `tests/test_node_optimize.py`(11,mode 501/越界 400/冲突 409/仅改目标场/404)= 19 passed;`app.main` 干净导入、三路由注册;ruff clean。
- [~] P1.6 验证:无 `ANTHROPIC_API_KEY`,真 LLM 往返的 curl 走查留待带 key 环境/CI integration;非 LLM 逻辑(定位/版本/错误码/隔离)已由 import + 19 单测覆盖。

## P2. 前端:面板外壳 + 锚定(依赖 P0.3)

- [x] P2.1 面板外壳:`NodeOptimizePanel/index.tsx` 锚定+标题+关闭+content slot;输入区下移到各变体(类型形态差异大,共享 InputBar 反而是错误抽象)。
- [x] P2.2 锚定 hook:用 tldraw `useValue` 派生节点旁屏幕坐标(camera 变化自动重算,无 effect setState);右侧锚定超出视口则左侧 fallback;节点被删/不存在 → 返 null 自动隐藏。
- [x] P2.3 overlay:挂在 `<Tldraw>` 内(z-[400]),`fixed` 定位消费屏幕坐标;不影响 tldraw 自身手势。

## P3. 内容节点变体 + 接线(依赖 P1、P2)

- [x] P3.1 剧本场变体:头部预览(标题+前 80 字)+ 输入 + `useRewriteScene`;409 → toast 提示 + hook onError 内 invalidate 拿新版本,不静默覆盖。
- [x] P3.2 分镜变体:缩略图+对白预览;改对白走 `useOptimizeShot(mode=text)`;改时长走 `useUpdateShot({duration_ms})` 复用 CRUD;"重画这一镜" 渲染"二期"占位(后端 501)。外部→本地编辑用 override 模式避免 effect setState。
- [x] P3.3 角色变体:头像+名称+描述预览;AI 改设定走 `useOptimizeCharacter`;直改名称走 `useUpdateAsset` CRUD;头像重生成本期不渲染入口(避免悬空控件)。
- [x] P3.4 执行中/错误态:三变体统一 Loader2 旋转 + sonner toast + submit disable;错误抛 `AiOptimizeError`(status+code),不复用 ManjuError。

## P4. 枢纽节点动作控制台(可与 P3 并行)

- [x] P4.1 `ai-gen` 变体:风格输入 + `useConfirm` 二次确认 → `storyboardGenerate(regenerate_all)` + 内嵌轮询 → 失效 `['shots']`。
- [x] P4.2 `video-out` 变体:分辨率(720p/1080p/2k)+ 格式(mp4/mov/webm)三选一 + 二次确认 → `createRender` + 内嵌轮询;完成态展示 [预览/下载] 链接。

## P5. 替换点选 + 镜子刷新(依赖 P2、P3)

- [x] P5.1 `handleNodeClick` 只设 `setSelectedNodeId`,移除 `sm.focusNode` + makeSystemMessage('📍 聚焦') + runAgentTurn 注入。`AgentStateMachine` 同批清理:删 `focusNode` 方法、`focusedNodeId` 字段(types/INITIAL_STATE)、对应单测(无人再用即删)。
- [x] P5.2 写回路径:各 mutation `onSuccess` 失效对应 query key(`['script', pid]` / `['shots', pid]` / `['assets']` + `['asset']`);buildGraph 重算 → CanvasSync 刷镜子 → 变体从同一数据源重渲染(无独立真相源)。
- [x] P5.3 隔离回归测:`nodeOptimizePanelIsolation.test.ts` 用 Vite `import.meta.glob('?raw')` 扫 NodeOptimizePanel/*.{ts,tsx},断言不含 `chat(` / `streamScriptContinue` / `classifyIntent` / `intent/classify`(8 用例)。

## P6. 验收

- [x] P6.1 `pnpm build` 通过(含 tsc -b + vite build);`pnpm lint --max-warnings=20` 0 警告。
- [x] P6.2 前端单测:11 → 55 通过(原 48 - 1 删旧 focusNode 测 + 8 新隔离测;sceneSplit/nodeEntity 契约 11 个已在 P0 落)。后端单测:scene_split 8 + node_optimize 11 = 19 已在 P1 落。
- [x] P6.3 「优化经专门接口」回归:见 P5.3(8 个 it 断言全过)。
- [~] P6.4 端到端走查需完整后端栈 + 真 LLM key,本环境无法跑;`VERIFICATION.md` 已列手动清单(点各类节点→优化→镜子刷新、409 冲突恢复、二次确认弹窗、面板锚定跟随)。
