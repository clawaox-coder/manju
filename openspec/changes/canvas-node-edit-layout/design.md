## Context

- 画布历史:`improve-canvas-interaction` 当初评估过「可编辑工作台(方案 B)」,因「需处理手动摆位 vs 自动布局重同步、坐标持久化、与`只读镜子`定位冲突」而否决。**本 change 接受这些代价**,把画布演进为「半可编辑」。
- 代码现状(读码确认):
  - `ManjuNodeUtil.tsx`:`canResize()→false`、`hideResizeHandles()→true`、`canEdit()→false`、`hideRotateHandle()→true`,**显式四关**。`getDefaultProps` 给 w/h,但 resize 关着所以 props.w/h 永不变。
  - `index.tsx` `CanvasSync`:每个 `createShape` / `updateShape` 都带 `isLocked: true`,整段写在 `editor.run(..., { ignoreShapeLock: true })` 里(P4.1 spike 确认的"程序化可改、用户挡住"配方)。
  - `persistence.ts` 已有 `loadCanvasPositions(projectId): Map<nodeId, {x,y}>`(localStorage),但**只读不写**——没有任何代码把用户摆位写回去。buildGraph 加载时检查 `savedPositions?.get(id) ?? { x: 默认, y: 默认 }`,所以"覆盖默认布局"的优先级机制**已就绪,只是没人写**。
- 约束:
  - 不引入 tldraw 之外的拖动 / resize 框架(直接打开 ManjuNodeUtil 的两个 flag)。
  - 持久化继续走 localStorage(无后端坐标持久化,符合 m1 范围)。
  - 不改 `canvas-node-optimize-panel` 内部逻辑;面板锚定只需"对 shape 位置变化也响应"。

## Goals / Non-Goals

**Goals:**
- 用户能拖动节点 → 松手位置持久化 → 刷新仍在新位置。
- 用户能拖节点边角缩放 → 松手尺寸持久化 → 刷新仍是新尺寸。
- buildGraph 默认布局仍对"首次出现 / 新增节点"生效(用户摆位 > buildGraph 默认)。
- NodeOptimizePanel 在节点被拖动时实时跟随。
- 既有 55 前端测试 + 19 后端测试不破坏。

**Non-Goals:**
- 用户手动连线 / 删线(arrow)— 后续 change。
- 旋转、多选拖动、对齐网格、磁吸 — 后续 change。
- 画布上新建 / 删除节点(节点仍由 buildGraph 派生) — 后续 change(涉及数据模型)。
- 坐标 / 尺寸**跨设备同步**(localStorage 是本设备私有) — 未来需后端 endpoint。
- 重做 `improve-canvas-interaction` 之前否决方案 B 的其它边界(动画、布局算法升级)。

## Decisions

**1. 拖拽 = 撤 `isLocked` + 撤 `ignoreShapeLock`。**
节点 `isLocked: true` 是阻挡用户拖动的唯一阀门,撤掉即可。同步撤 `editor.run(..., { ignoreShapeLock: true })`——没了 lock,这层守卫语义反而引入认知噪音。`ManjuNodeUtil.canEdit()` 保持 false(不允许双击进文本编辑模式,那是另一回事)。
替代方案「用 `editor.updateInstanceState({ isReadonly })`」:整画布只读、连面板都不可点,否决。

**2. 缩放 = `canResize()→true` + 撤 `hideResizeHandles()`。**
tldraw 默认 ResizeTool 会写回 `shape.props.w/h`(我们的 `props` 已经声明了 w/h,且 `getGeometry()` 用 `new Rectangle2d({width: w, height: h})`),解锁即可。`ManjuNodeView` 的 CSS 用 `w-full h-full`,跟着 props 自适应——无需额外改视图。
**风险:**节点 type-specific 视觉(分镜的缩略图 4:3、角色的圆形头像)在极端尺寸下可能丑。可加 `minDimensionForType` 限制,但首版先放开,实测再约束。

