# 设计:Canvas Intelligence Layer

## Context

当前项目已经具备较好的基础:

- 前端 `/canvas` 使用 tldraw 自定义节点，能展示剧本场、角色、AI、分镜、视频输出，并支持节点拖拽/缩放、用户连线、节点优化面板。
- 全局对话通过 `chat()` 返回 `reply/options/extracted/trigger`，并由前端触发 `generate_script`、`generate_storyboard`、`match_voice`、`render_video`。
- ai-gateway 已有 `ai_tasks` 审计、Anthropic 文本/多模态、OpenAI 图像/TTS、项目参考图注入、节点优化端点。
- 后端是多服务架构，关键数据分布在 `projects`、`scripts`、`shots`、`assets`、`project_assets`、`ai_tasks`、`render_jobs` 等表。

问题在于 Agent 当前上下文过薄:

```text
前端传入: stage + has_script + has_shots + has_voice + has_video + idea
Agent 能判断: 现在在哪个阶段, 是否已有粗略产物
Agent 不能稳定判断: 具体缺什么、哪里质量差、下一步为什么这么做、历史偏好是什么
```

因此本 change 要新增一层服务端智能上下文与执行框架，让 Agent 从"触发器"升级为"项目管理者"。

## Goals / Non-Goals

**Goals:**

- Agent 能基于画布当前真实数据回答"现在缺什么/下一步做什么/为什么"。
- Agent 每轮可输出可执行计划，而不是单个 trigger。
- 生成或优化后自动自检，并把问题映射到具体节点或项目级别。
- Agent 能记住项目内已确认决策和用户长期偏好。
- 所有智能行为受现有鉴权、RLS、配额、确认和审计约束。

**Non-Goals:**

- 不一次性实现完全自治、多小时运行的后台 Agent。
- 不把所有业务逻辑搬进 ai-gateway；写入仍优先走现有服务 API 或既有 repo 边界。
- 不首版引入 pgvector/embedding；记忆先用结构化摘要。
- 不替换 Canvas 当前节点优化面板；它继续负责单节点精修。
- 不做模型供应商可编程系统；供应商抽象另起 change。

## Core Concept

画布智能层由五个模块组成:

```text
┌─────────────────────────────────────────────────────────────┐
│                      Canvas Intelligence                     │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Observe      │ Remember     │ Plan         │ Act            │
│ 画布快照      │ 项目/用户记忆   │ 智能计划       │ 工具执行          │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬─────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
  canvas_snapshot  agent_memories  agent_plan   action_catalog
       │                                             │
       └──────────────────────┬──────────────────────┘
                              ▼
                          Critique
                          结果自检
```

一次智能回合的目标流程:

```text
用户输入 / 点节点 / 制作动作完成
  → 构建 canvas_snapshot
  → 读取相关 memory
  → LLM planner 输出 reply + plan + actions + checks
  → 前端展示计划 / 请求确认
  → 执行 action
  → 写 agent_steps / ai_tasks
  → 自动 self-check
  → 写 findings + memory_updates
  → 画布显示缺口/问题/下一步
```

## Decisions

### 1. 服务端构建 `canvas_snapshot`,不依赖前端拼上下文

`canvas_snapshot` 是 deterministic 结构，由 ai-gateway 根据 `project_id + team_id + user_id` 构建。前端可传 `focus_node_id`、当前选中节点、局部 UI 状态，但项目事实以服务端查询为准。

快照建议结构:

```json
{
  "project": {
    "id": "uuid",
    "name": "项目名",
    "status": "draft",
    "metadata": {}
  },
  "script": {
    "exists": true,
    "version_no": 3,
    "scene_count": 8,
    "scenes": [
      {"index": 0, "title": "开场", "summary": "120 字内摘要", "char_count": 540}
    ]
  },
  "characters": [
    {
      "id": "uuid",
      "name": "沈辞",
      "has_image": true,
      "is_project_ref": true,
      "description": "截断后的角色描述",
      "gaps": []
    }
  ],
  "shots": [
    {
      "id": "uuid",
      "order_index": 0,
      "title": "镜头 1",
      "duration_ms": 5000,
      "has_dialog": true,
      "has_image": false,
      "scene_hint": "开场",
      "gaps": ["missing_image"]
    }
  ],
  "tasks": {
    "recent_ai": [{"task_type": "storyboard.generate", "status": "failed"}],
    "recent_render": [{"status": "queued", "progress": 0}]
  },
  "graph": {
    "node_count": 16,
    "edge_count": 20,
    "focus_node": {"id": "shot-...", "kind": "shot"}
  },
  "gaps": [
    {"code": "shots_missing_images", "severity": "warning", "count": 5},
    {"code": "no_voice_ready", "severity": "info", "count": 1}
  ],
  "readiness": {
    "script": "ready",
    "storyboard": "partial",
    "voice": "missing",
    "video": "blocked"
  }
}
```

