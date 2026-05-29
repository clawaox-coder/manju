---
doc: canvas-interaction-agent-design
scope: [frontend, ai]
applies-to: ["src/pages/Canvas/**"]
audience: [all-agents]
priority: high
depends-on: [prd, architecture]
provides: [canvas-interaction-model, agent-behavior, chat-ui-spec]
purpose: Canvas 画布交互与 Agent 对话引导系统的完整设计规约
last-verified: 2026-05-29
---

# Canvas 交互与 Agent 设计规约

## 1. 设计目标

将 Canvas 打造为一站式快速创作通道：用户通过对话引导，从想法到初稿全程在画布+聊天中完成。AI Agent 驱动内容生成，用户只需表达意图、选择方案、确认结果。

### 核心原则

- **AI 驱动，用户引导**：画布内容由 Agent 自动生成和编排，用户不手动创建/排列节点
- **对话引导型**：用户在聊天里一步步和 AI 对话，AI 每步生成/更新画布内容
- **多选对比**：每步生成 2-3 个备选方案，用户挑选最喜欢的
- **思考过程可见**：Agent 的推理过程流式展示给用户

### 定位

- Canvas 是"从零到初稿"的快速路径（一站式工作台）
- 独立详细页面（/script, /storyboard 等）保留用于精细打磨
- 两者数据互通，Canvas 能感知在其他页面的修改

## 2. 交互模型

### 2.1 核心交互循环

```
用户打开 Canvas → Agent 问候 + 引导第一步
    ↓
Agent 提问/提供选项 (聊天内 2-3 选项卡片)
    ↓
用户点选 / 输入 → Agent 生成内容 → 画布自动新增节点
    ↓
Agent 推进到下一步 (或用户点击画布节点 → 对话切换到该节点上下文)
    ↓
循环直到 storyboard 完成 → voice/video 一键触发
```

### 2.2 A+B 混合模式

**A 模式（默认）**：线性向导，Agent 按阶段引导推进
**B 模式（随时可触发）**：用户点击画布节点，对话切换到该节点上下文

B 模式触发条件：
- 用户点击画布上任何已有节点
- Chat 顶部显示上下文指示器：`📍 正在编辑: 场景 3 - 分镜`
- Agent 自动切换话题提供编辑选项
- 用户完成后点击"返回主线"或 Agent 检测到对话结束自动回到主流程

### 2.3 对话阶段设计

| 阶段 | Agent 行为 | 画布变化 | 用户操作 |
|------|-----------|---------|---------|
| **idea** | 问类型、风格、时长、目标受众 | 无节点，画布空白或显示灵感卡片 | 点选选项或自由输入 |
| **script** | 基于 idea 生成 2-3 个剧本大纲 | 出现 2-3 个 ScriptNode（并排，待选状态） | 选一个 → 未选的淡出，选中的固定 |
| **storyboard** | 逐场景生成 2-3 种分镜风格 | 选中的分镜节点从 AI 节点右侧长出 | 逐个确认或批量确认 |
| **voice** | 推荐配音方案 + "一键匹配"按钮 | 配音标签挂载到分镜节点下方 | 一键触发 |
| **video** | 显示渲染预估 + "开始渲染"按钮 | 视频输出节点出现 | 一键触发 |

## 3. 聊天 UI 组件

### 3.1 消息类型系统

| 消息类型 | 用途 | 视觉形态 |
|---------|------|---------|
| `text` | 普通对话 | 气泡 |
| `thinking` | AI 思考过程 | 虚线边框 + 小字号 + 低对比度，可折叠 |
| `options` | 单选快捷回复 | 横排胶囊按钮 |
| `card-group` | 2-3 个方案对比 | 横向滑动卡片组，带缩略图 + 标题 + 描述 + 选择按钮 |
| `preview` | 生成结果预览 | 大图/富文本卡片，带 ✓确认 / ↻重来 / ✎微调 |
| `progress` | AI 生成中 | 进度条 + 阶段文字 |
| `action` | 一键触发（voice/video） | 渐变按钮卡片，带预估信息 |
| `context-switch` | 用户点击画布节点 | 系统消息样式 |