**3. 持久化 = 订阅 tldraw store 的 shape change + debounce 写 localStorage。**
`persistence.ts` 已存"读"——补"写":在 `CanvasSync` 拿到 editor 时,`editor.store.listen(({ changes }) => …)`,筛 `manjuNode` 类型 shape 的 `updated` 条目,收集 (id, x, y, w, h),debounce 300ms 后 `savePositions(projectId, positions)`。
**为什么 debounce:**tldraw 拖动 / resize 过程中每帧都 fire change,频繁写 localStorage 会慢;松手后批量写一次即可。
**为什么不区分"用户拖" vs "程序化更新"**:撤了 `ignoreShapeLock` 守卫后,所有变更都经同一路径,持久化只关心终态;`buildGraph` 派生的默认位置若已 saved 过的会被 `savedPositions?.get(id) ?? default` 优先,首次出现的节点也会立即写一次(写默认位也无妨)。
**key 不变:**继续用 `manju-canvas-pos-{projectId}`,保持 `loadCanvasPositions` 不动。Map value 从 `{x,y}` 扩成 `{x,y,w?,h?}`(w/h 可选,旧记录无 w/h 时落回 `MANJU_NODE_SIZE[type]` 默认)。
替代方案「写后端 API」:超出本 change 范围且要新端点,后续 change 再做。

**4. 优先级机制保持不变,只补写。**
`buildGraph.ts` 既有 `savedPositions?.get(id) ?? defaultByColumn` 逻辑就是「用户摆位 > 自动布局」。本 change 不动 `buildGraph`,只让"写"通路生效,机制自然 work。
**注意冲突点:**`CanvasSync` 既会被 graph 重算触发(每次 useScript/useShots 变化),会调 `updateShape({x, y})` 把节点拽回 graph 的 position。**已经被用户拖到新位置的节点,graph.nodes 里仍是 buildGraph 算出的位置**——若 buildGraph 总是给同一默认,而我们已加载了 savedPositions,那这位置就是 saved 的,不会拽回。**关键:**`buildGraph.ts` 必须**确认**加载 savedPositions 后**取 saved 而非默认**(已是这样)。本 change 加个 e2e 单测:拖动 → reload graph → 节点仍在新位置(非拽回默认)。

**5. 面板锚定对 shape 位置变化也响应。**
`useAnchorPosition` 用 `useValue('panel-anchor', () => { editor.getShapePageBounds(...) })`。tldraw 的 `useValue` 订阅它内部读到的所有 reactive value——`getShapePageBounds` 读 shape store,所以 shape 位置变化应自动触发重算。**风险:**未确认。本 change 加一个 vitest:模拟 editor、改 shape 位置、断言锚定返回新坐标(若发现 useValue 不响应,把 shape bounds 显式纳入订阅)。

## Risks / Trade-offs

- [拖动期间面板抖动 / 跟丢] → useValue 已订阅 reactive,理论上跟随;若实测抖动,加 `requestAnimationFrame` 节流。
- [resize 让 type-specific 视觉失真(角色头像被拉成椭圆)] → 首版放开,实测后给 `MANJU_NODE_SIZE` 加 `minW/maxW` 边界。
- [localStorage 跨设备不同步] → 已声明为 Non-Goal,二期上后端坐标 API。
- [persistence 数据 schema 升级(从 {x,y} 到 {x,y,w?,h?})] → 旧记录 w/h 缺失时 fallback 到 `MANJU_NODE_SIZE[type]`,向后兼容;新写入用新 schema。无破坏。
- [既有自动布局节奏被用户摆位破坏(新增 shot 与旧 shot 列位不对齐)] → m1 接受;后续 change 可加"一键回归自动布局"按钮。
- [程序化更新与用户更新并发(罕见:对话推进生成新节点 + 用户正在拖)] → tldraw 内部 state 是单线程更新,最后写赢;debounce 300ms 后批量持久化,不会丢"最后位置"。
- [`improve-canvas-interaction` 与本 change 在同一 capability 上来回 MODIFY] → MODIFIED 而非 ADDED;Scenario 显式标 "Removed:" 或 "Updated to:" 让审计可追溯。
