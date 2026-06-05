## Why

当前 `/canvas` 已经具备画布、自然对话、节点优化、分镜生成、参考图、多模态生成、渲染等核心能力，但用户感知上的"智能感"仍不够。根因不是单个模型能力不足，而是 Agent 只拿到粗粒度上下文，主要按阶段触发接口：

```text
用户输入 → chat() 返回 reply/options/trigger → 前端执行某个制作动作
```

这让 Agent 更像"对话式按钮调度器"，而不是懂项目状态的导演/制片助手。它目前不能稳定回答这些用户自然会问的问题：

- "帮我看看现在还缺什么？"
- "这个项目下一步该做什么？"
- "这些分镜有没有漏掉剧本重点？"
- "以后都按我喜欢的这个风格来。"

要让项目明显更智能，需要新增一层 **Canvas Intelligence Layer（画布智能层）**：

```text
看懂画布 → 记住偏好 → 规划任务 → 执行工具 → 自检结果 → 继续调整
```

这层不替代现有微服务和 Canvas 交互，而是把已有剧本、资产、分镜、AI 任务、渲染任务、节点优化能力组织成可推理、可计划、可检查、可记忆的 Agent 工作流。

## What Changes

- **画布理解**：新增服务端 `canvas_snapshot` 构建能力，汇总项目、剧本场景、角色/参考图、分镜、任务、渲染、缺失项和质量信号。Agent 每轮对话基于这个结构化快照，而不是仅知道 `has_script/has_shots`。
- **智能规划**：新增计划输出契约。Agent 不再只返回一个 `trigger`，而是返回 2-5 个可执行步骤，每步有目标、原因、动作、风险、是否需要确认。前端以计划卡片/待办形态展示，并允许用户确认、跳过或修改。
- **结果自检**：每次剧本/分镜/角色图/视频相关生成后，自动运行 deterministic checks + LLM critic，产出缺口、风险和修正建议，并把问题映射回画布节点。
- **长期记忆**：新增项目记忆和用户偏好记忆。项目记忆记录已确认的世界观、角色、风格、决策；用户记忆记录长期偏好。首版用结构化摘要，不引入向量库；后续可加 pgvector/embedding。
- **工具化执行**：把现有制作能力注册成 Agent action catalog（生成剧本候选、生成分镜、优化节点、配音、渲染、自检等），统一权限、确认、审计和错误恢复。

## Capabilities

### New Capabilities

- `canvas-intelligence`：画布智能层的完整行为契约，包括画布快照、智能计划、行动确认、结果自检、长期记忆、画布节点反馈和安全边界。

### Modified Capabilities

- `canvas-interaction`：全局对话从"阶段触发器"升级为"基于画布状态的项目管理对话"；节点优化保持独立，但其结果纳入自检与记忆。
- `canvas-node-optimization`：节点优化完成后触发局部自检，并把发现的问题以节点徽标/聊天摘要反馈。

## Impact

- **后端 ai-gateway**：
  - 新增 `canvas_snapshot` service/repo 组合，读取 scripts/shots/assets/ai_tasks/render_jobs 等现有数据。
  - 新增 `POST /v1/ai/canvas/turn` 或扩展现有 `/v1/ai/chat` 为画布智能入口。
  - 新增 action catalog、planner、critic、memory service。
  - 新增 RLS 表：`agent_runs`、`agent_steps`、`agent_memories`、`agent_findings`。
- **前端 Canvas**：
  - `src/pages/Canvas/index.tsx`：对话请求携带 focus/client state，消费 `plan/checks/memory`。
  - `ChatPanel`：新增计划卡片、行动确认、自检摘要、记忆提示。
  - `buildGraph`/节点视图：显示缺口、自检问题、计划状态和当前关注节点。
- **API 类型**：
  - `src/lib/api/ai.ts`：新增 `CanvasTurnRequest/Response`、`AgentPlan`、`AgentAction`、`AgentFinding` 类型。
- **数据库/安全**：
  - 所有新增表按 `team_id` RLS 隔离。
  - 写入型/高成本 action 必须确认；viewer 不可触发写操作。
- **非目标**：
  - 不把 Toonflow 的本地 SQLite/VM 供应商系统照搬进来。
  - 不在首版做完全自治的后台 Agent 长任务。
  - 不让 Agent 绕过现有服务边界直接做任意 SQL 写入。
