# 实现计划:按 P0–P5 依赖顺序

关键路径:P1(打开 tldraw 拖拽 / 缩放)→ P2(持久化写回)→ P3(面板锚定验证)→ P5(测试 / 验收)。

## 1. 打开节点拖拽 / 缩放(代码 flag,低风险)

- [x] 1.1 `ManjuNodeUtil`:`canResize()→true`、移除 `hideResizeHandles()`;`canEdit()/hideRotateHandle()` 保持(不允许双击编辑/旋转)。头注释从"只读镜子"改为"半可编辑工作台"。
- [x] 1.2 `index.tsx` `CanvasSync`:manjuNode `createShape` 去掉 `isLocked: true`(arrow 仍 isLocked,那是后续 change)。
- [x] 1.3 同上:撤掉 `editor.run(..., { ignoreShapeLock: true })` 的 `ignoreShapeLock` 选项,保留 `editor.run`(仍打包成一个 history step)。
- [~] 1.4 手测拖动 + 缩放:本环境无 dev server(需后端栈),留 `VERIFICATION.md` 手动清单。

## 2. 持久化写回(用户摆位 / 尺寸 → localStorage)

- [x] 2.1 `persistence.ts`:重写为只存位置/尺寸(`{x, y, w?, h?}`);新 schema v2 + 兼容旧 v1 nodes 数组;`saveCanvasPositions` 写、`loadCanvasPositions` 读;顺手删死代码 `saveCanvasState`/`loadCanvasEdges`(coding-standards no-dead-code)。
- [x] 2.2 `CanvasSync`:`editor.store.listen({ source: 'user', scope: 'document' })`,筛 `manjuNode` shape updated 条目;`flush` 时遍历 `getCurrentPageShapeIds` 收集 (id, x, y, props.w, props.h)。
- [x] 2.3 debounce 300ms(`saveTimerRef`)聚合;松手后一次性 `saveCanvasPositions`。
- [x] 2.4 `buildGraph.ts`:`CanvasNode` 加 `size?: {w,h}`;5 处 `nodes.push` 用统一 helper `sized(id, fallback)` 把 saved 的 w/h 透传(否则用户缩放永不生效)。`index.tsx` `toManjuProps` 用 `node.size ?? MANJU_NODE_SIZE[type]` 优先 saved。
- [~] 2.5 手测刷新保持位置/尺寸:同 1.4,留手动清单。

## 3. 面板锚定对 shape 位置 / 尺寸响应

- [x] 3.1 确认 `useAnchorPosition` reactive 契约:selector 内调 `getShapePageBounds(shapeId)` + `getViewportScreenBounds()`,tldraw `useValue` 自动订阅其内部读到的所有 reactive 值(shape store 含位置+尺寸、camera、viewport)。在 hook 上加注释固化契约。
- [x] 3.2 `panelAnchor.test.ts`(契约回归):用 `import.meta.glob('?raw')` 扫面板源码,断言仍走 `useValue + getShapePageBounds + getViewportScreenBounds`,且不引入 `setInterval/requestAnimationFrame` 等轮询(共 4 个断言)。真 happy-path 留手动。
- [~] 3.3 手测面板跟随节点拖动:同 1.4。

## 4. 视觉极限 / 边界

- [~] 4.1 手测各类型节点拖至极端尺寸:本环境无 dev server。
- [~] 4.2 按需加 `MANJU_NODE_SIZE` min/max 边界:首版按 design Decision 2 放开,实测后再约束(留二期)。

## 5. 验收

- [x] 5.1 `pnpm build` 通过(含 tsc -b + vite build,严格类型);`pnpm lint --max-warnings=20` 0 警告。**P5.1 暴露 tldraw 类型坑**:`tsc -b` 比 `--noEmit` 严,`getShape(id)` 返封闭联合 TLShape narrow 后变 never,读 `type/x/y/props` 必须 `as unknown as ManjuShapeView` cast(与 createShape/updateShape 同模式)。已修。
- [x] 5.2 `pnpm test` 全过:13 文件 / **59 测试**(原 55 + 4 新 panelAnchor 契约)。
- [x] 5.3 隔离回归测仍过:`nodeOptimizePanelIsolation.test.ts` 持续通过(本 change 未引入对话接口)。
- [~] 5.4 手动验收清单:见 `VERIFICATION.md`。
- [~] 5.5 端到端走查需完整后端栈 + 真 LLM key,本环境跑不动;留 `VERIFICATION.md`。
