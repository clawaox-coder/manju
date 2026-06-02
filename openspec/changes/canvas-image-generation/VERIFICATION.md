# 验收说明(canvas-image-generation)

## 自动可验项(本环境实跑)

| 项 | 手段 | 结果 |
|----|------|------|
| 前端构建 | `pnpm build`(tsc -b + vite,严格) | ✅ 通过 |
| 前端 lint | `pnpm exec eslint src --max-warnings=20` | ✅ 0 警告 |
| 前端单测 | `pnpm test` | ✅ **55/55**(隔离回归测继续通过,确认无对话接口耦合) |
| 后端 import + 新路由 | `python -c "from app.main import app"` | ✅ `shot/optimize` / `character/optimize` / `script/rewrite-scene` 三路由注册 |
| 后端 ruff | `ruff check` | ✅ 0 警告 |
| 后端单测(service 层 mock) | `pytest tests/test_image_optimize.py` | ✅ **8/8 通过**(happy/both/429/上游 502 不计/上传 502 不计/角色头像/默认路径) |
| 既有节点优化测试 | `pytest tests/test_node_optimize.py` | ✅ 18 passed + 1 skipped(`test_shot_image_mode_501` 由本 change 反转,跳过指向 P5.2 新测试) |
| 场景切分契约 | `pytest tests/test_scene_split.py` | ✅ 8/8 |

## 留 CI / dev 环境跑的项(本环境无 docker daemon)

| 项 | 说明 |
|----|------|
| `tests/test_image_optimize.py`(已写) | CI 上 testcontainers 起 pg + 应用 0002 迁移,8 个 mock 测试也会跑;实战路径(真 PG 行锁、INSERT ON CONFLICT、月份滚动)代码非常直接,本 change 接受"代码读阅 + 单测覆盖业务分支"作为充分性边界。 |
| 真 OpenAI gpt-image-1 往返 | 需真 `OPENAI_API_KEY` + 完整 docker 栈。Mock 测试已锁定 service 层契约;真上游表现(图质量、角色一致性、参考图效果)留 dev 走查。 |
| 真 asset-service `sign_upload` + PUT 上传 | spike 已静态评估通过(`design.md` Decision 4)。真 happy-path 留 dev 走查。 |

## 需 dev server 的手动走查

执行条件:`scripts/dev/docker compose up -d`(全栈)+ 真 `OPENAI_API_KEY` 与 `JWT_PRIVATE_KEY_PATH` 配置。

### 1. 分镜:重画这一镜
- 进 `/canvas`,任一项目。点分镜节点 → 面板出现新"重画这一镜" section(替代原"二期"占位文字)。
- 输入画面描述(可选)→ 点 [重画]。预期:
  - 5-15s 后 toast "已重画这一镜",画布上该分镜节点的缩略图换成新生成图。
  - 后端 `ai_image_quota`.used + 1。

### 2. 分镜:both 模式(改对白 + 重画一起)
- 当前 UI 没有显式 both 入口,但前端可通过修改 `mode='both'` 触发(为低优 e2e)。
- 后端契约:text 与 image 各自独立,任一失败已成功部分保留 → 见 mock 测试 `test_shot_both_runs_text_and_image`。

### 3. 角色:AI 生成头像
- 点角色节点 → 面板出现新"AI 生成头像" section。
- 输入头像描述(可选)→ 点 [生成头像]。预期:
  - 5-15s 后 toast "已生成新头像",画布上角色节点头像换成新生成图。
  - 后端 `assets.file_url` 被覆盖(旧 URL 失效,minio 旧文件残留)。

### 4. 参考图自动注入
- 项目里 link 至少 1 个 `character_ref` 资产(`/v1/projects/{pid}/assets` POST `role=character_ref`)。
- 重画这一镜或生成头像,**新图应保持角色外观一致**(gpt-image-1 通过 `images.edit` 多图 input 实现)。
- 若 fetch 参考图失败(asset-service down 等),预期降级为纯文本 prompt,生成仍成功 → 见 service.image.py 的 `reference_images` 可空分支。

### 5. 配额超限严拒
- 后台手工 SQL:`UPDATE ai_image_quota SET used = 50 WHERE team_id = ? AND month_yymm = '2026-06';`
- 再触发任一图像生成。预期:toast "本月图像额度已用完(50/50),下月恢复";后端 429。
- 关键:此时 OpenAI 调用与 minio 上传**完全没发生**(从日志确认 0 个 outbound 请求)。

### 6. 上游失败不计配额
- 把 `OPENAI_API_KEY` 替换为无效 key,触发生成。预期:
  - 后端 502 `OPENAI_IMAGE_ERROR`,前端通用错误 toast。
  - `ai_image_quota.used` **不**增加。

### 7. 上传失败不计配额
- 制造 asset-service down 或 minio 满,触发生成。预期:
  - 后端 502 `IMAGE_UPLOAD_ERROR`,前端通用错误 toast。
  - `ai_image_quota.used` **不**增加。

### 8. 隔离不破回归
- 全程图像生成无任何对话面板/消息流副作用(隔离测在 PR CI 自动锁定)。

## 合并 / 顺序

- 本 change 基于 main 起;与 `spec/canvas-node-edit-layout`(PR #5,还未合)无冲突区(本 change 改的是 ai-gateway + ShotVariant/CharacterVariant 的图像 section + ai.ts character 类型;那 PR 改的是 ManjuNodeUtil/CanvasSync/persistence)。可独立 PR / 任意顺序合并。
- 二期(明确不在本 PR):storyboard 自动配图、模型/比例/分辨率旋钮、配额界面、跨 team 共享配额。
