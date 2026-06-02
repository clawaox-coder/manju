## Context

- **当前空白**(读码确认):
  - `services/ai-gateway/app/services/ai.py:931` `optimize_shot(mode=image|both)` 显式 `raise 501 NOT_IMPLEMENTED`
  - `services/ai-gateway/app/services/ai.py:_anthropic_once_multimodal` 仅做"读图"(Claude vision),不生图
  - 全项目 grep:无 `dall-e` / `stability` / `flux` / `midjourney` / `nano-banana` 痕迹
  - `OPENAI_API_KEY` 配置已存在(`config.py:openai_api_key`,TTS 已用)
  - `shots.image_url` / `assets.file_url` 列在迁移里,但生产路径上无人写
  - `_fetch_project_reference_images(project_id, role='character_ref')` 已实现且经实战(分镜多模态生成里用),可直接复用
- **既有约束**:
  - ai-gateway **直写共享库**(repo/shots、repo/assets,team_ctx + RLS),与 chat / shot/optimize text 同模式
  - **不引入 minio 客户端**(asset-service 已封装,经 sign_upload + S2S token)
  - **不复用对话接口**(canvas-node-optimization 隔离回归测把关,本 change 须继续过)
- **用户决策汇总**(brainstorm):平台付费 + 严拒配额(默认 50/团队/月)、OpenAI gpt-image-1、首版仅"分镜重画 + 角色头像"、自动拉 character_ref 当参考图。

## Goals / Non-Goals

**Goals:**
- 解禁"重画这一镜"和"AI 生成角色头像"两个入口,端到端跑通(prompt → OpenAI → minio → 写回 shots/assets → 镜子刷新)
- 配额按 team / 月严拒,超额 429 + 前端友好提示
- 参考图(character_ref)自动注入,角色跨镜尽量保持一致
- 与既有的"节点优化经专门接口"契约相容(不动 chat / 不破隔离回归测)

**Non-Goals:**
- 模型 / 比例 / 分辨率旋钮(canvas-node-optimize-panel 已声明"二期",本 change 仍不上)
- storyboard 全量生成时自动配图(动 ai-gateway 现有异步流程,变动大;二期)
- 多 provider 抽象层(只锁 OpenAI gpt-image-1;后续要换再说)
- BYOK(用户自带 key);本期纯平台付费
- 角色头像"生成新资产 vs 覆盖现有"两种模式并存:**只做覆盖现有**(更新 `assets.file_url`,旧 url 失效)
- 跨 team 共享配额 / 配额转移 / 充值升级:运营手工 SQL 调 `limit` 列即可,无界面

## Decisions

**1. OpenAI `images.edit` API + 固定参数(放弃旋钮)。**
模型 `gpt-image-1`,`quality: medium`($0.04/张,质量/价格平衡),size 按场景固定:分镜 `1792x1024`(16:9 近似)、角色头像 `1024x1024`(正方)。
替代方案「让 user 选参数」被否(canvas-node-optimize-panel design Non-Goals 已明确,首版固定参数闭环更稳)。
替代方案「用 `images.generate` 不喂参考图」被否(角色一致性是短剧场景核心,`edit` API 支持 input images,质量更稳)。

**2. 参考图复用 `_fetch_project_reference_images`,无需新代码。**
该函数已用 S2S token 调 asset-service `/v1/projects/{pid}/assets?role=character_ref` 并下载 base64,且有错误降级(失败返空数组,调用方走纯文本)。`MAX_REF_IMAGES = 4`、`MAX_IMAGE_BYTES = 4MB` 这些守卫继续生效。
**注意**:gpt-image-1 `images.edit` 的 input images 是文件而非 base64,需要把 base64 解码为 bytes 喂 SDK。SDK 接受 `io.BytesIO`,简单。

**3. 配额表设计:窄而专。**
```sql
CREATE TABLE ai_image_quota (
  team_id      uuid NOT NULL,
  month_yymm   varchar(7) NOT NULL,  -- 如 '2026-06'
  used         int NOT NULL DEFAULT 0,
  "limit"      int NOT NULL DEFAULT 50,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, month_yymm)
);
-- RLS 与 ai_gateway 既有表一致(team_id 隔离)
```
- 生成前:`SELECT used, "limit" FROM ai_image_quota WHERE team_id=$1 AND month_yymm=$2 FOR UPDATE`(行锁,防并发超用)
- 不存在 → `INSERT ... ON CONFLICT DO NOTHING` 起 0/50 然后重读
- `used >= limit` → 抛 429
- 成功后 `UPDATE used = used + 1`
- 失败不增(放在 try/except 之外的位置)
**替代方案「按美元计费」**:第一版数额够清晰(50 张 = $2),无需精细到美元。
**替代方案「不用 FOR UPDATE」**:并发同 team 同月同时调可能少计 1,接受(运营层级容忍 ±1)。

