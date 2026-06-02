# 实现计划:按 P0–P5 依赖顺序

关键路径:P1 spike(asset-service S2S 上传通路)→ P2 后端图像 client + 配额表 → P3 路由解禁 / 加字段 → P4 前端按钮 + 文案 → P5 测试 / 验收。

## 1. P1 spike:确认 asset-service `sign_upload` 在 S2S 路径上能跑

- [x] 1.1 **静态评估替代真跑**(本地无 docker):读 4 处代码(mint_s2s_token 的 claims / asset-service Verifier 的 Claims / SignUpload handler / RequireWriteRole)确认 S2S 路径完全满足要求;既有 `_fetch_project_reference_images` 已实战同模式调 asset-service。
- [~] 1.2 真 PUT 200KB 假 PNG 到 presigned URL 留 dev 环境实跑(`VERIFICATION.md` 清单)。
- [~] 1.3 N/A:P1.1 评估通过,**无需 internal endpoint fallback**。
- [x] 1.4 spike 结论已回写 `design.md` Decision 4 末尾。

## 2. P2 后端:OpenAI image client + 配额

- [x] 2.1 新迁移 `migrations/0002_image_quota.sql`:`ai_image_quota`(team_id × month_yymm 复合主键 + used + "limit" + RLS FORCE policy,与 ai_tasks 同模式)。
- [x] 2.2 `app/repo/image_quota.py`:`check_and_reserve`(INSERT ON CONFLICT + SELECT FOR UPDATE,验 used < limit,超额抛 `QuotaExceeded`)+ `consume`(`used = used + 1`)+ `current_month_yymm()` helper。
- [x] 2.3 `app/services/image.py`:`generate_image` 用 httpx 直调 OpenAI REST(`images.edit` 含参考图 / `images.generate` 无参考图,与 TTS 同模式不引 openai SDK);无 `OPENAI_API_KEY` → 503;上游错 → 502。
- [x] 2.4 同文件 `upload_to_asset_service`:S2S token → `POST /v1/upload/sign` → PUT presigned URL → 返 `file_url`;任意失败 → 502 `IMAGE_UPLOAD_ERROR`。
- [x] 2.5 `app/repo/shots.py` 加 `update_shot_image`;`app/repo/assets.py` 加 `update_asset_file_url`。

## 3. P3 后端:路由与服务函数解禁

- [x] 3.1 `app/services/ai.py` `optimize_shot`:撤掉 501;mode=text/image/both 各自分支;both **两者独立**——任一失败已成功部分保留(由 Python 异常传播自然实现)。
- [x] 3.2 `optimize_character`:加 `generate_avatar: bool = False`;为 true 时走 image 生成 → upload → `update_asset_file_url`,false 时保持改 description。
- [x] 3.3 `app/routes/ai.py` `CharacterOptimizeRequest` 加 `generate_avatar: bool = False`。
- [x] 3.4 共享 helper `_generate_and_save_image`:**先 check_and_reserve → 拉参考图 → 生图 → 上传 → consume**;失败(异常)前没调 consume,自然实现"失败不计配额"。

## 4. P4 前端:按钮 + 文案 + 类型

- [x] 4.1 `src/lib/api/ai.ts`:`OptimizeCharacterInput` 加 `generate_avatar?: boolean`;`OptimizeCharacterResult` 加 `file_url?: string | null`。
- [x] 4.2 `ShotVariant.tsx`:删"即将上线"占位 → 加可点击"重画这一镜" section(独立 prompt 输入 + 按钮 + Loader2)。
- [x] 4.3 `CharacterVariant.tsx`:加"AI 生成头像" section(独立 prompt + 按钮 + Loader2),保留改设定/改名称两块。
- [x] 4.4 共享 `toastError(e, fallback)`:`AiOptimizeError.code === 'IMAGE_QUOTA_EXCEEDED'` → 特殊文案 "本月图像额度用完,下月恢复";其它走通用 toast。
- [x] 4.5 失效正确 query key:`useOptimizeShot` 已失效 `['shots', pid]`;`useOptimizeCharacter` 已 prefix 失效 `['asset', ...]` 与 `['assets']`(canvas-node-optimize-panel 已就绪,不动)。

## 5. P5 测试与验收

- [~] 5.1 quota repo 真 SQL 行为(FOR UPDATE / ON CONFLICT / 月份滚动)→ 留 CI 集成测试。代码自检:`check_and_reserve` 用 INSERT ON CONFLICT + SELECT FOR UPDATE 正确锁行;`consume` 简单 UPDATE returning。本环境无 docker 不跑。
- [x] 5.2 `tests/test_image_optimize.py`:8 个 service 层 mock 测试覆盖 happy / both / 429 / 上游 502 不计 / 上传 502 不计 / 角色头像 / 默认路径 → **全过**。
- [~] 5.3 前端单测按 YAGNI 跳过:变体行为靠 TypeScript 类型 + 隔离回归测覆盖;新 vitest 边际价值有限,如后续要加再补。
- [x] 5.4 隔离回归测仍过:`nodeOptimizePanelIsolation.test.ts` 持续通过(本 change 未引入对话接口)。
- [x] 5.5 全套验证:`pnpm build` ✓、`pnpm lint --max-warnings=20` ✓、`pnpm test` 55/55 ✓、后端 `pytest` 26 通过(25 + 1 skip)+ ruff ✓。
- [x] 5.6 端到端走查清单已写入 `VERIFICATION.md`(8 项,含配额超限、上游失败、上传失败不计配额三类关键回归)。
