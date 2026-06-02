## Context

- 画布节点来自 `buildCanvasGraph()`(`src/pages/Canvas/buildGraph.ts`):
  - `script-{i}`:剧本场,从 `script.content` 按 markdown 标题(`/^#{1,3}\s+/`)**前端解析**而来,无后端"场景"实体。
  - `ai-gen`:AI 枢纽,**合成节点**(非数据实体)。
  - `char-{assetId}`:角色,对应一个 `AssetDTO`(type=character)。
  - `shot-{shotId}`:分镜,对应一个 `ShotDTO`。
  - `video-out`:视频输出,**合成聚合节点**。
- 现有 `handleNodeClick`(`index.tsx`):点节点 → `sm.focusNode` + 系统消息 + `runAgentTurn("我想聊聊…")`,落到**左侧全局对话**。
- 现有单元素能力:`updateShot` / `storyboardGenerate({shot_ids})` / `deleteShot`(分镜);`updateAsset` / `deleteAsset`(角色);`updateScript`(整文 PUT,**无单场**);`storyboardGenerate`(全量) / `createRender`(整片)。
- 通用对话接口:`chat()` / `streamScriptContinue()` / `classifyIntent()`(`src/lib/api/ai.ts`)——**本 change 明确不复用、不修改**。

约束:
- 画布仍为只读镜子(本 change 不开放拖拽 / 缩放——那是并行第二步)。
- 节点优化**不得经过** `chat()` 等对话接口(用户明确要求隔离)。
- 剧本场要"精准"(只动这一场)。
- 图像生成参数旋钮(模型 / 比例 / 分辨率)留二期。

## Goals / Non-Goals

**Goals:**
- 点任一节点 → 节点旁锚定浮动面板,针对该节点做对应操作。
- 5 类节点全覆盖:内容节点单元素优化、枢纽节点整体动作。
- 优化走专门接口,与全局对话彻底解耦。
- 写回后画布镜子与面板预览自动刷新。

**Non-Goals:**
- 不开放节点拖拽 / 缩放 / 重排(第二步)。
- 不复用 / 不改 `chat()` 等对话接口。
- 不上图像模型 / 比例 / 分辨率旋钮(二期)。
- 不做角色头像 AI 重生成(二期,需后端生成端点)。
- 不把剧本重构成场景表存储(用 content + 服务端原子替换达成"精准")。

## Decisions

**1. 形态:锚定浮动面板,随节点跟随,按类型自适应。**
面板锚定被点节点的屏幕坐标,监听 tldraw `editor` 的 camera 变化更新位置;统一外壳(描述输入 + 执行 + 展开 + 关闭),内容区按 `nodeType` 切换变体。
替代方案「居中模态」被否(遮挡画布镜子,迭代优化时看不到上下文);「右侧停靠面板」备选(空间大但非"弹在节点旁",与参考图不符)。

**2. 覆盖全部 5 类节点,但分两种语义。**
内容节点(script / character / storyboard)= 单元素优化;枢纽节点(ai / video)无单个实体,面板承载其整体动作(生成全部分镜 / 渲染整片)。两者共用外壳、不同内容区。枢纽节点的动作是昂贵操作,面板内须**二次确认**再执行。

**3. 三层接口,节点优化绝不经对话接口。**
- **① AI 优化(新增专门端点)**:`POST /v1/ai/script/rewrite-scene`、`POST /v1/ai/shot/optimize`、`POST /v1/ai/character/optimize`。
- **② 枢纽整体动作(沿用既有制作接口,非对话)**:`storyboardGenerate`(全量)、`createRender`(整片)。
- **③ 纯字段写入(沿用既有单元素 CRUD,非 AI 非对话)**:`updateShot` / `updateAsset` / `deleteShot` / `deleteAsset`。
理由:用户要求节点优化与全局对话彻底隔离——避免污染 `chat()` 的 stage / system 逻辑,且按节点精确控制。
替代方案「在 `chat()` 上加 focus 上下文复用」被否(与隔离要求冲突,且让对话契约更难维护)。

**4. 剧本场精准单场重写(服务端原子替换,不重构存储)。**
`POST /v1/ai/script/rewrite-scene { project_id, scene_index, instruction }`:ai-gateway 取 script → 按**与前端 `parseScenes` 一致的 markdown 标题规则**定位 `scene_index` 那一场 → LLM **仅重写该场** → 拼回 content → 以取到的 `version_no` 调 script-service `updateScript`(乐观版本校验)→ 冲突返 409。前端不做拼接。
**场景切分规则(`/^#{1,3}\s+/` + "首段无标题归为场景 1")作为前后端共享契约**,两侧必须一致,否则 `scene_index` 错位。建议把切分逻辑沉淀为可被前后端各自实现并用同一组样例测试锁定的规范(见 tasks)。

**5. 写回 → 镜子刷新的单一路径。**
面板任一写操作成功 → 失效对应 react-query key(`['shots']` / `['assets']` / `['script']`)→ `useShots` / `useAssets` / `useScript` 重取 → `buildCanvasGraph` 重算 → `CanvasSync` 更新节点 → 面板从**同一数据源**重渲染预览。面板**不维护独立真相源**(避免与镜子不一致)。

**6. 替换点选行为。**
`handleNodeClick` 改为:打开 `NodeOptimizePanel`(传 `nodeId` + 解析出的类型 / 实体引用),移除 `runAgentTurn("我想聊聊…")` 那条 focus turn 与 `sm.focusNode` 写死分支。左侧全局对话仍由用户自由输入驱动整段流水线,二者并存、互不注入中间态。

## Risks / Trade-offs

- [锚定坐标随 camera / 节点移动易错位] → 监听 `editor` 的 camera 与 selection 变化重算坐标;节点被删 / 移出视口时关闭面板。
- [前后端场景切分不一致致 `scene_index` 错位] → 切分规则定为共享契约 + 同组样例测试在前后端各锁一遍。
- [单场重写的版本冲突] → 乐观版本(`expected_version_no`);409 时面板提示"内容已变,已刷新,请重试"并自动重取,不静默覆盖。
- [新增多个 AI 端点的成本] → 三个端点共享"取上下文 → LLM → 落库"骨架,差异仅 prompt 与目标实体;首版 prompt 可简洁。
- [枢纽节点整体动作 = 昂贵操作(渲染 / 全量生成)] → 面板内二次确认,避免误触。
- [与既有 `improve-canvas-interaction` 的点选语义冲突] → 本 change 显式 MODIFY 其"点选节点聚焦"场景为"打开面板";落地时注意 `handleNodeClick` 与 `CanvasSync` 的 selection effect 相邻区域。
- [角色头像重生成 / 图像参数旋钮被期待但未做] → proposal/Non-Goals 已标二期;面板对这些位先不渲染入口,避免悬空控件。
