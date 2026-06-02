# 实现计划:按 P0–P6 依赖顺序

关键路径:P1(后端端点)→ P2(面板外壳 + 锚定)→ P3(内容节点变体接线)→ P5(替换点选 + 镜子刷新)。
P4(枢纽节点)可与 P3 并行;P0 可提前。

## P0. 暖身:契约与类型(低风险,先做)

- [ ] P0.1 定「场景切分契约」:把前端 `parseScenes`(`/^#{1,3}\s+/` + 首段无标题归场景 1)整理成明确规则文档 + 一组样例(content → scenes[]),供前后端各自实现对齐
- [ ] P0.2 `src/lib/api/ai.ts`:声明三个专门优化接口的 TS 类型与 client 函数签名(`rewriteScene` / `optimizeShot` / `optimizeCharacter`),先打桩
- [ ] P0.3 定义节点 → 实体解析:`nodeId`(`script-{i}` / `char-{id}` / `shot-{id}` / `ai-gen` / `video-out`)→ `{ kind, entityRef }` 的纯函数 + 单测

## P1. 后端:专门优化端点(全栈关键前置)

- [ ] P1.1 ai-gateway `POST /v1/ai/shot/optimize` `{ project_id, shot_id, instruction, ref_image_url?, mode: text|image|both }`:text → 改对白(写 script-service `updateShot`);image → 重画这一镜(复用既有分镜生成,scope=单 shot);both → 两者
- [ ] P1.2 ai-gateway `POST /v1/ai/script/rewrite-scene` `{ project_id, scene_index, instruction }`:取 script → 按 P0.1 规则定位该场 → LLM 仅重写该场 → 拼回 → `updateScript`(带取到的 `version_no`,乐观校验)→ 冲突返 409
- [ ] P1.3 ai-gateway `POST /v1/ai/character/optimize` `{ project_id, asset_id, instruction }`:LLM 改写该角色 `description` / 设定 → `updateAsset`(character)
- [ ] P1.4 三端点共享「取上下文 → LLM → 落库」骨架 + 统一错误信封(对齐 `api.md#error-codes`);**不复用 `chat_respond`**
- [ ] P1.5 后端单测:`rewrite-scene` 仅改目标场(其它场不变)、版本冲突返 409、`scene_index` 越界返 4xx;`shot/optimize` 三种 mode 路径
- [ ] P1.6 验证:curl 三端点,确认各自只动目标实体、错误码规范

## P2. 前端:面板外壳 + 锚定(依赖 P0.3)

- [ ] P2.1 `src/pages/Canvas/NodeOptimizePanel/`:面板外壳组件(描述输入 + 执行按钮 + 展开 + 关闭),受控 `open` / `nodeId`
- [ ] P2.2 锚定 hook:由 `editor` 取节点屏幕坐标,监听 camera / selection 变化更新位置;节点被删 / 移出视口 → `onClose`
- [ ] P2.3 面板在 `<Tldraw>` 之上以 overlay 渲染(z-index 高于画布、低于全局弹窗);打开时不打断画布平移缩放手势的预期

## P3. 内容节点变体 + 接线(依赖 P1、P2)

- [ ] P3.1 分镜变体:缩略图 + 描述 + 参考图(复用现有上传) + 快捷[改对白]/[改时长]/[重画这镜];接 `optimizeShot` / `updateShot`
- [ ] P3.2 剧本场变体:可编辑文本 + 重写指令;接 `rewriteScene`;409 → 提示并刷新
- [ ] P3.3 角色变体:头像预览 + 名称/描述编辑 + 优化指令;接 `optimizeCharacter` / `updateAsset`(头像重生成入口本期不渲染)
- [ ] P3.4 执行中态 / 错误态:沿用 `ManjuError` + toast;乐观更新失败回滚

## P4. 枢纽节点动作控制台(可与 P3 并行)

- [ ] P4.1 `ai-gen` 变体:风格 / 导演指令 + [生成 / 重生成全部分镜](`storyboardGenerate` 全量),执行前二次确认
- [ ] P4.2 `video-out` 变体:渲染设定(分辨率 / 格式) + [渲染整片](`createRender`) + 完成后[预览 / 下载],执行前二次确认

## P5. 替换点选 + 镜子刷新(依赖 P2、P3)

- [ ] P5.1 `index.tsx` `handleNodeClick`:改为打开 `NodeOptimizePanel`(传 nodeId + 解析结果);移除 `runAgentTurn("我想聊聊…")` focus turn 与 `sm.focusNode` 写死分支
- [ ] P5.2 写回 → 失效 `['shots']` / `['assets']` / `['script']` → `buildCanvasGraph` 重算 → 镜子与面板预览刷新(面板不持有独立真相源)
- [ ] P5.3 左侧全局对话保持独立:确认节点优化的中间态不注入全局对话消息流

## P6. 验收

- [ ] P6.1 `pnpm build` 无报错;`pnpm lint` 无新增告警
- [ ] P6.2 前端单测:节点→实体解析、各类型变体出对动作、面板锚定/关闭;后端单测见 P1.5
- [ ] P6.3 「优化经专门接口」回归:断言面板路径不触达 `chat()` / `streamScriptContinue()` / `classifyIntent()`
- [ ] P6.4 端到端走查(需完整后端栈 + 真 LLM key):点各类节点→优化→画布镜子刷新;条件不具备时写入 `VERIFICATION.md` 手动清单
