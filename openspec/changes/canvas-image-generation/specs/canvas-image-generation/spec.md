## ADDED Requirements

### Requirement: 图像生成由专门模型提供并经平台配额限流

画布的图像生成 SHALL 经由专门的图像生成模型(`gpt-image-1`)完成,SHALL NOT 由对话接口承担;每个 team 的月度图像生成总数 SHALL 受配额限制,**超额时系统 SHALL 拒绝该次生成并返回 4xx 错误**(平台付费严拒模式)。

#### Scenario: 经专门图像模型生成
- **WHEN** 用户触发任一图像生成入口(分镜重画 / 角色头像)
- **THEN** 系统调用专门的图像生成模型完成,而非复用对话 / 文本接口

#### Scenario: 配额内允许
- **WHEN** 该 team 本月已用配额 < 限额
- **THEN** 生成正常进行,成功后已用次数 +1

#### Scenario: 配额超限拒绝
- **WHEN** 该 team 本月已用配额 ≥ 限额
- **THEN** 系统拒绝生成并返回 4xx 错误,前端提示"本月图像额度用完,下月恢复",不消耗任何远端调用

#### Scenario: 生成失败不计配额
- **WHEN** 图像生成调用失败(上游错误 / 网络 / 内容审核拒)
- **THEN** 该 team 的月度已用次数**不**增加,用户可在配额内重试

### Requirement: 参考图自动注入以保持角色一致

生成图像时系统 SHALL 自动获取项目的角色参考图(`character_ref`)并注入到生成调用中,以提高跨镜的角色一致性;参考图获取失败 SHALL NOT 阻断生成,降级为纯文本 prompt。

#### Scenario: 项目有参考图时自动注入
- **WHEN** 用户触发图像生成且项目下存在 character_ref 资产
- **THEN** 系统拉取这些资产(最多 4 张,单张大小限制内)并喂入生成模型

#### Scenario: 无参考图或获取失败降级
- **WHEN** 项目无 character_ref 资产、或拉取过程失败
- **THEN** 系统使用纯文本 prompt 继续生成,生成成功后照常写回

### Requirement: 图像存放与字段写回

生成后的图像 SHALL 经由 asset-service 的上传通道(`sign_upload` + PUT)落到对象存储,SHALL NOT 让图像生成服务自行管理对象存储凭据;成功后系统 SHALL 把图像 URL 写回对应业务字段。

#### Scenario: 分镜生成的图写回 shot
- **WHEN** 用户触发"重画这一镜"且生成成功
- **THEN** 图像被上传到对象存储,URL 写回该 shot 的 `image_url`,画布镜子刷新

#### Scenario: 角色头像生成覆盖现有 file_url
- **WHEN** 用户触发"AI 生成头像"且生成成功
- **THEN** 图像被上传到对象存储,URL 覆盖该角色 asset 的 `file_url`(旧 URL 失效),画布角色节点显示新头像

#### Scenario: 上传失败不写回
- **WHEN** 图像已生成但上传到对象存储失败
- **THEN** 业务字段保持原值,前端提示"上传失败,请重试";配额不计

### Requirement: 平台付费模式与提供商配置

系统 SHALL 由平台统一持有图像模型 API 凭据(本期为 `OPENAI_API_KEY`),SHALL NOT 由用户自带 key;未配置凭据时入口 SHALL 仍可见但调用 SHALL 即时返回 503,以便环境差异在 UI 层显式表达。

#### Scenario: 凭据缺失时显式 503
- **WHEN** 后端未配置图像模型凭据(`OPENAI_API_KEY` 未设)
- **THEN** 图像生成调用立即返回 503,前端提示"图像服务未配置",不消耗配额