**4. 图像存放走 asset-service sign_upload,不让 ai-gateway 引 minio。**
流程:
1. OpenAI 返 `bytes`(PNG)
2. `httpx` 调 `POST /v1/upload/sign`(asset-service)用 S2S token,body `{filename, content_type:'image/png', size_bytes, purpose:'generated-image'}`
3. PUT 上传到返回的 presigned URL
4. 拿 `file_url`
5. 写回 `shots.image_url` 或 `assets.file_url`
**风险**:asset-service 的 sign_upload 当前主要给前端调,后端走可能没专门 codepath。先 spike 一遍——若 S2S token + 后端 PUT 不通,降级方案是在 asset-service 加一个 internal-only `POST /v1/internal/upload/from-bytes` 端点专给 service-to-service。**spike 是本 change 实施第一步**。

**Spike 结论(P1 实施时静态评估,本地无 docker 跑真请求)**:S2S 路径**确认可走**,无需 fallback。证据:
- `mint_s2s_token` claims 含 `team_id` 与 `role: 'owner'`(`services/ai-gateway/app/internal_token.py`)
- asset-service `Claims` struct 只读 `TeamID/Role`,不强校验 `sub`(`services/asset-service/internal/token`)
- `SignUpload` handler 只调 `middleware.MustTeamID(r.Context())` 拿 team_id,不读 user_id(`internal/handler/assets.go:373`)
- `RequireWriteRole` 接 `'owner'` 通过
- 既有 `_fetch_project_reference_images` 用同套 S2S token 调 `/v1/projects/{pid}/assets` 实战过

真 PUT 到 presigned URL 的 happy path 留 dev 环境实跑(`VERIFICATION.md` 清单)。

**5. 角色头像:覆盖现有 `assets.file_url`,旧 url 失效。**
用户场景:对已有角色"AI 生成头像" → 期望该角色立刻是新头像。生成新资产会让画布多一个角色节点,语义错。覆盖现有最直接。
**副作用**:旧文件残留在 minio(无清理)。可接受(运营层级清理或 minio lifecycle)。

**6. 同步等待,不引异步 task pattern。**
gpt-image-1 单次 5-15s;前端 `ShotVariant` / `CharacterVariant` 已有 `optimize.isPending` + Loader2 spinner 适配。30s 超时 client side。
**替代方案「BackgroundTasks + 轮询」**:与 storyboard_generate 一致,但用户面板等同步反馈更自然;不引入额外复杂度。

**7. 错误码与前端处理。**
- `429 IMAGE_QUOTA_EXCEEDED`(detail.code) → 前端 toast 含 used/limit 与"下月恢复"提示
- `502 OPENAI_IMAGE_ERROR` → 通用错误 toast
- `502 IMAGE_UPLOAD_ERROR` → "图已生成但上传失败,请重试"(罕见,不计配额)
- `503 IMAGE_PROVIDER_UNAVAILABLE` → "服务未配置"(无 OPENAI_API_KEY)
- 前端 `AiOptimizeError` 已携带 status + code(canvas-node-optimize-panel 落地),变体只需按 code 走不同 toast 文案。

## Risks / Trade-offs

- **OpenAI 上游波动 / 速率限制 / 内容审核拒**:都走 `502 OPENAI_IMAGE_ERROR` 信封,前端友好提示;**失败不计配额**(关键)。
- **asset-service sign_upload 在 S2S 路径上可能不通**(从未实战) → spike(P1.1)。若不通则加 `internal/upload/from-bytes` 端点(P1.2)。
- **角色头像覆盖旧 url 后,旧引用断链**:旧分镜里的角色参考可能引用旧 file_url。`fetch_project_reference_images` 取的是当前 asset 的 file_url,会自动用新值,所以画布不会断;但 minio 旧文件残留。运营容忍。
- **gpt-image-1 拒绝(prompt 含敏感内容)**:走 502 错误体,前端不暴露具体原因(防 abuse 探针)。
- **并发同 team 同时打 5 张**:FOR UPDATE 串行化;并发延迟可接受(每张 5-15s,串行也只是慢一点)。
- **配额 limit 后台改**:无界面;`UPDATE ai_image_quota SET "limit" = ? WHERE ...` 手工 SQL。
- **测试覆盖**:OpenAI 调用 mock 掉(monkeypatch `_image_client`),focus 在 quota / upload / 写回逻辑;真上游往返靠 dev 走查。
- **图像大小(1792x1024 PNG)可能 > 1MB**:上传到 minio 走 sign_upload,asset-service 有大小限制?需 spike 时验。
