# 2026-06-04 Canvas Page Redesign Aligned To LibTV

## Goal

在保留我们现有 `Canvas Context Summary / decision-risk / object workbench` 能力的前提下，把前台页面改成更接近 `LibTV` 的舒服感：

- 更强的 `canvas-first`
- 更低的界面噪音
- 更少的永久侧栏
- 更自然的 `对象原地编辑`
- 更轻的系统感，更强的作品感

这不是“照抄 LibTV”，而是借它的前台交互壳层，承载我们更强的对象语义和 agent 协作能力。

## Why LibTV Feels Better

实际操作后，LibTV 的舒服感主要来自 5 件事：

1. 默认态非常干净  
   进入页面时，主舞台几乎只有画布、少量节点、轻量工具条，没有永久占满空间的左右大栏。

2. 编辑直接长在对象上  
   双击剧本节点后，对象直接在画布中放大成编辑器，格式工具也贴近对象出现，不需要跳去另一套右栏工作流。

3. 工具按需出现  
   添加节点、文本格式、缩放、连接等能力都以浮层或轻工具条形式出现，不会长期压迫画布。

4. 作品对象比系统说明更醒目  
   用户看到的是“剧本卡片、视频卡片、加号、连接、编辑框”，而不是大量解释文案和流程说明。

5. 交互模式单一  
   当前时刻通常只有一个主要任务：看画布、选对象、改对象。注意力不会在聊天、检查台、图关系之间被同时拉扯。

## LibTV Page Module Map

### 1. Top Left

- 品牌入口
- 项目名称
- 项目命名入口

特点：

- 极小
- 不抢主舞台
- 只承担身份和项目归属

### 2. Top Right

- 分享
- 会员/额度
- 账号入口

特点：

- 全是全局动作
- 和创作任务无关的东西全部收在角落

### 3. Main Canvas Stage

- 画布本身是唯一主舞台
- 节点之间的关系直接可见
- 当前选中的对象用边框高亮

特点：

- 大留白
- 低信息密度
- 用户一眼知道“作品结构”

### 4. Bottom Center Dock

- 添加节点
- 连接/关系
- 其他创作工具
- 历史/脚本等辅助入口

特点：

- 是一个轻量创作 dock，不是系统导航栏
- 所有动作都围绕“往画布上加东西”展开

### 5. Bottom Left Utility Cluster

- 缩放百分比
- 少量环境或视图工具

特点：

- 弱存在
- 不干扰主流程

### 6. Object Inline Editing State

- 选中对象后对象本身扩大
- 编辑器出现在对象上
- 格式工具浮在对象附近

特点：

- “编辑发生在作品上”
- 用户不会感觉自己跳出当前上下文

### 7. Edge Add Point

- 对象边上的 `+`
- 鼓励顺着结构继续生成下一个对象

特点：

- 这是最自然的主线推进方式之一
- 比“去面板里找下一步按钮”更顺

## Current Canvas Problems

我们的当前页面已经有更强的对象模型，但前台壳层还不够顺，主要问题有：

1. 左侧聊天永久常驻，抢走太多宽度和注意力
2. 右侧检查台永久常驻，再次压缩画布
3. 用户同时面对三套主模块：聊天、画布、右栏
4. 很多解释文本过长，导致作品对象不够突出
5. 对象编辑虽然已进入 workbench，但仍主要发生在右栏，不够“原地”
6. 工具条位置和层级更像编辑器控制台，不像创作工作台

## Redesign Principle

新的页面不应再是：

`左栏对话 + 中间画布 + 右栏检查台`

而应改成：

`默认全画布 + 轻工具 chrome + 选中对象后局部展开 + agent 按需浮出`

## Proposed New Page Structure

### State A: Default Canvas Mode

默认态应该接近 LibTV。

页面结构：

- Top left: 品牌 + 项目名
- Top right: 分享 + 配额 + 账号
- Center: 全画布
- Bottom center: 创作 dock
- Bottom left: 缩放 / 视图状态

此时：

- 不显示永久左聊天栏
- 不显示永久右检查栏
- 只显示画布对象
- agent 入口只是一个轻按钮或小胶囊

### State B: Object Focus Mode

当用户点中一个 `script / storyboard / character / decision / risk` 对象时：

- 对象高亮
- 对象附近出现轻操作条
- 右侧不立即弹出完整大栏
- 优先显示对象级 `inline summary card`

内容包括：

- 对象标题
- 当前状态
- 1 行摘要
- 2-3 个建议动作

