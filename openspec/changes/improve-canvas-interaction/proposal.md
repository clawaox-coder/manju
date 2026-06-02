## Why

画布页(`/canvas`)的交互"感觉怪",根因不是单点 bug,而是三层结构性断裂:

1. **对话半 AI 半流水线**:idea 阶段是 LLM 自由对话(`chat()` 驱动,动态 options),一过这道坎,script/storyboard/voice/video 突然变成硬编码状态机 + 写死文案 + "一键配音/生成视频"式向导按钮(`getAgentMessage()`)。语气与操作模式在中途断档。状态机里还残留 `ask_type/ask_style/ask_duration/ask_audience` 四步固定问答(`IDEA_STEPS`),已被 LLM 取代却未走到。
2. **画布与对话对不上**:`buildGraph.ts` 构造了剧本列/AI 核心/角色/分镜/视频输出 + 连线的丰富图谱,但 `CanvasSync` 把每个节点都降级成 tldraw `note` 便利贴,`data`(对白、缩略图、状态、连线)全部丢弃。整套自定义节点组件(`ScriptNode`/`StoryboardNode`/`VideoNode`/`CharacterNode`/`AINode`)、`useCanvasLayout`、`nodeMotion`、candidate 入场动画**无任何文件 import**,是死代码。对话说"已放到画布上 👉 点选",画布只有方块。
3. **剧本候选选择断裂**:`buildCanvasGraph(..., undefined)` 永远不传 `candidateNodes`;`scriptCandidates` state 只在 `handleNodeClick` 读、从不渲染。AI 让用户去画布点选剧本方向,但候选卡从未进过画布——用户必撞的断点。

另有小问题:输入框回形针按钮无 `onClick`(摆设);hero/对话态靠 `messages.length === 1` 判断,脆弱;`restore()` 中 `hasVoice`/`hasVideo` 都跳 `video/offer`,分支冗余。

核心矛盾:产品想要"画布 + AI agent"双主角,但画布退化成便利贴、对话被切成两半,两者还互相引用对方不存在的状态。**本 change 选定「方案 A:对话为主轴,画布做实时可视化镜子」**——把 idea 阶段已验证的自然对话体验铺满全程,画布定位为只读 + 点选聚焦的过程可视化。

## What Changes

- **统一全程为 LLM 驱动对话**:后半段 stage 不再由状态机生产台词。`chat()` 扩展到所有 stage,后端 `chat_respond` 的系统提示从"只负责 idea"扩展到全管线;`ChatTrigger` 已声明的 `generate_storyboard`/`match_voice`/`render_video` 真正被后端输出与前端消费。状态机退化为纯「阶段追踪器」(记录 stage/step 与项目派生状态),不再产出文案。
- **剧本候选移入对话**:候选作为「决策」而非「画布物件」,在对话里以卡片组(`card-group` 消息类型,`types.ts` 已预留 `cards`/`CardOption`)呈现并点选,修掉断裂。画布不再被指望承载候选。
- **画布定位为只读镜子**:对话推进 → 画布自动长出/高亮对应卡片;点节点 = 在对话里聚焦讨论它。节点至少要正确显示自身语义(标题/对白/缩略图/状态)并画出连线,而非清一色便利贴。
- **清理死代码与残留**:删除未被引用的自定义节点组件及其布局/动画(若画布最终不复用它们),或将其接入真实渲染路径——二选一,不留无人 import 的误导代码;移除状态机 `IDEA_STEPS` 固定问答残留。
- **修掉随手可见的小 bug**:回形针按钮接上传或先撤;hero/对话态改为显式状态判断;`restore()` 合并冗余分支。

## Capabilities

### New Capabilities
- `canvas-interaction`: 画布页创作交互的完整行为契约——全程 LLM 对话驱动的统一推进、剧本候选的对话内选择、画布作为只读可视化镜子与对话的双向联动、阶段追踪与项目状态恢复。

### Modified Capabilities
<!-- 无既有 canvas spec,首个 change -->

## Impact

- **前端对话**:`src/pages/Canvas/index.tsx`(统一 `chat()` 调用、移除分阶段状态机分支)、`chat/ChatPanel.tsx`(候选卡片组渲染、hero 判断、回形针)、`agent/AgentStateMachine.ts`(退化为阶段追踪器、删 `IDEA_STEPS`)、`agent/AgentMessages.ts`(移除写死台词)、`agent/AgentIntentRouter.ts`(并入统一对话或简化)。
- **前端画布**:`buildGraph.ts`、`CanvasSync`(`index.tsx`)、自定义节点组件与 `canvas/`、`nodeMotion.ts`(接入或删除)。
- **后端**:`services/ai-gateway/app/services/ai.py`(`chat_respond` 系统提示扩展到全 stage、`trigger` 支持四种 action)、`routes/ai.py`(按需)。
- **类型**:`src/lib/api/ai.ts`(`ChatTrigger`/`ChatResponse` 已基本就绪,按需对齐)、`agent/types.ts`。
- **破坏性**:对话契约 `chat()` 的 stage 语义扩展,属向后兼容增强;画布节点渲染方式变更不影响持久化数据(`persistence.ts` 仅存坐标)。
