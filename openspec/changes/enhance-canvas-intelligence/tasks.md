# 实现计划:按 M1-M4 渐进落地

关键路径:M1 画布理解 → M2 智能规划 → M3 结果自检 → M4 长期记忆。每期都应能独立验收，不把"更智能"拖成一次大爆炸。

## M0. 准备与契约对齐

- [ ] M0.1 确认最终智能入口路径:首选 `POST /v1/ai/canvas/turn`，旧 `/v1/ai/chat` 保留兼容。
- [ ] M0.2 在 `src/lib/api/ai.ts` 增加 `CanvasTurnRequest/Response`、`AgentPlan`、`AgentAction`、`AgentFinding` 类型。
- [ ] M0.3 在 `services/ai-gateway/app/routes/ai.py` 新增 canvas intelligence router 或在现有 ai router 下挂载。
- [ ] M0.4 为新增响应结构写前后端契约测试，先锁 JSON shape，不接真实模型。

## M1. 画布理解:canvas_snapshot

- [ ] M1.1 ai-gateway 新增 `app/services/canvas_snapshot.py`，按 `project_id/team_id/user_id` 构建权威快照。
- [ ] M1.2 新增 repo 查询:projects、scripts、shots、assets、project_assets、ai_tasks、render_jobs；所有查询走 `team_ctx` 或现有服务边界。
- [ ] M1.3 实现 deterministic gaps/readiness:
  - 无剧本 / 场景数为 0
  - 无角色参考图
  - shot 缺图 / 缺对白 / duration 异常
  - 最近 AI/render 失败
  - video 被前置条件阻塞
- [ ] M1.4 实现文本截断与场景摘要策略，避免把完整剧本塞入每轮 prompt。
- [ ] M1.5 新增 `GET /v1/ai/canvas/snapshot?project_id=...` 只读 debug 接口。
- [ ] M1.6 新增 pytest:不同项目状态下 snapshot/readiness/gaps 输出正确，跨 team 不泄漏。
- [ ] M1.7 前端接入 snapshot 摘要展示:用户问"现在缺什么"时能显示缺口列表。

## M2. 智能规划:plan + action catalog

- [ ] M2.1 ai-gateway 新增 planner system prompt，输入 `canvas_snapshot + memories + user message`，输出严格 JSON。
- [ ] M2.2 定义 action catalog 白名单:
  - `generate_script_candidates`
  - `save_script_candidate`
  - `generate_storyboard`
  - `generate_storyboard_images`
  - `optimize_shot`
  - `optimize_character`
  - `match_voice`
  - `render_video`
  - `run_self_check`
  - `ask_user`
- [ ] M2.3 新增 `agent_runs`、`agent_steps` 迁移，启用 RLS + FORCE RLS。
- [ ] M2.4 `POST /v1/ai/canvas/turn` 创建 `agent_runs`，写入 snapshot summary、plan、status。
- [ ] M2.5 前端 `ChatPanel` 新增计划卡片 UI:步骤、原因、成本、确认/跳过/修改。
- [ ] M2.6 实现 action 确认入口:前端确认某步后调用 action run endpoint 或 canvas turn 的 follow-up action。
- [ ] M2.7 接入现有制作动作:
  - 剧本候选生成沿用 `streamScriptContinue` 或迁入 ai-gateway action
  - 分镜生成沿用 `storyboardGenerate`
  - 配音沿用 `voiceMatch`
  - 渲染沿用 `createRender`
- [ ] M2.8 后端校验:viewer 禁止写 action，高成本 action 未确认不得执行。
- [ ] M2.9 测试:非法 action、跨阶段 action、viewer 写动作、高成本未确认均被拒绝。

## M3. 结果自检:self-check + findings

- [ ] M3.1 新增 `agent_findings` 迁移，启用 RLS + FORCE RLS。
- [ ] M3.2 实现 deterministic checks:
  - 剧本/场景完整性
  - 分镜覆盖与缺图
  - 角色参考图/描述缺失
  - 时长偏差
  - 最近任务失败
- [ ] M3.3 实现 LLM critic:
  - 剧本一致性
  - 分镜覆盖剧本重点
  - 角色一致性
  - 台词质量
  - 转场/节奏问题
- [ ] M3.4 action 执行成功后按目标类型自动触发局部或项目级 self-check。
- [ ] M3.5 findings 写入后，前端 invalidate 查询并刷新画布徽标。
- [ ] M3.6 `buildCanvasGraph` 接收 findings/plan badges，节点显示 blocker/warning/suggestion。
- [ ] M3.7 `NodeOptimizePanel` 或聊天质检摘要支持点击某条 finding 后定位到目标节点。
- [ ] M3.8 测试:缺图 shot 产生 warning；无分镜阻塞 video；已修复 finding 可标 resolved。

## M4. 长期记忆:project/user memories

- [ ] M4.1 新增 `agent_memories` 迁移，启用 RLS + FORCE RLS。
- [ ] M4.2 实现 memory service:
  - 读取当前项目记忆
  - 读取当前用户偏好记忆
  - 写入/更新/软删除记忆
  - 过滤空泛或低价值记忆
- [ ] M4.3 planner 输入加入 memory context，明确区分 project memory 和 user preference。
- [ ] M4.4 LLM 只能"提议"记忆写入，服务端按规则过滤并落库。
- [ ] M4.5 前端显示轻量记忆提示，如"已记住:本项目保持冷调古风"，并提供删除入口。
- [ ] M4.6 测试:
  - 项目记忆只在对应项目生效
  - 用户偏好跨项目可读
  - 跨 team 不可读
  - 删除后不再进入 planner context

## M5. 端到端体验与回归

- [ ] M5.1 用真实项目走查:"帮我看看现在缺什么" → Agent 输出准确缺口 + 计划。
- [ ] M5.2 确认计划步骤后能生成/补齐分镜，并写 agent_steps。
- [ ] M5.3 生成后自动出现质检摘要，画布节点显示问题徽标。
- [ ] M5.4 用户确认风格偏好后，下一轮对话能引用项目记忆。
- [ ] M5.5 跑 `pnpm build`、`pnpm test`、`services/ai-gateway pytest`。
- [ ] M5.6 更新 `VERIFICATION.md`，记录需要真实 LLM key / 后端栈的手动验收项。