这层应该更像 `对象气泡`，不是完整侧栏。

### State C: Object Edit Mode

当用户双击对象或点击“展开编辑”时：

- 对象直接在画布内放大
- 进入 `canvas modal editor`
- 顶部出现贴近对象的轻工具条

对应：

- 剧本对象：原地放大成文本编辑器
- 分镜对象：原地展开成镜头编辑器
- 角色对象：原地展开成设定和参考编辑器

这里是我们最应该对齐 LibTV 的地方。

### State D: Assistant Mode

agent 不应该默认占据一整列。

建议改成三种触发方式：

1. 画布左下角小入口
2. 选中对象后的 `Ask AI` 动作
3. decision/risk 对象上的 `解释 / 拍板 / 评估` 动作

打开后形态建议是：

- `drawer` 或 `bottom sheet`
- 宽度更小
- 默认只围绕当前对象说话

也就是说，对话应该从“永久主栏”降级为“按需协作层”。

### State E: Deep Inspector Mode

右侧完整检查台仍然保留，但不应永久展开。

只在以下情况打开：

- 用户主动点 `详情`
- 用户进入深编辑
- 需要查看完整结构化信息

这个模式更适合高级操作，不适合默认态。

## Module-by-Module Redesign

### 1. WorkspaceRail

当前问题：

- 更像产品导航
- 在 Canvas 页面里存在感偏强

改法：

- 收缩成顶部左上的品牌区
- 首页、资产库、新对话不再永久垂直铺开
- 资产库入口进入 bottom dock 或 add menu

### 2. ChatPanel

当前问题：

- 太宽
- 太像主流程控制台

改法：

- 默认隐藏
- 改成 `Assistant Drawer`
- 保留我们已有的 `focus memory`
- 但只在需要讨论时浮出

### 3. CanvasInspectorRail

当前问题：

- 信息正确，但默认常驻太重

改法：

- 默认关闭
- 拆成两层：
  - `Inline Object Bubble`
  - `Deep Inspector Drawer`

### 4. CanvasObjectWorkbench

当前方向是对的，但展示方式要改。

改法：

- 保留内部对象语义和编辑器
- 外层从右栏承载改成“原地放大编辑优先”
- 右栏只作为次级容器

### 5. CanvasToolbar

当前问题：

- 右侧竖条更像通用画布编辑器
- 和作品推进弱相关

改法：

- 主工具改为底部 center dock
- 右侧只保留极少的视图级按钮，甚至可以去掉
- 加节点、连接、上传、视图切换都收进底部 dock

### 6. Decision / Risk Nodes

这部分是我们的优势，不该删，只该换壳。

改法：

- 保留在画布上
- 卡片再更轻一点
- 文案更短
- 允许在卡片上直接出现主 CTA

例如：

- `刷新分镜`
- `进入配音`
- `让我解释`

而不是必须先看右栏。

## Proposed Visual Hierarchy

新的优先级应该是：

1. 作品对象
2. 当前焦点对象
3. 下一步动作
4. 协作说明
5. 系统导航

我们现在的问题是 4 和 5 太重，1 和 2 不够突出。

## Suggested V2 Shell

### Default Layout

- Top left: Brand + Project
- Top right: Share + Credits + Profile
- Center: Canvas Stage
- Bottom center: Creation Dock
- Bottom left: Zoom / View

### Optional Surfaces

- Assistant Drawer
- Deep Inspector Drawer
- Asset Picker Popover
- Inline Editor
- Inline Object Bubble

## Immediate Design Moves

如果直接往下改页面，优先级建议如下：

1. 把左侧聊天栏改成默认收起的 assistant drawer
2. 把右侧检查台改成默认关闭的 inspector drawer
3. 把底部工具统一成 LibTV 风格的 center dock
4. 给 script / storyboard 做原地放大编辑
5. 把 decision / risk 节点 CTA 直接前置到节点卡片
6. 把节点正文减量，强化标题、状态、1 行摘要

## What To Keep From Our Current Work

不应该丢掉的能力：

- `Canvas Context Summary`
- `focus_memory`
- `decision / risk` object model
- derived state
- object workbench editors
- structured `/chat` context

真正该改的是这些能力的前台承载方式。

## Final Recommendation

最终方向应该是：

`LibTV-like shell + our stronger object memory and coordination model`

一句话版本：

`前台像 LibTV 一样轻，后台像我们现在这套一样聪明。`
