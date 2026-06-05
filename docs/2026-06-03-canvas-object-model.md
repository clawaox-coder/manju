---
doc: canvas-object-model
scope: [product, interaction, ai, data]
applies-to: ["src/pages/Canvas/**", "services/ai-gateway/app/services/ai.py"]
audience: [all-agents]
priority: high
last-verified: 2026-06-03
---

# Canvas 对象模型

## 1. 目的

这份文档定义一件事：

**Canvas 上到底有哪些“对象”，以及这些对象在系统里分别承担什么职责。**

没有这层对象模型，后面会同时出问题：

- UI 不知道该画什么
- 对话不知道该记什么
- AI 不知道该作用于什么
- 联动系统不知道该更新什么

## 2. 设计原则

### 原则 1：对象不是视觉块，而是产品语义单元

对象不是“一个卡片长什么样”，而是：

- 它代表什么创作语义
- 它能不能被讨论
- 它能不能被锁定
- 它能不能触发生成
- 它会影响哪些下游对象

### 原则 2：只有有责任的东西，才算对象

一个对象至少要满足以下之一：

- 可以被用户选择
- 可以被 AI 引用
- 可以进入记忆摘要
- 可以触发生成
- 可以影响其他对象状态

纯装饰容器、纯排版元素，不进入对象模型。

### 原则 3：对象要支持“候选态”和“事实态”

这类产品最大的特点是：

- 很多对象一开始只是候选
- 之后会被确认、锁定、继承、失效

所以对象模型必须天然支持状态流转。

## 3. 一级对象分类

建议把 Canvas 对象分成 5 大类。

## 3.1 决策对象

用于让用户比较、选择、确认方向。

典型对象：

- 创意方向卡
- 风格方向卡
- 剧本版本卡
- 声音策略卡
- 出片方案卡

特点：

- 经常成组出现
- 会有候选关系
- 会有锁定行为
- 强依赖对话解释

## 3.2 生产对象

用于承载真正要被制作、生成、修改的内容。

典型对象：

- 角色卡
- 场景卡
- 分镜板
- 台词块
- 输出版本卡

特点：

- 是生成动作的主要挂靠点
- 有明确上下游依赖
- 是对象级编辑的主载体

## 3.3 约束对象

用于定义整个作品的共性规则，不一定直接被生成，但会影响很多生成。

典型对象：

- 风格基因卡
- 角色设定卡
- 世界观/场景设定卡
- 节奏规则卡
- 声音规则卡

特点：

- 会被多个生产对象继承
- 一旦修改，容易触发大范围失效或重算

## 3.4 治理对象

用于表达系统当前的风险、待确认、批注和诊断。

典型对象：

- 风险卡
- 待确认卡
- 用户批注卡
- 回看建议卡
- 失效提醒卡

特点：

- 不一定直接生成内容
- 但强烈影响对话和下一步动作

## 3.5 结构对象

用于组织其他对象之间的关系。

典型对象：

- 分组容器
- 分支容器
- 版本链路
- 依赖链

特点：

- 不一定直接进对话
- 但决定联动与可视化结构

## 4. 建议的核心对象清单

下面这批对象建议作为第一版必须支持的核心对象。

## 4.1 `idea_direction`

含义：

- 一个创意方向

示例：

- “未来冷感”
- “热烈霓虹”
- “细腻现实”

主要职责：

- 用于创意期的比较、混搭、锁定

应支持：

- 候选
- 锁定
- 合并
- 被批注

进入 Summary：

- 是

## 4.2 `style_direction`

含义：

- 一套视觉/气质方向

主要职责：

- 为角色、场景、分镜提供上游风格约束

应支持：

- 候选
- 锁定
- 继承关系
- 失效传播

进入 Summary：

- 是

## 4.3 `script_version`

含义：

- 一个剧本版本

主要职责：

- 承接创意方向
- 成为分镜生成的上游事实

应支持：

- 候选版本并存
- 锁定版本
- 局部重写
- 版本比较

进入 Summary：

- 是

## 4.4 `character_profile`

含义：

- 一个角色对象

主要职责：

- 统一角色视觉、设定、声音的锚点

应支持：

- 参考图绑定
- 风格继承
- 声音绑定
- 上下游引用查询

进入 Summary：

- 是

## 4.5 `scene_profile`

含义：

- 一个场景/环境对象

主要职责：

- 统一环境视觉和空间设定

应支持：

- 参考图绑定
- 光感/时间/天气变化
- 与分镜板的关联

进入 Summary：

- 是

## 4.6 `storyboard_card`

含义：

- 单个分镜对象

主要职责：

- 承载镜头级内容
- 成为局部修改最频繁的对象

应支持：

- 生成
- 重做
- 标记问题
- 与角色/场景/台词关联

进入 Summary：

- 是，且优先级高

## 4.7 `voice_strategy`

含义：

- 一套声音/表演方向

主要职责：

- 为角色配音和旁白提供总体约束

应支持：

- 候选比较
- 锁定
- 局部覆盖

进入 Summary：

- 是

## 4.8 `output_version`

含义：

- 一个成片输出版本

主要职责：

- 承接最终渲染
- 让用户比较不同版本和回滚

应支持：

- 版本回看
- 回滚
- 标记问题
- 从历史版本开分支

进入 Summary：

- 是

## 4.9 `annotation`

含义：

- 用户或系统对某个对象的局部批注

主要职责：

