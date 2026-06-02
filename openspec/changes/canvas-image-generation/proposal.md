## Why

`canvas-node-optimize-panel` 上线了"重画这一镜"的入口但后端返 501(`shots.image_url` 字段也一直空),"角色头像 AI 生成"作为二期被标注。原因:**ai-gateway 没接图像生成模型**。本 change 接入 OpenAI gpt-image-1(项目已有 `OPENAI_API_KEY`,TTS 在用),把"分镜重画 + 角色头像生成"两个被卡死的入口同时解开。

商业层一并定:**平台付费 + 严拒配额**(50 张 / 团队 / 月,超额返 429)——避免账单失控,也是后续付费产品化的前置铺垫。

## What Changes

- **新增图像生成能力**(ai-gateway):
  - 加 OpenAI image client(用 `openai` SDK 的 `images.edit`,自动喂项目 `character_ref` 参考图保角色一致)
  - 加 `ai_image_quota` 表(team_id × month_yymm × used × limit,默认 50)+ 生成前 check / 成功后 +1 / 失败不计
- **`POST /v1/ai/shot/optimize` 解禁 image|both 模式**:从 501 → 真生成 PNG → 经 asset-service `sign_upload` 上 minio → 写回 `shots.image_url`
- **`POST /v1/ai/character/optimize` 加 `generate_avatar: bool` 字段**:为 true 时生成头像 PNG → 上 minio → 写回 `assets.file_url`(更新现有角色资产,旧 url 失效)
- **前端**:
  - `ShotVariant` 解锁"重画这一镜"按钮(原为"二期"占位文字)
  - `CharacterVariant` 加"AI 生成头像"按钮
  - 配额 429 → toast "本月图像额度用完(N/50),下月恢复"
- **图像存放**:ai-gateway 不引入 minio 依赖;统一走 asset-service 的 `sign_upload`(用现有 S2S token)再 PUT 上传

## Capabilities

### New Capabilities
- `canvas-image-generation`:图像生成的完整行为契约——OpenAI gpt-image-1 调用、参考图自动注入、配额严拒、上传到 asset-service、写回 shots/assets。

### Modified Capabilities
- `canvas-node-optimization`:解除"重画这一镜"二期占位(`shot/optimize` image|both → 501 反转为真生成);新增"AI 生成角色头像"行为。

## Impact

- **后端 ai-gateway**:
  - 新文件 `app/services/image.py`(OpenAI image 调用 + 参考图 base64 + 错误信封)
  - 新文件 `app/repo/image_quota.py`(quota check / consume)
  - `app/services/ai.py` `optimize_shot` 撤 501、`optimize_character` 加 `generate_avatar` 分支
  - `app/repo/shots.py` 加 `update_shot_image`;`app/repo/assets.py` 加 `update_asset_file_url`
  - 新迁移:`migrations/0002_image_quota.sql`(单表 + 索引)
  - 新依赖:`openai` 已经有(TTS 用着),版本应已支持 gpt-image-1 / images.edit
- **后端 asset-service**:**不动**(复用现有 sign_upload + S2S)
- **前端**:`ShotVariant.tsx` 解禁按钮、`CharacterVariant.tsx` 加生成头像按钮;`ai.ts` 客户端类型对齐(`OptimizeCharacterInput` 加 `generate_avatar`,response 加 `file_url`);hooks 失效正确 query key
- **不动**:对话接口契约(`chat()` 等不复用)、storyboard 自动配图(明确二期)、画布节点拖拽语义、`canvas-node-edit-layout` 的持久化逻辑
