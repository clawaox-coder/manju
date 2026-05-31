# 验收说明（improve-canvas-interaction）

## 自动化验证现状

| 项 | 状态 | 说明 |
|----|------|------|
| P5.1 build | ✅ | `pnpm build` 通过 |
| P5.1 lint | ⚠️ | 仅剩 1 个既有问题 `useTheme.ts:16`（属 improve-dark-mode，非本 change 引入；main 上已存在） |
| P5.2 test | ✅ | `pnpm test` 37 passed（含后端 `test_chat_pipeline.py` 4 passed） |
| P5.3 e2e 全链路 | ⛔ 未执行 | 需完整后端栈 + 真 LLM key，本环境无法拉起（见下） |

## P5.3 端到端走查 —— 执行条件与手动清单

**为何未自动执行**：`/canvas` 全链路依赖 docker-compose.prod.yml 里整套服务
（postgres / redis / minio / kafka / auth / project / script / asset / ai-gateway / render），
且 ai-gateway 需配置真 `ANTHROPIC_API_KEY`（否则 chat/script/storyboard 等返回 503）。
本开发环境只有 ai-gateway 进程在跑、无真 key、无 DB，无法完成注册→建项目→跑 AI 的链路。

**在真环境（或 CI 带完整栈）按此清单手动走查**：

1. **统一对话语气**：新建项目，从 idea 一路聊到 video。确认全程是自然对话 +
   动态快捷回复，**没有**「一键配音 / 生成视频 / 确认剧本」这类写死的向导按钮。
2. **idea → 剧本候选**：把题材/风格等聊清后说「开始吧」。确认对话里出现 **3 张剧本方向卡片**
   （而非画布上、也非「去画布点选」的提示）。点一张 → 剧本保存、画布出现剧本节点。
3. **trigger 阶段约束**：在 idea 阶段说「直接出片」，确认 **不会** 跳过中间阶段
   （后端白名单 + 前端 `STAGE_ALLOWED_ACTION` 双重拦截）。
4. **画布只读镜子**：确认画布节点显示**与类型相符的内容**（剧本编号+正文 / 分镜缩略图+对白 /
   角色 / 视频状态），节点间有**连线**；尝试拖动节点——应**拖不动**（isLocked），但随对话推进
   节点会自动出现/更新位置。
5. **点节点聚焦**：点画布某节点，确认对话里发起一轮针对该节点的讨论（非写死台词）。
6. **无悬空控件**：确认输入框回形针按钮已接上传或已移除（P0.1，尚未做）。

## P5.4 合并顺序

- 本 change 与 `improve-dark-mode` 都改 `src/pages/Canvas/index.tsx`。两者改动区域不同
  （本 change 动交互/对话与 CanvasSync 节点渲染；dark-mode 动 `colorScheme` 同步那段 effect）。
- **建议本 change 在 `improve-dark-mode` 合入后再落地**，合并冲突集中在 `CanvasSync` 顶部
  （`effectiveTheme` 那段 effect 与新加的建图 effect 相邻）。
- 既有 lint 问题 `useTheme.ts:16` 由 dark-mode 一侧负责清理，本 change 不动该文件。

## 遗留（不属 P1–P5 范围）

- **P0 小 bug 批次未做**：回形针上传按钮（P0.1）、hero/对话态显式判断（P0.2）、
  `restore()` 冗余分支（P0.3 —— 注：P2 重写 `restore()` 时已自然消除该冗余）。
  P0 可作为本 change 的收尾批次单独处理。