- 把“这里有问题”对象化

应支持：

- 绑定目标对象
- 标记优先级
- 进入待处理列表

进入 Summary：

- 是，但只收高价值批注

## 4.10 `risk_flag`

含义：

- 系统识别出的风险点

主要职责：

- 把潜在问题显式化

示例：

- 风格不一致
- 上游设定过期
- 已锁定角色与当前分镜冲突

进入 Summary：

- 是

## 4.11 `decision_gate`

含义：

- 一个待确认事项

主要职责：

- 把“现在该拍板什么”显式化

示例：

- 是否锁定风格方向
- 是否按这版出分镜
- 是否对分镜板 03 重做

进入 Summary：

- 是

## 5. 每类对象的最小通用字段

建议所有对象至少都有这些字段：

```json
{
  "id": "string",
  "kind": "string",
  "label": "string",
  "status": "string",
  "stage": "string",
  "linked_to": [],
  "created_by": "user|ai|system",
  "updated_at": "iso-datetime"
}
```

字段解释：

- `id`: 全局唯一标识
- `kind`: 对象类型
- `label`: 用户可理解名称
- `status`: 当前状态
- `stage`: 所属创作阶段
- `linked_to`: 上下游关联对象
- `created_by`: 由谁产生
- `updated_at`: 最近更新时间

## 6. 对象状态模型

建议统一对象状态，不要每类对象各搞一套。

第一版建议支持这些状态：

- `draft`
- `candidate`
- `selected`
- `locked`
- `generating`
- `ready`
- `stale`
- `warning`
- `archived`

### 状态含义

`draft`
还在形成中，尚未进入比较或执行

`candidate`
活跃候选，可与其他对象比较

`selected`
当前被用户或系统选中，但未最终锁定

`locked`
已经确认，应视为事实

`generating`
有对象级生成任务正在执行

`ready`
对象内容已准备好，可继续下游操作

`stale`
因上游变化而失效，需重新确认或生成

`warning`
存在风险，但未必失效

`archived`
不再参与当前主线，但保留历史

## 7. 哪些对象进入对话记忆

不是所有对象都要进 `Canvas Context Summary`。

建议按优先级进入。

## 7.1 必进

- 当前焦点对象
- 所有 locked 对象
- 所有 active candidate 决策对象
- 所有 pending decision_gate
- 所有高优先级 risk_flag
- 最近发生变化的关键生产对象

## 7.2 选进

- 当前阶段下的关键 character / scene / storyboard
- 当前正在生成的对象
- 最近被用户批注的对象

## 7.3 不进

- 纯容器对象
- 纯布局对象
- 已归档且与当前主线无关的对象
- 无语义的装饰元素

## 8. 哪些对象能触发对话

建议以下对象允许成为对话焦点：

- `idea_direction`
- `style_direction`
- `script_version`
- `character_profile`
- `scene_profile`
- `storyboard_card`
- `voice_strategy`
- `output_version`
- `annotation`
- `risk_flag`
- `decision_gate`

这些对象被点击、框选、合并、批注时，都应该更新 `Focus Memory`。

## 9. 哪些对象能触发生成

第一版建议只允许这些对象直接挂载生成动作：

- `script_version`
- `character_profile`
- `scene_profile`
- `storyboard_card`
- `voice_strategy`
- `output_version`

### 注意

`idea_direction` 和 `style_direction` 更适合作为上游约束，不直接成为最终生成对象。

`decision_gate`、`risk_flag`、`annotation` 只负责推动判断，不直接生成。

## 10. 哪些对象会触发联动

这是 agent 价值最集中的部分。

### 高联动对象

- `style_direction`
- `character_profile`
- `scene_profile`
- `script_version`
- `voice_strategy`

这些对象一改，很可能要：

- 让下游对象进入 `stale`
- 产生新的 `risk_flag`
- 生成新的 `decision_gate`
- 通知对话系统更新当前建议

### 低联动对象

- `annotation`
- `output_version`

这些对象更多是结果或治理信号，不一定反向影响大范围主链。

## 11. 推荐的画布结构关系

第一版不要用纯流程图思维。

更推荐的结构是：

### 上游约束带

- `idea_direction`
- `style_direction`
- `voice_strategy`

### 中央生产带

- `script_version`
- `character_profile`
- `scene_profile`
- `storyboard_card`

### 下游结果带

- `output_version`

### 侧边治理层

- `annotation`
- `risk_flag`
- `decision_gate`

这样画布天然就能同时承载：

- 候选
- 主线
- 风险
- 待确认

## 12. 第一版实现建议

如果要控制复杂度，建议第一版只做下面这些对象：

### 必做

- `idea_direction`
- `style_direction`
- `script_version`
- `storyboard_card`
- `voice_strategy`
- `output_version`
- `annotation`
- `decision_gate`
- `risk_flag`

### 第二阶段再加

- `character_profile`
- `scene_profile`
- 更复杂的结构对象

原因：

- 第一版先把主链路跑通
- 第二版再增强对象密度与联动深度

## 13. 结论

这份对象模型真正定义的是系统的“世界观”。

如果对象定义错了，后面所有事情都会错：

- 对话会失忆
- 画布会空心
- agent 会像演的
- 生成会变成全局黑箱动作

如果对象定义对了，后面三件事才有可能成立：

1. 画布成为事实来源
2. 对话成为对象化决策层
3. AI 成为围绕对象工作的协作系统