### 3.2 思考过程可见

Agent 生成内容时，先流式展示思考过程，再展示最终结果：

- 流式展示：思考文字逐字/逐行流入
- 视觉区分：虚线边框 + 较小字号 + 降低对比度
- 可折叠：生成完成后自动折叠为一行摘要（"💭 思考了 3 个方向..."），点击可展开
- 不阻塞：思考过程和最终结果是同一条消息的两部分

SSE stream 格式：
```yaml
event: thinking
data: {"text": "分析你的需求：搞笑 + 职场..."}

event: thinking
data: {"text": "→ 适合快节奏对话驱动"}

event: result
data: {"type": "card-group", "options": [...]}
```

### 3.3 卡片组交互

- 卡片入场：依次从右侧滑入（stagger 100ms），带弹性缓动
- 选中效果：选中卡片放大 + 边框高亮，未选卡片缩小 + 半透明 + 向两侧滑出
- 选中后：卡片折叠为一行摘要（"✓ 已选择: 搞笑风格"），释放聊天空间
- 分镜阶段：卡片带生成的图片缩略图，点击可放大预览

### 3.4 进度反馈

- 带阶段的进度指示："🎨 正在绘制第 3/8 个镜头..."
- 画布上对应节点同步显示 skeleton 占位 + 脉冲动画
- 完成时聊天内弹出结果卡片 + 画布节点同时从 skeleton 变为实际内容

### 3.5 一键触发区（voice/video）

分镜完成后，Agent 展示渐变按钮卡片：
- 🎙 一键配音：显示镜头数 + 预估时间
- 🎬 生成视频：显示预计时长 + 分辨率

## 4. 画布行为与节点生命周期

### 4.1 自动布局策略

用户不手动排列节点，画布根据对话进度自动布局：

| 阶段 | 画布状态 |
|------|---------|
| idea | 空白，中心显示项目名 + 柔和粒子背景 + 引导文字 |
| script | 左侧纵向排列 ScriptNode，中心出现 AI 节点 |
| storyboard | 右侧纵向排列 StoryboardNode，角色节点浮在上方 |
| voice | 分镜节点下方挂载配音标签（非独立节点） |
| video | 最右侧出现 VideoNode，所有分镜汇聚连线 |

### 4.2 节点状态机

| 状态 | 视觉表现 | 触发条件 |
|------|---------|---------|
| `candidate` | 虚线边框 + 半透明 + 微微浮动动画 | AI 生成了多个候选方案 |
| `selected` | 实线边框 + 全不透明 + 轻微放大弹入 | 用户在聊天中选择了该方案 |
| `active` | 高亮边框 + 光晕 | 当前对话上下文聚焦在此节点（B 模式） |
| `settled` | 正常显示，无特殊效果 | 已确认且不在当前焦点 |

### 4.3 候选节点画布表现

生成候选时，画布上并排显示 2-3 个候选节点（虚线半透明）。用户选择后：
- 选中节点滑动到正位（300ms ease-out）
- 未选中节点同时淡出 + 缩小（200ms）

### 4.4 上下文切换时的画布反应（B 模式）

1. 被点击节点放大 5% + 高亮光晕
2. 画布自动 fitView 到该节点周围区域（smooth 过渡 400ms）
3. 其他节点降低 opacity 到 0.4
4. 返回主线时：所有节点恢复正常 opacity，fitView 回到全局视图

### 4.5 历史数据加载

进入 Canvas 的三种场景：

| 场景 | 数据状态 | 画布表现 | Agent 行为 |
|------|---------|---------|-----------|
| 新项目 | 无数据 | 空状态 + 引导 | "你好！想做什么类型的作品？" |
| 进行中 | 有部分数据 | 加载已有节点，定位到当前阶段 | "上次你写好了剧本，要继续生成分镜吗？" |
| 已完成 | 全部数据齐全 | 加载完整图谱 | "项目已完成。需要调整哪个部分？"（直接进入 B 模式） |

加载动画：按管线顺序快速依次出现（stagger 50ms），给用户"进度回顾"感。

