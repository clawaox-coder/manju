# 实现计划:按 P0–P5 依赖顺序

关键路径:P1 → P2 →(P3 ∥ P4)→ P5。P0 与 P1 前端侧可提前并行;P3 与 P4 触及不同区域可并行(P4.3 依赖 P2 的 `runAgentTurn`)。

## P0. 暖身:小 bug 清理 + 测试现状盘点(低风险,先做)

- [ ] P0.1 `chat/ChatPanel.tsx`:回形针(`Paperclip`)按钮接上现有上传能力,或先移除该按钮(不新增上传后端)
- [ ] P0.2 `ChatPanel.tsx`:hero/对话态判断从 `messages.length === 1` 改为显式状态(如基于是否已有用户消息)
- [ ] P0.3 `AgentStateMachine.restore()`:合并 `hasVoice`/`hasVideo` 都跳 `video/offer` 的冗余分支
- [ ] P0.4 盘点 `src/test/canvas-agent.test.ts`:标出依赖待删行为(`advance→ask_type`、`selectOption→ideaContext`、`focusNode→editing`、idea 四步)的用例,作为 P2.7 重写的输入
- [ ] P0.5 验证:`pnpm build` 绿;小 bug 不引入回归

## P1. 对话契约:后端 agent 扩展到全管线(全栈,可与 P0 前端侧并行)

- [x] P1.1 `services/ai-gateway/app/services/ai.py` 的 `CHAT_SYSTEM`:从「只负责 idea 阶段」改为按 `stage` 给阶段感知的对话指引(idea/script/storyboard/voice/video 各自口吻与可收集信息)
- [x] P1.2 扩展 `trigger` 规则:允许按 stage 输出 `generate_script`/`generate_storyboard`/`match_voice`/`render_video`,prompt 内严格约束「每 stage 只许其对应动作」
- [x] P1.3 `chat_respond` 的 prompt 已透传 stage 与项目状态,按需补 `has_voice`/`has_video`,确认足以让 agent 判断推进时机
- [x] P1.4 前端 `src/lib/api/ai.ts`:确认 `ChatTrigger.action` 四种动作与 `ChatResponse` 已对齐(基本就绪,按需补全)
- [x] P1.5 验证:手动 curl `/v1/ai/chat` 对各 stage,确认口吻一致、options 合理、trigger 仅在该 stage 合法动作内产生。此契约须先打通再动 P2 前端主干

## P2. 统一对话主干:runAgentTurn + 状态机退为追踪器(关键路径,最大块)

- [x] P2.1 `index.tsx`:`runIdeaAgentTurn` → 通用 `runAgentTurn`,所有 stage 自由输入走同一 `chat()` 路径
- [x] P2.2 `index.tsx` `handleSendMessage`:移除按 stage 分叉到 `AgentIntentRouter` 的逻辑
- [x] P2.3 `index.tsx`:对 `trigger.action` 做「当前 stage 是否允许」校验,合法才调对应制作 API(`updateScript`/`storyboardGenerate`/`voiceMatch`/`createRender`),非法忽略
- [x] P2.4 `agent/AgentStateMachine.ts`:删 `IDEA_STEPS`/`IDEA_CONTEXT_KEYS` 与 `advance()`/`selectOption()` 的 idea 分支;保留 `restore()` 与阶段推进方法,使其只作进度追踪
- [x] P2.5 `agent/AgentMessages.ts`:移除 `getIdeaMessage`/`getScriptMessage` 等写死台词生成器(保留 `makeUserMessage`/`makeSystemMessage` 等工具)
- [x] P2.6 `agent/AgentIntentRouter.ts`:并入统一对话或删除;若删除则一并移除 `classifyIntent` 前端调用点
- [x] P2.7 **重写 `src/test/canvas-agent.test.ts`**:删掉断言已删行为的用例(约 6-7 个);保留并强化 `restore()` 与 `complete→voice→video→done` 进度追踪用例;新增「trigger 越权被忽略」单测
- [x] P2.8 验证:从 idea 一路对话到 video,各阶段语气一致、无向导式写死按钮;推进由对话触发;`canvas-agent.test.ts` 全绿

## P3. 剧本候选移入对话(依赖 P2)

- [ ] P3.1 `chat/ChatPanel.tsx`:实现 `card-group` 消息类型渲染(读 `ChatMessage.cards`/`CardOption`),卡片显示标题 + 内容预览,可点选
- [ ] P3.2 `index.tsx`:剧本候选生成后以 `card-group` 消息推入对话,移除「已放到画布上 👉 点选」式文案
- [ ] P3.3 `index.tsx`:点选候选卡 → 作为一次用户 turn 回填对话并确认所选方向;移除 `handleNodeClick` 的 `candidate-` 分支与 `scriptCandidates` 的画布耦合
- [ ] P3.4 验证:生成多个剧本方向时卡片在对话内可见可选;选定后正确推进到分镜阶段,全程无「指向空画布」

## P4. 画布作为只读可视化镜子(可与 P3 并行;P4.3 依赖 P2)

- [x] P4.1 Spike(半天):验证 tldraw v5 arrow binding 手感——最小用例 2 个 note + 1 条 bound arrow,移动节点验证连线跟随;手感不佳则降级为「只渲染节点 + 布局列暗示上下游」。结论写回 `design.md` Decision 4
- [ ] P4.2 写通用 `manjuNode` ShapeUtil:`props.nodeType` 切 script/storyboard/video/character/ai 渲染,`component()` 复用既有节点组件主体(去掉 framer mount 动画改 CSS),节点 `isLocked` 保持只读
- [ ] P4.3 `CanvasSync`(`index.tsx`):不再一律 `note`,按 type 用 `manjuNode` 渲染语义信息(剧本标题/分镜对白与缩略图/角色/视频状态),并按 P4.1 结论绘制 `buildGraph` 的 edges
- [ ] P4.4 联动:对话推进改变 stage → 画布高亮当前阶段对应节点;点画布节点 → 触发一轮带 `focus` 上下文的 `chat()`(依赖 P2 的 `runAgentTurn`),移除 `focusNode` 写死台词分支
- [ ] P4.5 死代码处置:依 P4.1/P4.2 结论,接入 `ScriptNode`/`StoryboardNode`/`VideoNode`/`CharacterNode`/`AINode` + `canvas/useCanvasLayout.ts`/`nodeMotion.ts`/`useContextFocus.ts`,或整体删除——结束时无任何无人 import 的组件
- [ ] P4.6 验证:节点显示与类型相符的信息且有连线(或降级形态);对话推进时画布自动更新;点节点能在对话聚焦

## P5. 整体验收

- [ ] P5.1 运行构建/类型检查(`pnpm build`)无报错;`pnpm lint` 无新增告警
- [ ] P5.2 运行测试 `pnpm test`,确认 P2.7 重写后的 `canvas-agent.test.ts` 与候选选择相关测试全绿
- [ ] P5.3 端到端走查(Playwright `e2e/`):新建项目 → idea 对话 → 选剧本 → 分镜 → 配音 → 视频全链路,确认交互连贯、画布与对话一致、无悬空控件
- [ ] P5.4 合并顺序:本 change 与 `improve-dark-mode` 都改 `Canvas/index.tsx`,建议在 dark-mode 合入后再落地,合并时重点关注 `CanvasSync` 附近冲突
