---
doc: dialogue-input-contract
scope: [product, ai, api]
applies-to: ["src/lib/api/ai.ts", "services/ai-gateway/app/routes/ai.py", "services/ai-gateway/app/services/ai.py", "src/pages/Canvas/**"]
audience: [all-agents]
priority: high
last-verified: 2026-06-03
---

# 对话输入契约

## 1. 目的

这份文档定义：

**Canvas 产品里的对话系统，每一轮到底该接收什么输入。**

核心目标不是扩字段，而是解决三个根问题：

1. 对话只看聊天历史，会失忆
2. 对话不知道当前画布事实，会乱问
3. 对话不知道当前用户焦点，会泛化

所以新的输入契约必须同时承载：

- 聊天过程
- 画布事实
- 当前焦点
- 当前动作来源

## 2. 契约原则

### 原则 1：聊天历史不是唯一上下文

如果输入里只有 `messages`，系统一定会失忆。

因为很多产品事实并不在对话里，而在画布对象上。

### 原则 2：画布上下文要结构化，不要全文灌输

不能把整个 canvas raw JSON 每轮都塞给模型。

要只给：

- 当前最重要的事实
- 当前最重要的对象
- 当前最重要的待决策项

### 原则 3：焦点必须独立存在

当前轮最容易出错的不是全局状态，而是：

- 用户到底在看哪个对象
- 当前到底在讨论什么

所以 `focus_memory` 不能只埋在别的字段里，必须独立存在。

### 原则 4：动作来源也要进上下文

同一句用户输入，如果来源不同，系统应该有不同理解。

例如：

- 用户直接发文本
- 用户点了一个分镜卡再发文本
- 用户框选两个候选再发文本

这三种不是同一语义。

## 3. 总体输入结构

建议每轮 `/v1/ai/chat` 输入升级为：

```json
{
  "project_id": "string",
  "stage": "idea|script|visual|voice|video",
  "messages": [],
  "conversation_memory": {},
  "canvas_context_summary": {},
  "focus_memory": {},
  "turn_context": {}
}
```

## 4. 字段定义

## 4.1 `project_id`

用途：

- 标识当前项目
- 便于服务端查补充信息

要求：

- 必填

## 4.2 `stage`

用途：

- 告诉系统当前作品成熟度处在哪一阶段

建议值：

- `idea`
- `script`
- `visual`
- `voice`
- `video`

注意：

- `stage` 是全局成熟度，不等于当前焦点对象类型
- 当前焦点仍要看 `focus_memory`

## 4.3 `messages`

用途：

- 保留自然对话历史

格式建议：

```json
[
  { "role": "user", "content": "我想把开头做得更抓人" },
  { "role": "assistant", "content": "现在主要问题在分镜板03的开场节奏，我给你两个方向。" }
]
```

要求：

- 保留最近若干轮真实消息
- 不要把系统内隐状态塞进 messages 假装成自然语言

## 4.4 `conversation_memory`

用途：

- 存放从多轮对话中抽取出的稳定设定

它更像“已说清楚的口头世界观”。

示例：

```json
{
  "idea": {
    "theme": "未来科技",
    "tone": "冷感、高级、克制",
    "audience": "年轻创作者"
  },
  "writing_preferences": {
    "dislikes": ["说教感太强", "太像广告"],
    "likes": ["强开场", "视觉反差"]
  }
}
```

要求：

- 只存稳定偏好和长期设定
- 不存瞬时焦点
- 不重复画布已经客观成立的对象事实

## 4.5 `canvas_context_summary`

用途：

- 存放当前画布事实

这部分应来自 [docs/2026-06-03-canvas-context-summary.md](/Users/aox/manju/docs/2026-06-03-canvas-context-summary.md)。

示例结构：

```json
{
  "project_stage": "visual",
  "focus": {
    "type": "storyboard_card",
    "ids": ["shot-03"]
  },
  "locked_objects": [],
  "active_candidates": [],
  "recent_changes": [],
  "pending_decisions": [],
  "risk_flags": []
}
```

要求：

- 每轮都带
- 只保留高价值摘要
- 视为“当前事实源”

## 4.6 `focus_memory`

用途：

- 告诉系统：这轮究竟在盯什么

示例：

```json
{
  "selection_mode": "single",
  "object": {
    "id": "shot-03",
    "kind": "storyboard_card",
    "label": "分镜板03"
  },
  "triggered_by": "user_click"
}
```

可选 `selection_mode`：

- `single`
- `multi`
- `chain`
- `none`

可选 `triggered_by`：

- `user_click`
- `user_multi_select`
- `user_text_input`
- `system_followup`
- `generation_complete`
- `risk_detected`

要求：

- 每轮都带
- 即便没有焦点，也要显式传 `none`

## 4.7 `turn_context`

用途：

