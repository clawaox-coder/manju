# 验收说明(canvas-node-edit-layout)

## 自动可验项(本环境跑过)

| 项 | 手段 | 结果 |
|----|------|------|
| 构建 / 类型 | `pnpm build`(tsc -b + vite build,严格) | ✅ 通过 |
| 前端 lint | `pnpm exec eslint src --max-warnings=20` | ✅ 0 警告 |
| 单测 | `pnpm test` | ✅ **59/59**(原 55 + 4 新 panelAnchor 契约) |
| 隔离回归 | `nodeOptimizePanelIsolation.test.ts`(本 change 未引入对话接口) | ✅ 继续通过 |
| 锚定契约 | `panelAnchor.test.ts`(useValue + getShapePageBounds + getViewportScreenBounds + 禁轮询) | ✅ 4 断言通过 |

## 需 dev server 的手动走查(本环境无 docker 栈,跑不了)

执行条件:`scripts/dev/docker compose up -d`(全栈)+ `pnpm dev`(前端)+ 真 `ANTHROPIC_API_KEY`(若涉及 chat / 优化)。

### 1. 拖拽:节点位置可改且持久化
- 打开 `/canvas`,进任一项目。
- 选中某节点(如分镜),按住拖到新位置,松手。
  - 预期:节点停留在松手位置,**不弹回**(撤了 `isLocked` + `ignoreShapeLock`)。
- 等 ≥300ms(debounce 落 localStorage)→ 刷新页面。
  - 预期:节点仍在新位置(persistence 复原)。

### 2. 缩放:节点尺寸可改且持久化
- 选中某节点,从边角拖动 resize handle。
  - 预期:节点尺寸跟随,内容自适应(`ManjuNodeView` w-full h-full)。
- 等 ≥300ms → 刷新页面。
  - 预期:节点仍是新尺寸。
  - 若失真明显(角色头像被拉成椭圆 / 分镜变形):记录到 issue,按 design Decision 2 决定是否给 `MANJU_NODE_SIZE` 加 min/max。

### 3. 面板锚定跟随
- 点某节点 → 打开 `NodeOptimizePanel`(锚在节点旁)。
- **拖动该节点** → 预期面板平滑跟随,**不掉队/不抖动**(tldraw useValue 订阅 shape store)。
- **缩放该节点** → 面板锚定点跟随节点的 maxX/y,自动重定位。
- 平移画布(中键拖动)→ 面板跟随节点屏幕坐标。
- 缩放画布(滚轮)→ 面板跟随。

### 4. 优先级:用户摆位 > buildGraph 默认
- 拖某节点后(等 saved 落地)→ 触发对话推进生成新分镜(让 `useShots` 重取,graph 重算)。
  - 预期:**已拖过的节点保持新位置不拽回**(buildGraph 取 saved 而非默认);**新分镜节点用 buildGraph 默认列布局**(无 saved → 走 fallback)。

### 5. 隔离不破回归
- 整轮对话推进(idea → script → ... → video)左侧全局对话仍然只走 chat();节点优化面板的拖拽/缩放操作**不**注入全局对话消息流。

## 合并 / 顺序

- 本 change 改 `Canvas/index.tsx` 的 `CanvasSync`,与 `improve-canvas-interaction`、`canvas-node-optimize-panel` 同区。已基于二者最新合并版(`main` @ `4b83ddf`)开发。
- `canvas-interaction` capability 已被本 change RENAMED + MODIFIED;`canvas-node-optimization` capability 的"面板跟随"Scenario 已被本 change MODIFIED。
- 视觉极限 / 节点 min/max(P4.2)按 design Decision 2 放开,实测后再约束 → 二期。
