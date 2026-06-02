## Context

画布页交互现状(详见 proposal 的三层断裂诊断):

- **对话**:idea 阶段走 `chat()`(`src/lib/api/ai.ts:226`)→ 后端 `chat_respond`(`services/ai-gateway/app/services/ai.py:524`),LLM 自由对话 + 动态 options + `extracted` 设定抽取 + `trigger`。但后端系统提示 `CHAT_SYSTEM` 明确写「你负责 idea 阶段」,`trigger` 规则只文档化了 `generate_script`。后半段(script/storyboard/voice/video)由 `AgentStateMachine` + `getAgentMessage()` 写死台词与按钮驱动,自由输入走 `AgentIntentRouter` → `classifyIntent`。
- **画布**:`buildCanvasGraph()`(`buildGraph.ts`)产出带 type/data/连线的图谱,但 `CanvasSync`(`index.tsx:100`)对每个节点 `editor.createShape({ type: 'note' })`,丢弃全部 `data` 与 edges。`ScriptNode`/`StoryboardNode`/`VideoNode`/`CharacterNode`/`AINode`、`canvas/useCanvasLayout.ts`、`canvas/nodeMotion.ts`、`canvas/useContextFocus.ts` 无任何 import(grep 确认),为 React Flow 风格写就的死代码。
- **候选**:`index.tsx:575` 调 `buildCanvasGraph(..., undefined)`,`candidateNodes` 永不传;`scriptCandidates` state 仅在 `handleNodeClick` 读取,从不渲染成画布卡。

约束:
- 复用既有后端契约形状(`ChatResponse`/`ChatTrigger`),`ChatTrigger.action` 联合已含四种动作,扩展属补全而非破坏。
- tldraw 已选定为画布引擎(`tldraw@5`),本 change 不更换引擎(那是被否决的方案 B)。
- `persistence.ts` 仅持久化节点坐标,渲染方式变更不触碰持久化数据。
- 主题/暗色由并行的 `improve-dark-mode` change 负责,本 change 不动 `colorScheme` 同步逻辑。

## Goals / Non-Goals

**Goals:**
- 全程对话语气与操作模式统一:从 idea 到 video 都是「自然对话 + 动态建议 + 在合适时机触发制作动作」,中途不再切换成向导式按钮流。
- 剧本候选在对话内可见、可点选,不再让 AI 指向空画布。
- 画布成为名副其实的「过程镜子」:节点显示自身语义(标题/对白/缩略图/状态)并画出连线;对话推进 → 画布更新/高亮;点节点 → 对话聚焦。
- 不留死代码:未复用的自定义节点组件与布局/动画,接入或删除,二选一。

**Non-Goals:**
- 不把画布变成可拖拽连线的主操作台(那是方案 B)。画布保持只读 + 点选聚焦。
- 不更换画布引擎(不引入 React Flow)。
- 不改主题/暗色逻辑(归 `improve-dark-mode`)。
- 不新增上传后端;回形针按钮只做「接上现有上传能力或先撤下」的取舍,不做新功能。
- 不改 voice/video 的底层制作 API(`voiceMatch`/`createRender` 等),仅改其触发方式由按钮 → 对话 trigger。

## Decisions

**1. 对话统一为单一 `chat()` 入口,状态机退为「阶段追踪器」。**
全程由 `chat()` 驱动:前端每轮把 history + stage + 项目派生状态(has_script/has_shots/has_voice/has_video)传给后端,后端 LLM 自然回应、给动态 options、在合适时机输出 `trigger`。状态机不再生产任何 user-facing 文案,只维护「当前在哪个 stage、由项目数据派生的 step」,供前端决定画布高亮与触发何种制作动作。`getAgentMessage()` 写死的台词、`AgentIntentRouter`/`classifyIntent` 的分支路由随之退役或并入。
替代方案「保留状态机文案,仅美化按钮」:治标不治本,语气断档仍在,且死代码与候选断裂不解决。否决。

**2. 后端 `chat_respond` 系统提示从「只负责 idea」扩展到全管线。**
`CHAT_SYSTEM` 当前写死「你负责 idea 阶段」,`trigger` 只文档化 `generate_script`。改为:按 `stage` 给出阶段感知的对话指引,并允许按用户意图输出四种 trigger(`generate_script`/`generate_storyboard`/`match_voice`/`render_video`)。前端 `ChatTrigger.action` 联合已含这四种,属契约补全。
替代方案「前端按 stage 拼不同 system 提示」:把后端 agent 逻辑泄到前端,难维护。否决——LLM 编排留在后端。

**3. 剧本候选作为对话内卡片组,而非画布物件。**
候选是「三选一的决策」,本质属对话。复用 `types.ts` 已预留的 `card-group` 类型与 `cards`/`CardOption`,在 ChatPanel 渲染卡片、点选回填为一次 user turn。画布只在用户选定后呈现最终剧本节点。
替代方案「把候选塞进画布(传 `candidateNodes`)」:需要画布承载临时决策态 + 入场/退场动画,复杂且与「画布=只读镜子」定位冲突。否决。

