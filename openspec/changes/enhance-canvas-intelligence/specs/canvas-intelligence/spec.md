## ADDED Requirements

### Requirement: 画布快照必须作为 Agent 的权威上下文

系统 SHALL 在每轮画布智能对话前基于服务端数据构建 `canvas_snapshot`，汇总项目、剧本、角色资产、项目参考图、分镜、AI 任务、渲染任务、画布焦点、缺失项和制作就绪状态。Agent SHALL 基于该快照推理，而不是仅依赖前端传入的 `has_script/has_shots` 等粗粒度布尔值。

#### Scenario: 用户询问当前缺口
- **WHEN** 用户在画布对话中输入"现在还缺什么"
- **THEN** 系统基于 `canvas_snapshot.gaps` 返回具体缺口
- **AND** 缺口包含目标对象、数量、严重程度和建议动作

#### Scenario: 服务端事实优先
- **WHEN** 前端传入的 client context 与服务端项目事实不一致
- **THEN** 系统以服务端查询得到的项目事实为准
- **AND** 不因前端展示状态缺失而产生错误计划

#### Scenario: 快照不泄漏跨租户数据
- **WHEN** 用户请求不属于当前 team 的项目快照
- **THEN** 系统不得返回该项目的任何数据
- **AND** 响应为 404 或等价的不可见结果

### Requirement: Agent 必须输出可执行计划

系统 SHALL 将 Agent 回合输出从单个 `trigger` 升级为结构化计划。计划 SHALL 包含 2-5 个步骤，每个步骤具备标题、原因、目标、动作类型、是否需要确认、成本等级和当前状态。计划 SHALL 可由用户确认、跳过或修改。

#### Scenario: 信息足够时输出计划
- **WHEN** 用户表达"下一步帮我安排一下"
- **AND** 当前 `canvas_snapshot` 足以判断制作状态
- **THEN** 系统返回一个结构化 plan
- **AND** plan 中每个步骤都说明为什么需要执行

#### Scenario: 信息不足时先追问
- **WHEN** 当前项目缺少关键创作方向
- **THEN** plan 可包含 `ask_user` 步骤
- **AND** 系统不得强行触发写入型制作动作

#### Scenario: 写入或高成本动作需要确认
- **WHEN** plan step 的 action 会写入数据或产生显著成本
- **THEN** 该 step 必须标记 `requires_confirmation=true`
- **AND** 未经用户确认不得执行

#### Scenario: 非法动作被拒绝
- **WHEN** Agent 输出不在 action catalog 白名单内的 action
- **THEN** 服务端 SHALL 拒绝执行
- **AND** 记录 agent step 错误以便审计

### Requirement: Agent action 必须受权限、配额和审计约束

系统 SHALL 将可执行制作能力注册为 action catalog。每个 action SHALL 声明读写性质、成本等级、目标类型、权限要求和执行器。执行 action 时 SHALL 写入 `agent_steps`，并遵守 JWT role、RLS、配额、服务边界和幂等约束。

#### Scenario: viewer 不能执行写动作
- **WHEN** role 为 viewer 的用户确认写入型 action
- **THEN** 系统 SHALL 返回权限不足
- **AND** 不得修改项目数据

#### Scenario: action 执行可审计
- **WHEN** 系统执行任一 action
- **THEN** 系统创建或更新对应 `agent_steps`
- **AND** 记录 action_type、target、input、result、status 和 error

#### Scenario: 执行失败可恢复
- **WHEN** action 执行失败
- **THEN** 系统 SHALL 在对话中返回失败原因和下一步建议
- **AND** plan 中该 step 状态变为 failed

### Requirement: 生成和优化后必须支持结果自检

系统 SHALL 在剧本、分镜、角色图或视频相关生成/优化后运行自检。自检 SHALL 包含 deterministic checks 和 LLM critic 两层，并将发现写入 `agent_findings`。发现 SHALL 映射到项目级或具体节点级目标。

#### Scenario: 缺图分镜产生 finding
- **WHEN** 某个 shot 缺少 `image_url`
- **THEN** 自检 SHALL 产生 warning 级 finding
- **AND** finding 的 target 指向该 shot

