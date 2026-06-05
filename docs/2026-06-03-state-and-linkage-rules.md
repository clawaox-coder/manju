---
doc: state-and-linkage-rules
scope: [product, interaction, ai, data]
applies-to: ["src/pages/Canvas/**", "services/ai-gateway/app/services/ai.py", "services/script-service/**"]
audience: [all-agents]
priority: high
last-verified: 2026-06-03
---

# 状态流转与联动规则

## 1. 目的

这份文档回答两个问题：

1. Canvas 对象什么时候进入 `draft / candidate / locked / stale / warning / ready`
2. 一个对象变化后，系统应该怎样联动其他对象、对话和待确认项

如果这层没定义清楚，后面一定会出现三类问题：

- 用户改了上游对象，下游没有反应
- 对话不知道哪些结果已经过期
- 系统反复让用户确认本来已经稳定的东西

## 2. 基本原则

### 原则 1：状态是作品事实，不是 UI 装饰

状态不是为了给卡片换颜色。

状态应该直接决定：

- 对话怎么说
- 用户还能做什么
- 下游对象还能不能继续使用

### 原则 2：联动优先于重生成

对象变化后，系统第一反应不应该总是立刻重生成。

更合理的顺序是：

1. 先标记受影响对象
2. 再判断是 `warning` 还是 `stale`
3. 再生成 `decision_gate`
4. 只有用户确认后才执行重生成

### 原则 3：锁定的是“当前事实”，不是“永不改变”

`locked` 的意思是：

- 当前已确认
- 下游可以放心引用

不是：

- 永远不能改

一旦上游变化，原来的 `locked` 下游对象仍可能变成 `stale`。

## 3. 状态定义

沿用对象模型里定义的统一状态：

- `draft`
- `candidate`
- `selected`
- `locked`
- `generating`
- `ready`
- `stale`
- `warning`
- `archived`

## 3.1 `draft`

含义：

- 对象刚被创建，还在形成

进入条件：

- 用户新建对象
- AI 初次吐出但尚未进入比较

退出条件：

- 被放入候选组 -> `candidate`
- 被直接采用 -> `selected`
- 被放弃 -> `archived`

## 3.2 `candidate`

含义：

- 活跃候选对象，可以比较

进入条件：

- 同类对象存在多个方案并列

退出条件：

- 当前轮被用户点选 -> `selected`
- 被淘汰 -> `archived`
- 被合并进新方案 -> `archived`

## 3.3 `selected`

含义：

- 当前被选中或倾向采用，但还没最终锁定

进入条件：

- 用户单击候选对象
- 对话建议当前先沿这个对象推进

退出条件：

- 用户最终确认 -> `locked`
- 改选其他对象 -> 回退为 `candidate`

## 3.4 `locked`

含义：

- 当前已被确认，应视为事实

进入条件：

- 用户明确确认
- 系统生成 `decision_gate`，用户通过

退出条件：

- 上游对象发生重大变化 -> 通常不直接退出，但可能让依赖它的下游失效
- 自身被替换 -> `archived`

注意：

- `locked` 本身通常不自动降级
- 更常见的是它的下游对象因引用它而变化

## 3.5 `generating`

含义：

- 正在执行对象级生成任务

进入条件：

- 用户或系统对该对象发起生成

退出条件：

- 生成成功 -> `ready`
- 生成失败 -> `warning`
- 生成中途取消 -> 回到之前状态

## 3.6 `ready`

含义：

- 对象内容已经就绪，可供下游使用

进入条件：

- 生成成功
- 局部编辑完成

退出条件：

- 上游变化导致过期 -> `stale`
- 发现潜在风险但未必过期 -> `warning`

## 3.7 `stale`

含义：

- 对象因上游事实变化而过期

进入条件：

- 引用的上游 `locked` 对象发生重要变化
- 当前对象依赖的候选被替换或合并
- 当前对象的约束对象被重写

退出条件：

- 用户确认继续沿用并接受风险 -> 可回 `warning` 或 `ready`
- 用户请求重生成 -> `generating`
- 用户放弃 -> `archived`

## 3.8 `warning`

含义：

- 对象仍可用，但存在风险或不一致

进入条件：

- 上游变化影响有限
- 系统诊断发现风格、节奏、设定可能不一致
- 生成失败但旧结果仍可暂时保留

退出条件：

- 用户确认接受 -> 可回 `ready`
- 用户要求修复 -> `generating`
- 风险扩大 -> `stale`

## 3.9 `archived`

含义：

- 不再参与当前主线

进入条件：

- 候选被淘汰
- 旧版本被替代
- 用户手动归档

退出条件：

- 一般不恢复
- 若要恢复，视作新分支对象更合理

## 4. 联动层级

对象变化后的联动，建议分三层发生。

## 4.1 第一层：对象状态联动

例如：

- 风格方向改了 -> 相关分镜板进入 `warning` 或 `stale`
- 剧本版本锁了 -> 对应分镜生成入口解锁

