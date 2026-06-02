# 能力契约:项目参考图(reference-assets)

## ADDED Requirements

### Requirement: 参考图关联到项目(关联表 + role)

系统 SHALL 支持把一个团队级资产关联到一个项目,并标注用途(role)。关联模型 SHALL 为多对多,使同一资产可被多个项目、多种用途引用,且新增用途不需变更表结构。

#### Scenario: 上传角色参考图后关联到当前项目
- **WHEN** 用户在画布对话页上传一张参考图,且当前处于某个项目
- **THEN** 该资产被创建为团队级资产,并以 role=character_ref 关联到当前项目

#### Scenario: 同一资产复用到多个项目
- **WHEN** 一张已存在的资产被关联到另一个项目
- **THEN** 关联成功,资产本身不被复制,两个项目都能查到它

#### Scenario: 重复关联幂等
- **WHEN** 同一资产以同一 role 重复关联到同一项目
- **THEN** 不产生重复关联(主键 project_id+asset_id+role 保证幂等)

#### Scenario: 按项目与用途查询
- **WHEN** 按 (project_id, role) 查询参考图
- **THEN** 仅返回该项目下该用途的资产,不返回其他项目或其他 role 的资产

### Requirement: 服务间认证(ai-gateway 调 asset-service)

ai-gateway 的后台任务 SHALL 能以服务身份调用 asset-service,而无需依赖已失效的调用方 token。该服务令牌 SHALL 复用现有 JWT 体系(同密钥、同 issuer、同 claims 结构),由 asset-service 原有校验逻辑接受。

#### Scenario: 后台任务签发并使用服务令牌
- **WHEN** storyboard 后台任务需要拉取项目参考图
- **THEN** ai-gateway 用私钥签发一个短期(≤60s)服务令牌(sub=svc:ai-gateway, 含 team_id),并据此成功调用 asset-service

#### Scenario: 服务令牌即用即弃
- **WHEN** 服务令牌被签发
- **THEN** 它仅用于本次后台任务的服务间调用,不返回前端、不持久化

#### Scenario: team 隔离正确
- **WHEN** 服务令牌携带某 team_id 调 asset-service
- **THEN** asset-service 的 RLS 仅返回该 team 的资产,不跨 team 泄漏

### Requirement: 生成时多模态注入参考图

storyboard 生成 SHALL 在存在项目参考图时,把参考图作为多模态图片输入随提示词一并发给模型;在无参考图时,SHALL 退回纯文本生成且行为与注入前一致。

#### Scenario: 有参考图时模型可见
- **WHEN** 某项目关联了 character_ref 参考图,触发 storyboard 生成
- **THEN** 该参考图被下载并作为图片输入发给模型,模型生成时可参考其内容

#### Scenario: 无参考图时不回归
- **WHEN** 某项目没有任何参考图,触发 storyboard 生成
- **THEN** 走纯文本生成,流程与结果与本能力引入前一致

#### Scenario: 不合格图片被跳过
- **WHEN** 某参考图过小、损坏或超出大小限制
- **THEN** 该图被跳过(不发给模型),不导致整个生成失败

#### Scenario: 取图失败降级而非中断
- **WHEN** asset-service 不可达或取图链路出错
- **THEN** 生成降级为纯文本继续完成,并在任务记录中标注 warning,不阻断分镜产出

#### Scenario: 图片数量受限
- **WHEN** 某项目关联的参考图数量超过上限
- **THEN** 仅取前 N 张(有上限),避免 token 超限与上游拒绝
