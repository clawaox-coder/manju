---
doc: canvas-context-summary
scope: [product, interaction, ai]
applies-to: ["src/pages/Canvas/**", "services/ai-gateway/app/services/ai.py"]
audience: [all-agents]
priority: high
last-verified: 2026-06-03
---

# Canvas Context Summary 机制稿

## 1. 目的

这份机制只解决一个问题：

**让对话在每一轮都知道当前画布上已经有什么，从而不失忆。**

不是点击画布时临时补一句话，
而是让画布状态成为对话系统的稳定记忆来源。

## 2. 核心定义

`Canvas Context Summary` 是一份面向对话系统的轻量级画布状态摘要。

它不是完整画布 JSON，也不是所有节点原样透传。

它的作用是把“当前作品事实”整理成一份每轮都可注入的上下文。

## 3. 设计原则

### 原则 1：尊重事实，不复述像素

Summary 记录的是：

- 画布上有哪些关键对象
- 这些对象处于什么状态
- 哪些对象已经确认
- 当前焦点和风险是什么

它不记录：

- 每个对象的完整渲染细节
- 全部历史布局坐标
- 无关紧要的视觉噪音

### 原则 2：优先“现状”，不是优先“历史”

聊天历史里说过的话可能已经过时。

例如：

- 之前讨论过 3 个风格方向
- 但画布上现在只锁定了其中 1 个

对话下一轮应优先尊重画布事实，而不是继续把 3 个都当活选项。

### 原则 3：结构化摘要，不是全文塞给模型

不能把整个画布对象树直接喂给对话。

要先压缩成：

- 当前阶段
- 当前焦点
- 已锁定项
- 活跃候选项
- 最近变更
- 风险与待确认

## 4. Summary 的字段结构

建议至少包含 7 个一级字段。

## 4.1 `project_stage`

当前作品处在哪个成熟阶段。

示例：

```json
{
  "project_stage": "storyboard"
}
```

可选值建议：

- `idea`
- `script`
- `visual`
- `voice`
- `video`

## 4.2 `focus`

用户此刻正在看的对象或对象组。

示例：

```json
{
  "focus": {
    "type": "storyboard_group",
    "ids": ["shot-03", "shot-04"],
    "reason": "user_selected"
  }
}
```

这个字段决定对话当前最该接什么。

如果没有 focus，对话很容易泛化。

## 4.3 `locked_objects`

已经被确认、锁定、当前应视为事实的对象。

示例：

```json
{
  "locked_objects": [
    { "id": "style-a", "kind": "style_direction", "label": "未来冷感", "status": "locked" },
    { "id": "script-v2", "kind": "script_version", "label": "A开场+B结尾", "status": "locked" }
  ]
}
```

这些对象是对话不能假装不知道、也不能随意重问的。

## 4.4 `active_candidates`

当前还活着、还可比较、还没有被淘汰的候选对象。

示例：

```json
{
  "active_candidates": [
    { "id": "mood-a", "kind": "mood_direction", "label": "未来", "status": "candidate" },
    { "id": "mood-b", "kind": "mood_direction", "label": "热烈", "status": "candidate" }
  ]
}
```

这决定对话下一轮应该是：

- 比较
- 追问
- 还是直接确认

## 4.5 `recent_changes`

最近几次重要对象变化，建议只保留 3-5 条。

示例：

```json
{
  "recent_changes": [
    { "type": "lock", "target": "style-a", "at": "2026-06-03T14:10:00Z" },
    { "type": "annotate", "target": "shot-03", "note": "开场不够抓人", "at": "2026-06-03T14:12:00Z" },
    { "type": "merge", "sources": ["script-a", "script-b"], "target": "script-v2", "at": "2026-06-03T14:13:00Z" }
  ]
}
```

这个字段让对话知道“刚刚发生了什么”，避免回合感断裂。

## 4.6 `pending_decisions`

当前还没拍板的事。

示例：

```json
{
  "pending_decisions": [
    { "id": "decision-1", "kind": "style_pick", "label": "决定整体风格方向" },
    { "id": "decision-2", "kind": "shot_fix", "label": "是否重做分镜板03开场" }
  ]
}
```

这个字段决定对话该往哪里推进。

## 4.7 `risk_flags`

当前最重要的风险或失效链路。

示例：

```json
{
  "risk_flags": [
    { "id": "risk-1", "kind": "stale_dependency", "label": "分镜板03仍引用旧角色设定" },
    { "id": "risk-2", "kind": "inconsistency", "label": "声音策略与已锁定风格不一致" }
  ]
}
```

