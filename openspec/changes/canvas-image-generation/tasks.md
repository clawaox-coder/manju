# 实现计划:按 P0–P5 依赖顺序

关键路径:P1 spike(asset-service S2S 上传通路)→ P2 后端图像 client + 配额表 → P3 路由解禁 / 加字段 → P4 前端按钮 + 文案 → P5 测试 / 验收。

## 1. P1 spike:确认 asset-service `sign_upload` 在 S2S 路径上能跑

- [ ] 1.1 起 docker scripts/dev 全栈,用 S2S token 调 asset-service `POST /v1/upload/sign`(`purpose='generated-image'`,`content_type='image/png'`,`size_bytes=200000`);记录返回的 presigned URL 形状与 headers
- [ ] 1.2 用 `httpx` PUT 200KB 假 PNG 到 presigned URL;确认返回 200/204,minio 里能列出该对象
- [ ] 1.3 如失败:在 asset-service 加 `POST /v1/internal/upload/from-bytes`(仅认 S2S token,接 multipart bytes,内部 PutObject);记录决策回写 design.md Decision 4
- [ ] 1.4 spike 结论文档化(更新 design.md Decision 4 末尾)

## 2. P2 后端:OpenAI image client + 配额

- [ ] 2.1 新迁移 `services/ai-gateway/migrations/0002_image_quota.sql`:`ai_image_quota` 表 + RLS(team_id 隔离,policy 与既有 ai_tasks 同)
- [ ] 2.2 `app/repo/image_quota.py`:`check_and_reserve(team_id, month)`(FOR UPDATE 锁行 + insert on conflict + check)、`consume(team_id, month)`(`used = used + 1`);失败不调用 consume(由 services 层 try/except 控制)
- [ ] 2.3 `app/services/image.py`:`_image_client()` 返 openai SDK 实例(沿用 `openai_api_key`,无 key 时抛 503);`generate_image(prompt, size, reference_images?)` 同步返 `bytes`;错误信封统一(`502 OPENAI_IMAGE_ERROR`)
- [ ] 2.4 `app/services/image.py`:`upload_to_asset_service(team_id, bytes, content_type, purpose) -> file_url`:调 sign_upload(S2S token)+ PUT 上传 + 返回 file_url;失败抛 `502 IMAGE_UPLOAD_ERROR`
- [ ] 2.5 `app/repo/shots.py` 加 `update_shot_image(shot_id, image_url)`;`app/repo/assets.py` 加 `update_asset_file_url(asset_id, file_url)`

## 3. P3 后端:路由与服务函数解禁

- [ ] 3.1 `app/services/ai.py` `optimize_shot`:撤掉 `mode in ('image', 'both')` 的 501 抛错;`mode=image|both` 走 `image.generate_image(...)` → `upload_to_asset_service(...)` → `update_shot_image(...)`;`both` 串行跑 text 与 image,**两者独立**——任一失败只 raise 该步错误,已成功那步保留(用户面板会看到部分成功 + toast)
- [ ] 3.2 `app/services/ai.py` `optimize_character`:加 `generate_avatar: bool` 参数(默认 false);为 true 时同样走 image 生成→上传→`update_asset_file_url`;false 时保持现有改 description 行为
- [ ] 3.3 `app/routes/ai.py` `CharacterOptimizeRequest` 加 `generate_avatar: bool = False` 字段
- [ ] 3.4 `optimize_shot` / `optimize_character` 在调 `image.generate_image` 前调 `image_quota.check_and_reserve(team_id, current_month)`;成功后调 `consume`;参考图通过既有 `_fetch_project_reference_images(project_id, team_id)` 注入

## 4. P4 前端:按钮 + 文案 + 类型

- [ ] 4.1 `src/lib/api/ai.ts`:`OptimizeCharacterInput` 加 `generate_avatar?: boolean`;`OptimizeCharacterResult` 加 `file_url?: string | null`
- [ ] 4.2 `src/pages/Canvas/NodeOptimizePanel/variants/ShotVariant.tsx`:删除"重画这一镜:即将上线"占位文本,加可点击按钮 → 调 `optimize.mutateAsync({ shot_id, mode: 'image', instruction: prompt })`(prompt 若空则用 shot.title + shot.dialog 拼成默认);执行中 Loader2 + "AI 正在重画…"
- [ ] 4.3 `src/pages/Canvas/NodeOptimizePanel/variants/CharacterVariant.tsx`:加"AI 生成头像"按钮 → `optimize.mutateAsync({ asset_id, generate_avatar: true, instruction: prompt })`;loading 文案"AI 正在生成头像…"
- [ ] 4.4 共享错误文案:`AiOptimizeError.code === 'IMAGE_QUOTA_EXCEEDED'` → toast "本月图像额度用完,下月恢复";其它 502 走通用 toast
- [ ] 4.5 失效正确 query key:image 模式失效 `['shots', projectId]` / `['asset', 'character', assetId]` 与 `['assets']`

## 5. P5 测试与验收

- [ ] 5.1 后端单测 `tests/test_image_quota.py`:check_and_reserve 配额内通过 / 满额 raise / 并发 race(FOR UPDATE)/ 失败不 consume / 月份滚动
- [ ] 5.2 后端单测 `tests/test_image_optimize.py`:monkeypatch `_image_client` 返 fake bytes 与 fake upload;断言 happy path 写回 shot.image_url / asset.file_url;断言 quota 超限抛 429;断言上游 502 不计配额
- [ ] 5.3 前端单测:`ShotVariant` image mode 路径调通(mock fetch);`CharacterVariant` 生成头像路径;429 toast 文案
- [ ] 5.4 隔离回归测继续通过(NodeOptimizePanel 不引入对话接口 token)
- [ ] 5.5 `pnpm build` + `pnpm lint --max-warnings=20` + `pnpm test` 全过;后端 pytest 全过
- [ ] 5.6 端到端走查(需真 `OPENAI_API_KEY` + 完整 docker 栈)写入 VERIFICATION.md 手动清单
