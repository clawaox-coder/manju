# Canvas Interaction & Agent Implementation Plan

## Goal

把 Canvas 上“对话生成漫剧”的体验从机械流程改成连续共创：

- 对话负责收敛和拍板
- 画布负责同步可视化
- Agent 对外保持单一人格，对内允许多角色分工

设计基线见 [docs/2026-05-29-canvas-interaction-agent-design.md](/Users/aox/manju/docs/2026-05-29-canvas-interaction-agent-design.md)。

## Current Reality

目前实现已经比旧方案前进了一步：

- `chat()` 已经覆盖全流程
- `AgentStateMachine` 已是阶段追踪器
- 剧本候选已回到聊天卡片
- tldraw + `manjuNode` 已取代旧的 ReactFlow 假设

但还有三类体验问题没彻底收口：

- 对话仍偶尔像“阶段命令机”，而不是主创搭档
- 前台 agent 角色感太重，真实分工太弱
- 节点优化与主线对话之间缺少承接

## Product Direction

后续实现统一按这条链路走：

1. `理解`：接住用户意图，确认理解
2. `收敛`：只推进当前最关键的不确定点
3. `提案`：给 2-3 个有差异、有取舍的方向
4. `确认`：用户拍板，或做轻微拼装修改
5. `执行`：触发生成、匹配、渲染
6. `回看`：简短总结产物状态，引导下一步

## Workstreams

### 1. Prompt & Agent Behavior

- 强化后端 `CHAT_SYSTEM`，让它遵守“先回应，再提案/提问”的节奏。
- 把 agent 的核心目标从“收集字段”改成“推进决策”。
- 在 trigger 前加入一句确认式总结，减少硬切“下一步”。

### 2. Frontend Conversation UX

- 弱化“阶段切换”的流程感，用创作语言承接阶段变化。
- 继续保留卡片式候选，但每张卡要体现取舍，而不是同义改写。
- 节点优化完成后，在主线对话里加一条自然承接，恢复作品连续感。

### 3. Agent Surface Design

- 对外只保留一个“主创搭档”人格。
- 同时明确显示“当前协作专家”，让用户看见实际在工作的 agent。
- 现有阶段头像如果保留，只作为视觉提示，不暗示“换人接管”。
- 多 agent 分工放到后台逻辑和 prompt 结构里，不直接暴露给用户。

### 4. Canvas Role Clarification

- 画布只展示已确认内容，不展示临时候选。
- 点节点默认进入局部编辑，不切走主线决策。
- 主线对话与节点编辑结果需要双向承接，但不互相抢主导权。

## Suggested Delivery Order

1. 先改 `services/ai-gateway/app/services/ai.py` 的 `CHAT_SYSTEM`
2. 再统一前端里“推进动作”的确认式文案
3. 然后收掉前台多角色过强的表演感
4. 最后补节点优化后的主线承接和恢复语句

## Non-Goals

- 不回退到旧的 `intent.classify + 前端状态机驱动全流程`
- 不把画布重新做成候选选择面板
- 不引入第二条用户可感知的 agent 主线
- 不为了“多 agent 感”强行增加更多人设和头像

## Done Means

满足以下 5 条，就说明这轮重构方向对了：

- 用户能连续聊完整条链路，不会感觉中途换系统
- Agent 的发言更像共创搭档，而不是流程按钮代理
- 候选决策都发生在聊天里
- 画布只承担结果镜像和局部聚焦
- 节点编辑不会把用户抛进另一套叙事节奏