**4. 画布节点用「单个通用 ShapeUtil + 复用既有组件主体 + bound arrow 连线」,死代码二选一处置。**
调研结论(已读码确认形状,arrow binding 手感待 spike 用代码确认):既有 `ScriptNode`/`StoryboardNode`/`VideoNode`/`CharacterNode`/`AINode` 是 React Flow 风格的纯 React 组件(`{id,data,selected}` + framer-motion),非 tldraw `ShapeUtil`。tldraw v5 `ShapeUtil.component()` 可返回任意 React,故组件视觉主体可复用。落地选 **一个通用 `manjuNode` ShapeUtil**(`props.nodeType` 切 script/storyboard/... 渲染,复用既有组件主体,去掉 framer mount 动画改 CSS,transform 交给 tldraw),节点设 `isLocked` 以保持「只读镜子」语义——而非写 5 份 ShapeUtil。这样「复活死代码」是真复用(满足 spec「无无人引用组件」),成本可控。
连线:`buildGraph` 的 edges 落成 tldraw `arrow` shape + binding(source→target)。这是本步**唯一手感未验证**处——先写最小 spike(2 个 note + 1 条 bound arrow,移动节点验证跟随);若 v5 binding 手感不佳,降级为「只渲染节点 + 用布局列暗示上下游」,spec 的连线 Scenario 转为非阻塞项。spike 结论写回本节。
替代方案「换 React Flow 复活全部组件」:即方案 B,已被否决。

**Spike 结论(P4.1,已用代码验证 · tldraw 5.0.1):全部通过,带连线方案成立。** 验证手段:dev-only 路由 `/__spike/binding` + 自检脚本(已随 spike 删除)。四点结论,直接约束 P4.2/P4.3 写法:
- **Q1 自定义 shape 可被 arrow 绑定**:`editor.createBinding({type:'arrow', fromId, toId, props:{terminal:'start'|'end', normalizedAnchor, isExact:false, isPrecise:true}})` 对自定义 `ShapeUtil` 节点成立(2 条绑定)。`ArrowBindingUtil` 已在默认 `bindingUtils` 里,`<Tldraw>` 开箱支持。
- **Q2 箭头跟随代码移动**:`editor.updateShape` 移动被绑定节点后,arrow 自动重算(高度 0→271),无需手动更新 arrow。连线方案成立,**不必降级**。
- **Q3 只读镜子的正确配方**:`isLocked:true` 锁住节点挡住「用户」拖拽,但它**也会挡住程序化 `updateShape`**;`editor.updateInstanceState({isReadonly:true})` 同样挡程序化移动。二者都不能单用。正解:**节点 `isLocked:true` + CanvasSync 的布局/移动一律包在 `editor.run(fn, { ignoreShapeLock: true })` 里**——用户拖不动,代码仍可摆位。(已验证:普通 `updateShape` 被锁挡下,`editor.run(...,{ignoreShapeLock})` 内移动成功。)
- **Q4 绑定在多次移动后存活**。
- **类型坑(P4.2 必踩)**:本项目 bundled 的 tldraw 类型里 `TLShape` 是**封闭联合**,自定义 shape 的 `'nodeType'` 不满足 `ShapeUtil<Shape extends TLShape>` 也不满足 `createShape/updateShape` 的类型;自定义节点须 `extends ShapeUtil<any>` 并实现 `getGeometry`(用 `Rectangle2d`)+`getIndicatorPath`(用 `Path2D`),且每个 create/update 调用点要 `as unknown as Parameters<...>[0]` ——与现有 `CanvasSync` 对 `note` 的写法一致。
- **StrictMode 注意**:`<Tldraw onMount>` 在 dev 下双调用(致绑定翻倍),P4.3 的一次性建图/绑定逻辑需自带幂等守卫。

**5. 画布 ↔ 对话双向联动的最小契约。**
对话推进改变 stage → 画布高亮当前 stage 对应节点列;点画布节点 → 触发一次「聚焦该节点」的对话 turn(交由 `chat()` 处理,而非旧的 `focusNode` 写死台词)。聚焦不再是独立状态机分支,而是带 `focus` 上下文的普通一轮对话。

## Risks / Trade-offs

- [后端 system 提示扩到全管线,LLM 在后段乱触发 trigger] → trigger 规则在 prompt 里按 stage 严格约束(如 voice 阶段只允许 `match_voice`),并在前端对「当前 stage 是否允许该 action」做一道校验,非法 trigger 忽略。
- [画布自定义 shape 成本不确定] → 实现前先 spike;最小可接受形态是「note 之外按 type 区分样式 + 连线」,不强求像素级还原 `ScriptNode` 设计。spike 结论写回 design(见 Decision 4)。
- [现有测试 `src/test/canvas-agent.test.ts` 正测的就是待删行为] → 该文件 11 个用例中约 6-7 个断言旧状态机行为(`advance()→ask_type`、`selectOption()→ideaContext`、`focusNode()→editing`、idea 四步推进),统一对话后这些行为消失,测试必红。处置:在 P2 主干改造时**同批重写**该测试——删掉断言已删行为的用例,保留并强化 `restore()` 与 `complete→voice→video→done` 的进度追踪用例,新增「trigger 越权被忽略」单测。不把它留到 P5「跑测试」时才发现。
- [删除死代码误伤未来方案 B] → proposal 已记录方案 B 被否决;若日后重启,从 git 历史恢复成本低。当前留死代码的误导成本更高。
- [统一对话后,voice/video 的确定性触发(原一键按钮)变为依赖 LLM 判断] → 保留「显式确认」语义:trigger 触发后仍可由前端在对话里渲染一个明确的确认动作,避免误触发昂贵的渲染。
- [与并行的 `improve-dark-mode` 都改 `Canvas/index.tsx`] → 两者改动区域不同(本 change 动交互/对话与节点渲染,dark-mode 动 `colorScheme` 同步),合并时注意 `CanvasSync` 附近;建议本 change 在 dark-mode 合入后再落地。