设计约束:

- 快照不塞完整长文本。长剧本按场景摘要/截断片段进入，避免 prompt 过大。
- `gaps/readiness` 由规则计算，不交给 LLM 猜。
- 快照可用于 debug，因此提供可选只读接口 `GET /v1/ai/canvas/snapshot?project_id=...`。
- 对外返回的快照必须遵守 team RLS；跨 team 查不到即 404/空。

替代方案"前端把当前 graph 全量传给后端"否决：前端 graph 是展示派生物，不是权威数据源；同时容易漏掉 ai_tasks/render_jobs 等服务端状态。

### 2. 新增 `POST /v1/ai/canvas/turn` 作为智能入口

首版保留现有 `/v1/ai/chat`，新增更强的画布智能入口:

```http
POST /v1/ai/canvas/turn
```

请求:

```json
{
  "project_id": "uuid",
  "message": "帮我看看现在还缺什么",
  "stage": "storyboard",
  "focus_node_id": "shot-uuid",
  "client_context": {
    "selected_node_ids": ["shot-uuid"],
    "visible_panel": "node_optimize",
    "user_intent_hint": "ask_status"
  }
}
```

响应:

```json
{
  "run_id": "uuid",
  "reply": "现在主要缺 5 张分镜图和配音...",
  "thinking": "我先看了剧本、分镜和最近任务状态...",
  "snapshot_summary": {
    "readiness": {"script": "ready", "storyboard": "partial", "voice": "missing", "video": "blocked"},
    "top_gaps": [{"code": "shots_missing_images", "count": 5}]
  },
  "plan": {
    "id": "uuid",
    "title": "补齐分镜并准备配音",
    "steps": [
      {
        "id": "s1",
        "title": "补齐缺图分镜",
        "reason": "5 个 shot 缺 image_url,视频渲染前需要画面",
        "action": {"type": "generate_storyboard_images", "target_ids": ["..."]},
        "requires_confirmation": true,
        "cost_level": "medium",
        "status": "proposed"
      }
    ]
  },
  "actions": [
    {
      "id": "a1",
      "type": "run_self_check",
      "label": "先做一次质检",
      "requires_confirmation": false
    }
  ],
  "findings": [],
  "memory_updates": [
    {"scope": "project", "kind": "decision", "content": "用户确认项目走冷调古风"}
  ]
}
```

`chat()` 可以在后续阶段逐步迁移到调用同一 service，但首版不强行删老接口，降低改动风险。

### 3. 计划输出必须可执行、可解释、可拒绝

计划不是展示文案，而是行动图。每个 step 必须满足:

- 有明确 `action.type` 或 `kind=question`。
- 有 `reason`，说明为什么下一步做它。
- 标明 `requires_confirmation` 和 `cost_level`。
- 可被用户 `confirm/skip/edit`。
- 不允许跨权限执行：viewer 永远不能执行写动作。

行动类型首版白名单:

| Action Type | 说明 | 是否写入 | 是否昂贵 | 执行方式 |
|---|---|---:|---:|---|
| `generate_script_candidates` | 生成 2-3 个剧本方向 | 否 | 中 | ai-gateway |
| `save_script_candidate` | 保存选中的剧本 | 是 | 低 | script-service/repo |
| `generate_storyboard` | 生成/重生成分镜 | 是 | 高 | 既有 storyboardGenerate |
| `generate_storyboard_images` | 给缺图分镜补图 | 是 | 高 | image service + shots repo |
| `optimize_shot` | 优化指定分镜 | 是 | 中 | 既有节点优化端点 |
| `optimize_character` | 优化指定角色 | 是 | 中 | 既有节点优化端点 |
| `match_voice` | 匹配配音 | 视实现 | 中 | 既有 voiceMatch |
| `render_video` | 渲染视频 | 是 | 高 | render-service |
| `run_self_check` | 质检 | 否/写 findings | 低-中 | critic service |
| `ask_user` | 追问 | 否 | 低 | 前端展示 |