这个字段让对话更像制作系统，而不是陪聊系统。

## 5. Summary 的对象粒度

不是所有节点都值得进入 Summary。

建议只纳入三类对象：

### 第一类：决策对象

例如：

- 风格方向卡
- 剧本版本
- 声音策略卡
- 候选分支

### 第二类：生产对象

例如：

- 角色卡
- 场景卡
- 分镜板
- 输出版本卡

### 第三类：治理对象

例如：

- 待确认项
- 风险项
- 失效链路
- 用户批注

像纯装饰节点、布局容器、临时拖拽痕迹，不需要进入 Summary。

## 6. Summary 什么时候更新

建议不是每次渲染都更新，而是在“语义变化”时更新。

## 6.1 必须更新的时机

- 用户创建对象
- 用户删除对象
- 用户锁定对象
- 用户取消锁定
- 用户合并候选
- 用户标记批注
- 用户切换焦点对象
- 系统生成新结果对象
- 某个对象因上游变化而失效

## 6.2 不必更新的时机

- 纯拖拽位置变化
- 缩放画布
- 视角平移
- 单纯 hover

也就是说，Summary 跟的是作品语义，不是相机运动。

## 7. 每轮对话怎么注入

对话每轮输入建议不再只有：

- messages
- stage

而是至少增加：

- conversation_memory
- canvas_context_summary
- focus_memory

建议输入心智模型：

```json
{
  "messages": [],
  "conversation_memory": {},
  "canvas_context_summary": {},
  "focus_memory": {}
}
```

其中：

- `messages` 是原始对话历史
- `conversation_memory` 是对话层的抽取设定
- `canvas_context_summary` 是画布事实
- `focus_memory` 是当前轮的局部语境

## 8. Focus Memory 怎么单独处理

虽然 focus 也在 Summary 里，但建议单独强化一层。

因为用户最容易在这里感知“AI 有没有失忆”。

Focus Memory 至少要包含：

- 当前选中对象 id
- 当前选中对象 kind
- 当前选中对象 label
- 是单选、框选还是链路选择
- 最近一次由谁触发这个 focus

示例：

```json
{
  "focus_memory": {
    "selection_mode": "single",
    "object": {
      "id": "shot-03",
      "kind": "storyboard_card",
      "label": "分镜板03"
    },
    "triggered_by": "user_click"
  }
}
```

## 9. 对话系统应该怎么消费 Summary

对话在生成下一轮时，优先级建议如下：

1. 先看 `focus`
2. 再看 `pending_decisions`
3. 再看 `risk_flags`
4. 再看 `locked_objects`
5. 最后再参考聊天历史措辞

这意味着系统默认行为应该是：

- 先回应当前对象
- 再回应当前决策
- 最后才考虑风格化表达

## 10. 典型失忆场景与修复方式

## 场景 1：重复问风格

错误：

- 画布已锁定“未来冷感”
- 对话还问“你想要什么风格”

修复：

- 从 `locked_objects` 读取已锁定风格
- 若仍需问，只能问“是否要从已锁定风格上偏移”

## 场景 2：忽略现有候选

错误：

- 画布已有 3 个剧本候选
- 对话又从零提 3 个方向

修复：

- 从 `active_candidates` 读取当前候选
- 优先进入“比较与收敛”模式，而不是“重新发散”模式

## 场景 3：脱离当前焦点

错误：

- 用户正在看分镜板03
- 对话还在泛谈整个项目定位

修复：

- 从 `focus_memory` 读取当前焦点
- 默认先说这个对象，再说全局

## 11. 产品层的关键结论

`Canvas Context Summary` 一旦成立，产品会有三个明显变化：

### 变化 1：对话不再像失忆客服

它会显得一直在看着作品，而不是只在看文字记录。

### 变化 2：画布真正成为系统事实源

不是“点一下才有用”，而是“只要存在于画布上，就会持续影响对话”。

### 变化 3：用户开始信任两边是一个系统

用户会明显感觉到：

- 画布不是摆设
- 对话不是空气
- 两边共享同一个大脑

## 12. 建议下一步

这份机制稿之后，最值得继续落细的是两件事：

1. `Canvas 对象模型`
   先定义哪些对象能进入 Summary

2. `对话输入契约`
   先定义 ai-gateway 每轮接收的 context schema

如果这两件事不定，后面 prompt、UI、状态机都会反复返工。
