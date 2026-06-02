## Why

`improve-canvas-interaction` 把画布定位为「只读镜子」——节点位置由 `buildGraph` 派生、`isLocked: true` 阻止用户拖拽、`canResize()→false` 关掉缩放。但用户反馈想要「能拖拽、能缩放」,即重启当初被否决的「方案 B」(可编辑工作台)。本 change 把画布从「只读」演进为「半可编辑」:**手动摆位优先,自动布局兜底**(新增节点 / 首次出现仍按 buildGraph 默认位)。这是 `canvas-node-optimize-panel` 之后约定的「第二步」。

## What Changes

- **节点可拖拽**:用户能拖动画布上任一 manjuNode 节点到新位置;松手后位置持久化到 `localStorage`(沿用 `persistence.ts` 已有的 key:`projectId × nodeId`),刷新仍在新位置。
- **节点可缩放**:用户能拖节点边角改尺寸,`MANJU_NODE_SIZE` 的固定尺寸退为「**首次出现时的默认值**」,实际渲染走 `props.w/h`;松手后尺寸持久化。
- **BREAKING(spec 层语义反转)**:`canvas-interaction` 现有 Scenario「点选节点 = 在对话中聚焦」已被 `canvas-node-optimize-panel` 修订;本 change **再次修订**该 capability,把「画布作为只读可视化镜子」中「节点不可由用户拖拽 / 缩放」的语义反转为「可拖拽 / 可缩放,手动摆位优先于自动布局」。代码上 `ManjuNodeUtil.canResize/hideResizeHandles`、`CanvasSync` 的 `isLocked: true` + `ignoreShapeLock` 守卫一并撤。
- **面板锚定适配**:`canvas-node-optimize-panel` 的 `useAnchorPosition` 当前只订阅 `editor.camera`(用 `useValue`);本 change 验证它对 shape 位置变化也响应,否则补上 shape bounds 订阅,让面板在节点被拖动时实时跟随。

## Capabilities

### New Capabilities
<!-- 无新增 capability;本次反转既有语义。 -->

### Modified Capabilities
- `canvas-interaction`:撤「只读镜子」中「节点不可由用户拖拽 / 缩放」的语义,改为「可拖拽 / 可缩放,手动摆位优先,自动布局兜底」。
- `canvas-node-optimization`:面板锚定需在节点位置 / 尺寸变化时实时跟随(不仅是 camera 变化)。

## Impact

- **前端代码**:
  - `src/pages/Canvas/canvas/ManjuNodeUtil.tsx`:`canResize()→true`、移除 `hideResizeHandles()`;`onResize` 走默认行为(写回 props.w/h)。
  - `src/pages/Canvas/index.tsx` `CanvasSync`:节点 create/update 去掉 `isLocked: true`;整段 `editor.run(..., { ignoreShapeLock: true })` 守卫撤掉(用户可拖动后,程序化更新与用户更新需共存,不应再用 ignoreShapeLock 覆盖)。
  - `src/pages/Canvas/persistence.ts`:加 `saveCanvasPositions`(订阅 tldraw store 的 shape change,debounce 落 localStorage,含 x/y + w/h)。
  - `src/pages/Canvas/NodeOptimizePanel/index.tsx` `useAnchorPosition`:确认 / 增强对 shape 位置变化的订阅,使面板跟随节点拖动。
- **不动**:`buildGraph.ts`(仍生成默认位置);后端;`canvas-node-optimize-panel` 面板交互本身。
- **明确不在本 change**:节点连线(用户加 / 删 arrow)、节点旋转、多选拖动、画布上的新建 / 删除节点(都属于"可编辑工作台"完整版的后续 change)。