执行策略:

- `read_only` 和 `run_self_check` 可自动执行或由用户一句话触发。
- 写入型/高成本 action 必须二次确认。
- 一次用户确认可以确认整个计划，也可以只确认某一步。
- 所有 action 执行写 `agent_steps`，失败后返回可恢复建议。

### 4. 自检分 deterministic checks 和 LLM critic 两层

自检不是只让 LLM "评价一下"，否则会不稳定。首版分两层:

**规则检查 deterministic checks**

- 剧本存在但 `scene_count=0`。
- 分镜数量为 0。
- 有 shot 缺 `image_url`。
- 有 shot 缺 `dialog` 且项目/风格需要对白。
- 有 shot `duration_ms` 过短/过长。
- 总时长和用户目标时长偏差过大。
- 有角色资产缺描述或缺参考图。
- 最近 AI/render 任务失败。

**LLM critic**

在规则检查基础上，对局部内容做创作质量判断:

- 剧本冲突、角色动机不清、节奏断裂。
- 分镜是否覆盖剧本重点。
- 分镜之间是否有画面跳跃。
- 角色形象是否一致。
- 台词是否空泛或不符合角色。

输出写入 `agent_findings`:

```json
{
  "target_type": "shot",
  "target_id": "uuid",
  "severity": "warning",
  "category": "continuity",
  "title": "镜头缺少承接动作",
  "detail": "第 3 镜直接从室内跳到城楼,缺少转场说明。",
  "suggested_action": {"type": "optimize_shot", "target_ids": ["uuid"]},
  "status": "open"
}
```

前端展示:

- 聊天中展示"质检摘要"。
- 画布节点显示问题徽标：blocker/warning/suggestion。
- 点击问题可打开对应节点优化面板或确认修正 action。

### 5. 记忆分项目记忆和用户偏好记忆

首版不做向量检索，先做结构化记忆。

**项目记忆 `scope=project`**

- 已确认的风格：如"冷调古风、电影感、角色写实"。
- 世界观/设定：如"故事发生在边境城楼"。
- 角色设定：如"沈辞是冷峻青年将军"。
- 决策记录：选过哪个剧本方向、拒绝过哪个方向。
- 生产约束：目标时长、画幅、分辨率、是否无旁白。

**用户记忆 `scope=user`**

- 偏好：喜欢快节奏、少解释、偏电影感。
- 常用模型/风格倾向。
- 不喜欢的内容：不想要营销感、不要太幼稚对白。

数据表建议:

```sql
CREATE TABLE agent_memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id),
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
  scope       varchar(20) NOT NULL, -- project | user
  kind        varchar(40) NOT NULL, -- preference | decision | character | style | constraint
  content     text NOT NULL,
  confidence  numeric(4,3) NOT NULL DEFAULT 1.0,
  source_run_id uuid,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
```

约束:

- 用户偏好记忆必须可删除，不能静默永久保存敏感原文。
- 项目记忆只在对应项目上下文使用。
- 记忆写入由 LLM 提议，但服务端要过滤空泛内容；例如"用户想做视频"不存。
- `confidence < 0.7` 的记忆仅作为弱提示，不驱动自动行动。

### 6. 新增 Agent run/step 审计

为了让智能行为可追踪，需要区别 `ai_tasks` 和 `agent_runs`:

- `ai_tasks` 记录单次模型/生成任务。
- `agent_runs` 记录一次智能回合：输入、快照摘要、计划、结果。
- `agent_steps` 记录计划里每一步是否执行、执行了哪个业务 API、结果/错误。

建议表:

```sql
CREATE TABLE agent_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id),
  project_id       uuid REFERENCES projects(id) ON DELETE CASCADE,
  stage            varchar(30),
  focus_node_id    varchar(120),
  input_message    text,
  snapshot_hash    varchar(64),
  snapshot_summary jsonb NOT NULL DEFAULT '{}',
  plan             jsonb NOT NULL DEFAULT '{}',
  status           varchar(20) NOT NULL DEFAULT 'running',
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  done_at          timestamptz
);

CREATE TABLE agent_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  run_id        uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  step_key      varchar(40) NOT NULL,
  action_type   varchar(60) NOT NULL,
  target_type   varchar(40),
  target_id     uuid,
  status        varchar(20) NOT NULL DEFAULT 'proposed',
  input         jsonb NOT NULL DEFAULT '{}',
  result        jsonb NOT NULL DEFAULT '{}',
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  done_at       timestamptz
);

CREATE TABLE agent_findings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id        uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  target_type   varchar(40) NOT NULL, -- project | script_scene | shot | asset | video
  target_id     varchar(120),
  severity      varchar(20) NOT NULL, -- blocker | warning | suggestion
  category      varchar(40) NOT NULL,
  title         varchar(160) NOT NULL,
  detail        text NOT NULL,
  suggested_action jsonb NOT NULL DEFAULT '{}',
  status        varchar(20) NOT NULL DEFAULT 'open',
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
```

所有表必须启用 `FORCE ROW LEVEL SECURITY`，以 `team_id = current_setting('app.team_id', true)::uuid` 隔离。

### 7. 前端表现:计划、质检、记忆都服务于画布

前端不需要把智能层做成新页面，核心仍在 `/canvas`。

新增 UI 单元:

- **计划卡片**：展示 2-5 步，可确认/跳过/修改。
- **行动确认**：高成本/写入 action 必须明确按钮确认。
- **质检摘要**：显示 blocker/warning/suggestion 数量和前 3 条。
- **节点徽标**：节点右上角显示缺图、问题、待执行 action 状态。
- **记忆提示**：当 Agent 记住关键偏好时，用轻量系统消息提示，如"已记住:本项目保持冷调古风"。

画布节点状态扩展:

```ts
type IntelligenceBadge =
  | { kind: 'gap'; code: string; count?: number }
  | { kind: 'finding'; severity: 'blocker' | 'warning' | 'suggestion'; count: number }
  | { kind: 'plan'; status: 'proposed' | 'running' | 'done' | 'failed' };
```

`buildCanvasGraph()` 可以从 `agent_findings` 和 `plan.steps` 派生 badges，不让节点内部自己请求数据。

### 8. 分阶段落地

建议分四期:

**M1 画布理解**

- 新增 `canvas_snapshot` service。
- 新增 `GET /snapshot` 和 `POST /canvas/turn`，但 action 只返回建议不执行。
- 前端能问"现在缺什么"，并展示 snapshot gaps。

**M2 智能规划**

- 增加 `plan.steps/actions` 契约。
- 前端展示计划卡片和确认按钮。
- 接入现有生成剧本/分镜/配音/渲染 action。

**M3 结果自检**

- 生成后自动运行 self-check。
- 写 `agent_findings`。
- 画布节点展示问题徽标，点击可修正。

**M4 长期记忆**

- 新增 `agent_memories`。
- 对话中读项目/用户记忆。
- 关键决策自动写入，用户可确认/删除。

## Risks / Trade-offs

- [上下文过大导致模型成本高] → 快照截断 + 摘要 + 只在 focus 时取局部完整内容。
- [计划看起来聪明但执行不稳定] → action 白名单 + 服务端参数校验 + 必要确认。
- [Agent 越权触发高成本操作] → 前端和后端双重确认，viewer 禁止写动作。
- [自检产生过多噪音] → severity 分级，默认只突出 blocker/warning；suggestion 收折。
- [记忆误记用户偏好] → 低置信度记忆不自动驱动；关键偏好用系统消息提示并允许删除。
- [ai-gateway 直写多服务表扩大边界] → 读多表构建 snapshot 可接受；写入仍优先调用现有服务 API 或封装 repo，并全部审计。
- [与现有 `/chat` 并存导致路径混乱] → 首版 Canvas 只切到 `/canvas/turn`；旧 `/chat` 保留兼容，后续归并。