恢复消息：Agent 用进度摘要卡片概括当前状态，提供 [继续] [调整] [从头来过] 选项。

对话历史策略：不持久化完整对话，仅存储关键决策点（Decision[]），进入时由 Agent 根据当前数据重新生成恢复消息。

## 5. Agent 行为模型

### 5.1 人格

- 名字：创作助手（不需要独立品牌名，保持产品一体感）
- 语气：轻松专业，像一个有经验的导演搭档
- 不说废话，每条消息有明确目的（提问 / 展示选项 / 确认结果）
- 适度使用 emoji 作为视觉锚点（🎬🎭🎨🎙），不过度

### 5.2 各阶段能力

| 阶段 | Agent 做什么 | 调用的后端能力 | 生成选项数 |
|------|-------------|--------------|-----------|
| **idea** | 引导确定：类型、风格、时长、受众、情绪基调 | 无 API 调用，纯对话 | 每个维度 3 选项 |
| **script** | 生成剧本大纲 → 用户选 → 展开完整剧本 | `POST /v1/ai/script.continue` | 2-3 个大纲方向 |
| **storyboard** | 逐场景生成分镜（构图+描述+图片） | `POST /v1/ai/storyboard.generate` | 每场景 2-3 种风格 |
| **voice** | 推荐配音方案（一键） | `POST /v1/ai/voice.match` | 不提供选项，直接匹配 |
| **video** | 预估渲染参数（一键） | `POST /v1/render` | 不提供选项，直接渲染 |

### 5.3 对话状态机

```
[GREETING] → [ASK_TYPE] → [ASK_STYLE] → [ASK_DURATION] → [GENERATE_SCRIPT]
                                                              │
                                                              ▼
                                                    [SHOW_SCRIPT_OPTIONS]
                                                              │ 用户选择
                                                              ▼
                                                    [EXPAND_SCRIPT]
                                                              │
                                                              ▼
                                                    [GENERATE_STORYBOARD] (逐场景循环)
                                                              │
                                                              ▼
                                                    [STORYBOARD_COMPLETE]
                                                              │
                                                              ▼
                                                    [OFFER_VOICE] ← 一键
                                                              │
                                                              ▼
                                                    [OFFER_RENDER] ← 一键
                                                              │
                                                              ▼
                                                         [DONE]
```

任何时刻用户点击画布节点 → 状态暂存 → 进入 `[CONTEXT_EDIT]` → 完成后恢复

### 5.4 驱动架构

混合驱动：
- **结构化交互**（点选项、确认、阶段推进）：前端状态机驱动，不调 LLM
- **用户自由输入**：调 LLM 做意图分类 + 参数提取，然后路由回状态机

```typescript
interface AgentState {
  stage: 'idea' | 'script' | 'storyboard' | 'voice' | 'video';
  step: string;
  context: {
    type?: string;
    style?: string;
    duration?: string;
    audience?: string;
    tone?: string;
  };
  focusedNodeId?: string;
  history: Decision[];
}
```

### 5.5 用户自由输入处理

用户自由输入需调 LLM 做意图分类：

```yaml
endpoint:    POST /v1/ai/intent.classify
body:
  message:   string          # 用户输入
  stage:     string          # 当前阶段
  step:      string          # 当前步骤
  context:   string          # 最近 3 条对话摘要
response:
  intent:    enum[continue, skip, modify, back, off_topic, clarify]
  params:    object          # 提取的参数
  confidence: float
```

路由策略：
- 匹配当前步骤预期 → 直接采纳，推进
- 跳步请求 → 自动填充跳过的步骤，加速推进
- 修改请求 → 进入 B 模式编辑对应节点
- 无关输入 → 温和拉回

低延迟要求：用 haiku/flash 级别模型，p99 < 500ms

## 6. 技术架构

### 6.1 前端新增模块

