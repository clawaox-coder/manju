# 实现计划:按 P0–P5 依赖顺序

关键路径:P1(打开 tldraw 拖拽 / 缩放)→ P2(持久化写回)→ P3(面板锚定验证)→ P5(测试 / 验收)。

## 1. 打开节点拖拽 / 缩放(代码 flag,低风险)

- [ ] 1.1 `src/pages/Canvas/canvas/ManjuNodeUtil.tsx`:`canResize()` 改 `true`、移除 `hideResizeHandles()`;`canEdit()` 保持 false(不允许双击文本编辑)
- [ ] 1.2 `src/pages/Canvas/index.tsx` `CanvasSync`:`createShape` / `updateShape` 去掉 `isLocked: true`
- [ ] 1.3 同上:撤掉 `editor.run(..., { ignoreShapeLock: true })` 包装(用户能拖动后,这层守卫无意义且有认知噪音)
- [ ] 1.4 手测:`pnpm dev` 起前端 → 点节点 → 拖动 → 拖角缩放;松手后立即视觉验证(此刻还未持久化,刷新会回到默认位)

## 2. 持久化写回(用户摆位 / 尺寸 → localStorage)

- [ ] 2.1 `src/pages/Canvas/persistence.ts`:扩 Map value 从 `{x,y}` 到 `{x,y,w?,h?}`(w/h 可选,旧记录无 w/h 时 fallback 到 `MANJU_NODE_SIZE[type]`);加 `saveCanvasPositions(projectId, positions)` 写 localStorage
- [ ] 2.2 `index.tsx` `CanvasSync`:`editor.onMount` 后订阅 `editor.store.listen(({ changes }) => ...)`,筛 `type === 'manjuNode'` 的 updated 条目,收集 (id, x, y, props.w, props.h)
- [ ] 2.3 监听用 debounce(300ms)聚合,松手后批量 `saveCanvasPositions`;避免每帧写 localStorage
- [ ] 2.4 `buildGraph.ts` 的 `savedPositions?.get(id) ?? default` 优先级已就绪——确认无回归;若 `loadCanvasPositions` 返回的 Map value 是新形状,确保 buildGraph 读 `.x/.y` 时仍能取到(类型对齐)
- [ ] 2.5 手测:拖动 → 等 300ms → 刷新 → 节点仍在新位置;同样验证缩放后尺寸保留

## 3. 面板锚定对 shape 位置 / 尺寸响应

- [ ] 3.1 `src/pages/Canvas/NodeOptimizePanel/index.tsx` `useAnchorPosition`:读源码确认 `useValue` 的 selector 函数体内调 `editor.getShapePageBounds(shapeId)`,tldraw 应自动订阅 shape store——拖动节点时 useValue 应重算
- [ ] 3.2 写单测 `panelAnchor.test.tsx`:模拟 editor / shape store,move shape,断言 `useAnchorPosition` 返回新坐标(若未触发重算,把 shape bounds 显式纳入订阅,例如调 `useValue` 时把 shapeId 加入依赖键名,或显式 watch shape record)
- [ ] 3.3 手测:打开任一节点的优化面板 → 拖动该节点 → 面板平滑跟随,不抖动 / 不掉队;缩放同样验证

## 4. 视觉极限 / 边界(实测后决定是否约束)

- [ ] 4.1 手测各类型节点拖至极端尺寸(很窄 / 很高 / 极宽);记录是否有失真(角色头像被拉成椭圆 / 分镜缩略图变形)
- [ ] 4.2 如需约束:`MANJU_NODE_SIZE` 加 `minW/maxW/minH/maxH`,在 `ManjuNodeUtil.onResize` 钩子里夹紧;首版可不加,留待二期

## 5. 验收

- [ ] 5.1 `pnpm build` 通过(tsc -b + vite build);`pnpm lint --max-warnings=20` 0 警告
- [ ] 5.2 `pnpm test` 全过(既有 55 测试 + 新增 panelAnchor 测试)
- [ ] 5.3 隔离回归测仍过(NodeOptimizePanel 不引入对话接口)
- [ ] 5.4 手动验收(`VERIFICATION.md` 清单):拖位置 / 拖尺寸 / 刷新保持 / 面板跟随 / 新增节点用默认布局
- [ ] 5.5 端到端走查(需完整后端栈)— 本环境跑不动时写入 VERIFICATION.md 待真环境复核
