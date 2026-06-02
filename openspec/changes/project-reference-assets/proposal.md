# 项目参考图 + 后端多模态取图(reference-assets)

## 背景与动机

画布对话页已能上传参考图并存为团队级角色资产(子项 B),但**生成时 AI 看不到这些图**——ai-gateway 的 storyboard 生成是纯文本调用,模型不"看"参考图。用户传了角色参考却对生成毫无影响,体验是断的。

经 spike 实测确认:**当前 packy 网关分组支持多模态**(纯文本 + 图片输入均通,模型能正确识别图片内容)。技术前提已具备,可以让后端把参考图喂给模型。

这不是为单个功能做。**后续的剧本参考、分镜参考、风格统一,都将复用同一条"项目参考图 → 喂模型"的管线**。因此本 change 的重点是**把这条管线的数据模型、服务间认证、取图链路一次性设计对**,而非临时打通一个点。

## 目标

1. 参考图能**关联到项目**(当前是团队级、不绑项目,生成时无法知道"该用哪几张")。
2. 设计**可复用的关联模型**:同一张图可被多个项目、多种用途(角色/剧本/分镜/风格)引用,后续扩展不改 schema。
3. ai-gateway 在 storyboard 生成时,**按项目拉取参考图 → 下载 → 作为多模态 image block 喂给模型**。
4. 建立 **service-to-service 认证**,让 ai-gateway 的后台任务有权调用 asset-service(当前缺口:ai-gateway 只能验 token、签不出,后台任务又拿不到调用方 token)。

## 非目标(本次明确不做)

- **不做**剧本参考、分镜参考、风格参考的具体功能——本次只落 `character_ref`(画布角色参考图)一条;但数据模型与管线为它们预留。
- **不做**生产环境的 S2S 认证加固(私钥下放有安全含义,见 design 的风险与取舍);本次仅 dev 环境打通,生产方案另议。
- **不改**前端上传组件的交互(B 已完成);仅在上传时补带 `project_id`。
- **不做**图片的持久缩略图/CDN 优化;沿用现有 MinIO 预签 file_url。

## 关联模型决策

采用**关联表 + role**(多对多),而非给 assets 加 project_id(归属):

- 新建 `project_assets(project_id, asset_id, role)` 关联表。
- `role` 字段(`character_ref` | `style_ref` | `script_ref` | …)让"参考图用在哪个环节"成为**数据而非新表**——后续加剧本/分镜参考,只是插入不同 role 的行,零 schema 变更。
- 资产仍是团队级共享,一张图可被多项目复用,不必复制。

理由:用户已明确后续有剧本/分镜/风格等复用场景,"归属"模型一旦遇到复用就要返工成多对多;关联表 + role 一次设计到位,本次只实现 `character_ref`,不超前。

## 影响面

- **数据库**:asset-service 新增迁移,建 `project_assets` 表 + 索引。
- **asset-service(Go)**:新增"关联资产到项目""按 (project, role) 列出资产"的 repo + handler + 路由。
- **前端(TS)**:上传参考图后,调用新接口把资产关联到当前 project(role=character_ref)。
- **ai-gateway(Python)**:新增 S2S token 签发;storyboard 生成时按项目拉参考图、下载、转 base64、作为 image block 注入多模态请求;图片合法性校验(spike 发现过小/损坏图会被上游 400 拒)。
- **基础设施**:dev compose 给 ai-gateway 挂载 JWT 私钥(签 S2S token 用)。