## 4.2 第二层：治理对象联动

例如：

- 发现不一致 -> 生成 `risk_flag`
- 需要拍板 -> 生成 `decision_gate`
- 用户批注对象 -> 生成 `annotation`

## 4.3 第三层：对话联动

例如：

- 当前焦点对象变 stale -> 对话下一轮优先解释原因
- 出现新的 decision_gate -> 对话优先引导确认

## 5. 高价值联动规则

下面这些规则建议作为第一版必须实现的主规则。

## 5.1 `style_direction` 变化

影响对象：

- `character_profile`
- `scene_profile`
- `storyboard_card`
- `output_version`

建议规则：

- 如果只改表层措辞或补充说明：下游 -> `warning`
- 如果改视觉基因或主氛围：下游 -> `stale`

同时生成：

- `risk_flag`: 风格一致性风险
- `decision_gate`: 是否按新风格重刷受影响对象

## 5.2 `script_version` 变化

影响对象：

- `storyboard_card`
- `voice_strategy`
- `output_version`

建议规则：

- 局部台词微调：相关分镜 -> `warning`
- 情节结构变化：相关分镜 -> `stale`
- 角色关系变化：相关声音策略 -> `warning` 或 `stale`

同时生成：

- `decision_gate`: 是否重建受影响分镜

## 5.3 `character_profile` 变化

影响对象：

- 相关 `storyboard_card`
- 相关 `voice_strategy`
- `output_version`

建议规则：

- 只换参考图但气质不变：下游 -> `warning`
- 人设气质或视觉核心变化：下游 -> `stale`

同时生成：

- `risk_flag`: 人物一致性风险

## 5.4 `scene_profile` 变化

影响对象：

- 相关 `storyboard_card`
- `output_version`

建议规则：

- 光线、天气微调：下游 -> `warning`
- 场景空间或世界观变化：下游 -> `stale`

## 5.5 `voice_strategy` 变化

影响对象：

- 角色声音绑定
- `output_version`

建议规则：

- 语速、情绪强度微调：下游 -> `warning`
- 旁白策略变化或主角色音色大变：下游 -> `stale`

## 5.6 `storyboard_card` 被批注

影响对象：

- 对应 `annotation`
- 相关 `decision_gate`

建议规则：

- 分镜对象本身不一定立刻 stale
- 但若批注为高优先级，生成：
  - `annotation`
  - `decision_gate`: 是否重做该镜

## 6. `warning` 和 `stale` 的区别

这是第一版最容易做错的地方。

## 6.1 什么时候用 `warning`

适合场景：

- 结果还可用
- 只是存在潜在不一致
- 用户可以选择暂时忽略

一句话：

`warning = 还能继续，但最好看一眼`

## 6.2 什么时候用 `stale`

适合场景：

- 结果的关键前提已经变了
- 再继续使用会明显误导
- 通常需要重新确认或重生成

一句话：

`stale = 当前结果已经不再可信`

## 7. `decision_gate` 生成规则

不是每次对象变化都要打断用户确认。

建议只在这几种情况生成 `decision_gate`：

- 从候选到锁定前
- 高价值对象上游变化后，需要决定是否重生成
- 风险已达不能忽略的程度
- 进入昂贵动作前

典型文案语义：

- 是否锁定这个方向
- 是否按当前版本出分镜
- 是否重做受影响的 4 个分镜板
- 是否接受当前声音策略风险继续出片

## 8. 对话如何响应状态变化

建议对话不要自己瞎判断对象状态，而是消费状态事实。

## 8.1 焦点对象为 `warning`

对话应做：

- 说明风险是什么
- 说明继续使用是否可接受
- 询问要不要修

不该做：

- 直接当作完全失效重来

## 8.2 焦点对象为 `stale`

对话应做：

- 明确说“这版已经过期”
- 解释是谁导致它过期
- 给出重生成或重确认建议

## 8.3 焦点对象为 `locked`

对话应做：

- 默认把它当事实
- 避免重新追问同一决策

## 9. 第一版最小联动实现

如果要控制复杂度，第一版最推荐先实现这 6 条：

1. `style_direction` -> `storyboard_card` 联动
2. `script_version` -> `storyboard_card` 联动
3. `storyboard_card` 批注 -> `annotation` + `decision_gate`
4. `voice_strategy` -> `output_version` 联动
5. `locked_objects` 变化 -> 对话记忆更新
6. `stale/warning` 变化 -> 自动生成高优先级 `risk_flag`

## 10. 结论

状态和联动规则其实定义的是：

**这个产品有没有“作品因果关系”。**

如果对象改了，别的对象完全没反应，那就不是创作系统，只是拼贴板。

如果对象改了，系统能正确地产生：

- 状态变化
- 风险提示
- 待确认项
- 对话更新

那用户才会真的感觉到：

- 画布是活的
- 对话是懂上下文的
- agent 是在围绕作品工作，而不是在装懂