- 描述当前这轮交互是怎么开始的
- 帮模型判断该怎么回应

示例：

```json
{
  "intent_source": "canvas_action",
  "canvas_action": {
    "type": "annotate",
    "target_id": "shot-03"
  },
  "expects": "decision_support"
}
```

推荐字段：

- `intent_source`
- `canvas_action`
- `expects`

### `intent_source`

建议值：

- `chat_input`
- `canvas_action`
- `system_event`

### `canvas_action`

只在由画布动作触发时存在。

建议值：

- `select`
- `multi_select`
- `lock`
- `merge`
- `annotate`
- `request_regenerate`
- `request_compare`

### `expects`

告诉系统这一轮主要要完成什么。

建议值：

- `explanation`
- `decision_support`
- `confirmation`
- `generation_instruction`
- `risk_review`

## 5. 服务端生成逻辑的优先级

服务端处理每轮输入时，建议按下面优先级理解上下文：

1. `focus_memory`
2. `turn_context`
3. `canvas_context_summary`
4. `conversation_memory`
5. `messages`

这条顺序非常重要。

因为：

- 当前轮先要接住焦点
- 再要理解动作来源
- 再要尊重画布事实
- 最后才是延续语言风格

如果倒过来，很容易重新掉回“只会续写聊天”的坏状态。

## 6. 三种典型输入场景

## 6.1 纯聊天输入

用户直接在左侧输入：

“我还是觉得开头不够抓人。”

这时：

- `intent_source = chat_input`
- `focus_memory` 仍可能指向当前选中的 `shot-03`

系统应该理解成：

- 这是围绕当前对象的继续讨论
- 不是重新开启一个全局话题

## 6.2 画布点击后无文字输入

用户点了 `storyboard_card: shot-03`

这时即便没有输入文字，也应允许系统发起一轮上下文化对话：

- “这镜现在最大的问题是开场建立得太平。你要我给你两个更抓人的开场方式，还是直接重做这一镜？”

这时：

- `messages` 可以不新增用户文本
- 但 `focus_memory` 和 `turn_context` 必须变化

## 6.3 画布多选后发起比较

用户框选两个 `script_version`

这时系统不该泛化成普通聊天，而该理解为：

- 用户要比较或合并

所以输入里至少要表达：

```json
{
  "focus_memory": {
    "selection_mode": "multi",
    "objects": [
      { "id": "script-a", "kind": "script_version", "label": "方案A" },
      { "id": "script-b", "kind": "script_version", "label": "方案B" }
    ],
    "triggered_by": "user_multi_select"
  },
  "turn_context": {
    "intent_source": "canvas_action",
    "canvas_action": {
      "type": "request_compare"
    },
    "expects": "decision_support"
  }
}
```

## 7. 这份契约如何避免失忆

它主要通过三层机制避免失忆。

## 7.1 用 `canvas_context_summary` 保住作品事实

解决：

- 忘了已锁定风格
- 忘了已有候选
- 忘了已有分镜结果

## 7.2 用 `focus_memory` 保住当前语境

解决：

- 用户看着某个对象，对话却在讲别的
- 用户框选两个候选，对话却只接一个

## 7.3 用 `turn_context` 保住动作语义

解决：

- 用户点击对象和用户打字，被当成同一种输入
- 系统不知道这轮该解释、比较还是确认

## 8. 与现有接口的关系

现有接口里已经有：

- `stage`
- `messages`
- 一些简单 `context`

新的方向不是推翻 `/chat`，而是把 `context` 真正升级成结构化上下文。

也就是说，可以保留：

```json
{
  "project_id": "...",
  "stage": "...",
  "messages": [...],
  "context": { ... }
}
```

但 `context` 里不该再只是：

- `has_script`
- `has_shots`
- `idea`

而应该升级为：

```json
{
  "conversation_memory": { ... },
  "canvas_context_summary": { ... },
  "focus_memory": { ... },
  "turn_context": { ... }
}
```

## 9. 第一版最小可行实现

如果要控制复杂度，第一版不必一次把所有字段都做满。

建议 MVP 先做到：

### 必做

- `messages`
- `stage`
- `canvas_context_summary.locked_objects`
- `canvas_context_summary.active_candidates`
- `canvas_context_summary.pending_decisions`
- `focus_memory`
- `turn_context.intent_source`
- `turn_context.canvas_action`

### 第二阶段补强

- `recent_changes`
- `risk_flags`
- 更完整的 `conversation_memory`
- 更细的 `expects`

## 10. 结论

这份输入契约真正定义的是：

**对话系统到底是“聊天机器人”，还是“在作品工作台里持续协作的决策层”。**

如果输入里只有消息历史，它永远更像前者。

如果输入里同时有：

- 聊天过程
- 画布事实
- 当前焦点
- 动作来源

它才有机会变成后者。
