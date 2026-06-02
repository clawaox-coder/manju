# 验收说明(canvas-node-optimize-panel)

## 自动化可验证项(本环境可跑)

| 项 | 手段 |
|----|------|
| 构建 / 类型 | `pnpm build` |
| 前端单测 | `pnpm test`(节点→实体解析、各类型变体动作、面板锚定/关闭) |
| 「不触对话接口」回归 | 单测断言面板代码路径不 import / 不调用 `chat` / `streamScriptContinue` / `classifyIntent` |
| 后端端点单测 | `services/ai-gateway` pytest(`rewrite-scene` 仅改目标场 + 409 冲突;`shot/optimize` 三 mode) |

## 需完整后端栈 + 真 LLM key 的端到端走查

**为何不能在纯前端 / 无 key 环境自动跑**:节点优化端点依赖 ai-gateway 配置真 `ANTHROPIC_API_KEY` 且 script-service / asset-service 在线。条件具备时按此清单手动走查:

1. **分镜**:点一个分镜节点 → 面板出现缩略图 + 描述 + 参考图 + [改对白]/[改时长]/[重画这镜]。执行"改对白" → **仅该镜**对白变,其它镜不变,画布镜子刷新。
2. **剧本场**:点一个剧本场节点 → 输入重写指令 → **仅这一场**文本变化;制造版本冲突(并发改)→ 面板提示"内容已变,已刷新,请重试",不静默覆盖。
3. **角色**:点一个角色节点 → 改描述 / 优化设定 → 角色节点刷新。
4. **枢纽节点**:点 `ai-gen` / `video-out` → 面板是**整体动作**(生成全部分镜 / 渲染整片)且**有二次确认**,而非单元素优化。
5. **隔离**:全程观察左侧全局对话——节点优化的中间态 / 结果**不**注入全局对话消息流。
6. **锚定**:面板打开后平移 / 缩放画布 → 面板跟随锚定节点;删除 / 移出该节点 → 面板关闭。

## 合并 / 顺序

- 本 change 改 `src/pages/Canvas/index.tsx` 的 `handleNodeClick` 与 selection 相关逻辑,与 `improve-canvas-interaction`(已落地的"点选→全局对话聚焦")**直接相关**:本 change 显式 MODIFY 其"点选节点"场景。落地前确认 `improve-canvas-interaction` 已合入,避免对同一行为的两种实现并存。
- 画布拖拽 / 缩放(可编辑工作台)是约定的**第二步**,另起 change,不在此。