#### Scenario: 视频前置条件不足
- **WHEN** 项目没有分镜或大量分镜缺图
- **THEN** 自检 SHALL 产生 blocker 或 warning
- **AND** render_video action 不应被默认推荐为下一步

#### Scenario: LLM critic 只补充创作质量判断
- **WHEN** deterministic checks 已识别结构性问题
- **THEN** LLM critic SHALL 基于这些事实补充创作质量建议
- **AND** 不得覆盖 deterministic checks 的客观结论

#### Scenario: findings 可被解决
- **WHEN** 用户执行修正 action 并重新自检通过
- **THEN** 相关 finding 可标记为 resolved
- **AND** 画布节点不再显示该问题徽标

### Requirement: 画布必须呈现智能层状态

Canvas SHALL 展示智能层产生的计划、缺口、自检发现和行动状态。节点 SHALL 能显示来自 `agent_findings`、`canvas_snapshot.gaps`、`agent_steps` 的徽标。用户 SHALL 能从聊天计划或节点徽标定位到相关节点。

#### Scenario: 节点显示问题徽标
- **WHEN** 某个节点存在 open finding
- **THEN** 该节点显示对应 severity 的徽标
- **AND** 徽标数量与 open finding 数量一致或可解释地聚合

#### Scenario: 计划步骤定位节点
- **WHEN** plan step 指向具体 shot 或 asset
- **THEN** 用户可以从计划卡片定位到对应画布节点

#### Scenario: action 状态反馈到画布
- **WHEN** 某个节点相关 action 正在执行
- **THEN** 画布节点显示 running 状态
- **AND** action 完成或失败后状态更新

### Requirement: 系统必须维护项目记忆和用户偏好记忆

系统 SHALL 支持两类长期记忆：项目记忆和用户偏好记忆。项目记忆 SHALL 只在当前项目上下文使用；用户偏好记忆 MAY 跨项目使用，但 SHALL 受 team/user 权限隔离。记忆写入 SHALL 是结构化摘要，不应无选择地保存完整对话原文。

#### Scenario: 项目记忆影响后续计划
- **WHEN** 用户确认"这个项目一直保持冷调古风"
- **THEN** 系统可写入 project memory
- **AND** 后续生成分镜或角色图时将该记忆作为风格约束

#### Scenario: 用户偏好跨项目生效
- **WHEN** 用户多次确认偏好"少解释、快节奏"
- **THEN** 系统可写入 user preference memory
- **AND** 同 team/user 的其他项目对话可参考该偏好

#### Scenario: 记忆可删除
- **WHEN** 用户要求删除某条记忆或偏好
- **THEN** 系统 SHALL 软删除该记忆
- **AND** 后续 planner context 不再包含它

#### Scenario: 低价值记忆不写入
- **WHEN** LLM 提议保存空泛内容
- **THEN** 服务端 SHALL 过滤该 memory update
- **AND** 不写入 `agent_memories`

### Requirement: 新增智能数据必须遵守 RLS 和安全边界

所有智能层新增持久化数据 SHALL 使用 `team_id` 隔离并启用 `FORCE ROW LEVEL SECURITY`。Agent 不得绕过现有权限模型执行写入。服务端 SHALL 对 LLM 输出的 action、memory 和 finding 做 schema 校验。

#### Scenario: 新增表启用 RLS
- **WHEN** 创建 `agent_runs`、`agent_steps`、`agent_memories`、`agent_findings`
- **THEN** 每张表都启用 RLS 和 FORCE RLS
- **AND** 策略以 `app.team_id` 隔离

#### Scenario: LLM 输出必须校验
- **WHEN** planner 返回 plan/action/memory/finding JSON
- **THEN** 服务端 SHALL 用 schema 校验
- **AND** 无效字段或未知枚举不得进入执行路径

#### Scenario: Agent 不可绕过服务边界
- **WHEN** action 需要修改 script、shot、asset 或 render 数据
- **THEN** 系统 SHALL 使用既有服务 API 或受控 repo 封装
- **AND** 不允许 LLM 生成任意 SQL 直接执行
