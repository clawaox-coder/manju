## Why

画布上的节点目前是「只读镜子」——点选只会在左侧全局对话里发起一轮聚焦讨论(`handleNodeClick` → `runAgentTurn("我想聊聊…")`),用户**无法针对单个元素做精细优化**(改这一镜的对白 / 只重画这一镜、重写这一场、调这个角色)。要改某个具体元素,只能在全局对话里间接推进整段流水线("一大步"),既不精准也容易误触全量动作。缺一个**绑定到单个节点的优化入口**。

(注:画布节点可拖拽 / 缩放是并行的「第二步」需求,**不在本 change**;本 change 只做「点节点 → 聚焦优化面板」。)

## What Changes

- 新增**单节点聚焦优化面板**(`NodeOptimizePanel`):点画布任一节点 → 在该节点旁弹出**锚定浮动面板**,随画布平移 / 缩放跟随。
- 面板**覆盖全部 5 类节点**,分两种语义:
  - **内容节点**(剧本场 / 角色 / 分镜)= 单元素优化(只改这一个元素)。
  - **枢纽节点**(`ai-gen` / `video-out`)= 整体动作控制台(生成全部分镜 / 渲染整片),对昂贵动作二次确认。
- **节点优化一律走专门接口,绝不复用通用对话接口**(`chat()` / `streamScriptContinue()` / `classifyIntent()`)。新增 ai-gateway 专门端点:`/v1/ai/script/rewrite-scene`、`/v1/ai/shot/optimize`、`/v1/ai/character/optimize`。
- 剧本场做**精准单场重写**(定位该场 → LLM 仅重写该场 → 原子替换 → bump version),不走整文覆盖。
- **替换**原 `handleNodeClick` 的「点节点 → 全局对话聚焦」行为为「点节点 → 打开面板」;左侧全局对话保留,继续管整段流水线。
- 写回成功 → 失效对应 react-query → `buildCanvasGraph` 重算 → 画布镜子 + 面板预览自动刷新。

## Capabilities

### New Capabilities
- `canvas-node-optimization`:单节点聚焦优化面板的完整行为契约——锚定浮动面板、5 类节点自适应、专门优化接口(与全局对话隔离)、精准单场重写、写回驱动镜子刷新。

### Modified Capabilities
- `canvas-interaction`:「点选节点」的结果由"在全局对话中聚焦讨论"改为"打开单节点优化面板"(只读镜子的其余语义不变)。

## Impact

- **前端**:`src/pages/Canvas/` 新增 `NodeOptimizePanel/`(外壳 + 各类型变体 + 锚定 hook);`index.tsx` 改 `handleNodeClick`(开面板替代 focus turn)、移除 `sm.focusNode` 写死分支;`src/lib/api/ai.ts` 增三个专门优化接口 client。
- **后端**:`services/ai-gateway`(新增 `script/rewrite-scene`、`shot/optimize`、`character/optimize` 端点 + 单场重写编排);`services/script-service`(单场重写的服务端定位 / 原子替换按需小扩展,见 design Decision 4)。
- **不动**:通用对话 `chat()` 契约;画布只读语义(本 change 仍不开放拖拽 / 缩放);`persistence.ts`。
- **二期(明确不在本 change)**:图像模型 / 比例 / 分辨率旋钮(需 ai-gateway 生成参数扩展);角色头像 AI 重生成;画布节点拖拽 / 缩放。