```
src/pages/Canvas/
├── index.tsx              (重构)
├── agent/
│   ├── AgentStateMachine.ts   — 状态机核心
│   ├── AgentMessages.ts       — 消息模板 & 选项生成
│   ├── AgentIntentRouter.ts   — 自由输入 → LLM 意图分类 → 状态转移
│   └── types.ts               — AgentState, Decision, Message 类型
├── chat/
│   ├── ChatPanel.tsx          (重构为消息类型系统)
│   ├── MessageCard.tsx        — 卡片组消息渲染
│   ├── MessageThinking.tsx    — 思考过程渲染（流式 + 可折叠）
│   ├── MessagePreview.tsx     — 预览消息渲染
│   ├── MessageProgress.tsx    — 进度消息渲染
│   ├── MessageAction.tsx      — 一键触发消息渲染
│   └── OptionPill.tsx         — 选项胶囊按钮
├── nodes/                     (增加状态)
│   ├── ScriptNode.tsx         + candidate/selected/active/settled
│   ├── StoryboardNode.tsx     + 同上
│   ├── AINode.tsx             (简化)
│   ├── VideoNode.tsx          + 渲染进度
│   └── CharacterNode.tsx      + 关联高亮
├── canvas/
│   ├── useCanvasLayout.ts     — 自动布局算法
│   ├── useCanvasAnimation.ts  — 节点入场/退场/选中动画
│   ├── useContextFocus.ts     — B 模式：节点聚焦
│   └── EmptyState.tsx         — 空状态组件
├── buildGraph.ts              (重构支持 candidate 节点)
├── persistence.ts             (增加 Decision 持久化)
└── useCanvasAi.ts             (拆分到 agent/ 目录)
```

### 6.2 后端 API 调用时序

```
idea 阶段:     无 API（纯前端对话）
script 阶段:   POST /v1/ai/script.continue (n=3, 返回 thinking + options)
               → 用户选择后: PUT /v1/projects/:id/script
storyboard:    POST /v1/ai/storyboard.generate (SSE stream, thinking + 逐场景候选)
               → 用户逐个确认后: shots 自动保存
voice:         POST /v1/ai/voice.match (一键)
video:         POST /v1/render (一键)
```

### 6.3 持久化策略

| 数据 | 存储位置 | 用途 |
|------|---------|------|
| 节点位置 | localStorage | 画布布局恢复 |
| AgentState | localStorage | 对话阶段恢复 |
| Decision[] | localStorage + 后端 project metadata | 关键决策记录 |
| 完整对话记录 | 不持久化 | 每次进入由 Agent 重新生成恢复消息 |
| 剧本/分镜/配音 | 后端各 service | 实际内容（已有） |

## 7. 边界情况

| 场景 | 处理方式 |
|------|---------|
| 用户长时间不操作 | 不催促，保持等待 |
| API 调用失败 | 错误卡片："生成遇到问题，[重试] [换个方向]" |
| 生成超时（>30s） | 进度消息更新："比预期久一点，还在处理中..." |
| 用户在 candidate 状态离开 | 候选节点不持久化，下次重新走对话 |
| 用户在其他页面修改了内容 | 回到 Canvas 时 Agent 检测数据变化，更新恢复消息 |
| 网络断开 | 聊天区显示离线提示条，恢复后自动重连 |

B 模式下的编辑能力：

| 节点类型 | 可执行操作 |
|---------|-----------|
| ScriptNode | 修改台词、调整情节、拆分/合并场景 |
| StoryboardNode | 换风格、改构图、调整画面描述、重新生成图片 |
| CharacterNode | 修改外貌描述、调整性格标签 |
| VideoNode | 只读预览状态 |

## 8. 实现分期

**Phase 1（MVP，2-3 周）**：
- Agent 状态机 + idea/script 两阶段对话
- `card-group` + `thinking` 消息类型
- 画布自动布局
- 节点 candidate → selected 状态切换
- 历史数据加载 + Agent 恢复消息

**Phase 2（+2 周）**：
- storyboard 阶段对话（逐场景生成 + 多选）
- `progress` 消息类型 + 画布 skeleton 同步
- B 模式（点击节点切换上下文）
- 意图分类 API 集成

**Phase 3（+1-2 周）**：
- voice/video 一键触发卡片
- 入场/退场动画打磨
- 候选节点画布动画
- 边界情况完善
