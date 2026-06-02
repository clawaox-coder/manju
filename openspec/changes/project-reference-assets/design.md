# 设计:项目参考图 + 后端多模态取图

## 一、关联模型:project_assets 关联表 + role

### Schema(asset-service 新迁移 0003)

```sql
CREATE TABLE project_assets (
  project_id  uuid NOT NULL,                       -- 不加 FK：project 在 project-service 库，跨库不强约束
  asset_id    uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  role        varchar(32) NOT NULL,                -- character_ref | style_ref | script_ref | ...
  team_id     uuid NOT NULL,                       -- 冗余存一份，RLS 隔离用（避免 join assets 才能判 team）
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, asset_id, role)
);
CREATE INDEX idx_project_assets_lookup
  ON project_assets (project_id, role);
-- RLS：与 assets 一致，team_id 匹配
ALTER TABLE project_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY pa_team_isolation ON project_assets
  USING (team_id = current_setting('app.team_id', true)::uuid);
```

**决策点**：
- **`role` 是设计核心**——后续剧本/分镜/风格参考全部复用此表，只插不同 role 的行，不动 schema。本次只用 `character_ref`。
- **`project_id` 不设外键**：project 归 project-service 库，跨库不强约束（与现有 shots 表跨库共享同理）。
- **`team_id` 冗余存**：RLS 隔离直接用本表的 team_id，不必每次 join assets，简化策略也更快。
- **PK (project_id, asset_id, role)**：同一图在同一项目同一用途只关联一次，幂等。

替代方案「assets 加 project_id」已否决：用户明确后续有跨环节复用，归属模型遇复用即返工。

## 二、Service-to-Service 认证

### 现状（已勘察）
- 全服务共用同一对 RSA 密钥，issuer 统一 `manju-auth`，claims = `{sub, team_id, role, jti, exp, iss}`。
- asset-service 的 verifier 只校验**签名 + issuer + claims 结构**，不绑定"必须真人用户"。
- **私钥目前只挂给 auth-service**；ai-gateway 只有公钥（能验不能签）。
- storyboard 生成是 `BackgroundTasks` 后台任务，原请求 token 已失效，**手里没有可用 token**。

### 方案：ai-gateway 自签短期 S2S token
1. dev compose 给 ai-gateway 挂 `jwt-private.pem`（只读）。
2. ai-gateway 新增 `internal_token.py`：用私钥签一个与用户 token 同构的 JWT：
   - `sub = "svc:ai-gateway"`、`role = "owner"`（需写/读权限）、`iss = "manju-auth"`、`exp = now+60s`、`jti = uuid`
   - `team_id` = 后台任务从 `ai_tasks` 表取（create_task 时已存 team_id，无需额外透传）
3. 后台任务用此 token 调 asset-service `GET /v1/assets/...`，asset-service 原样校验通过。

**关键约束**：S2S token **TTL 极短（60s）**、只在后台任务内即用即弃、不落盘不返回前端。

### 生产环境取舍（本次非目标，但必须记录）
dev 让 ai-gateway 持共享私钥可接受。**生产环境不应如此**——ai-gateway 持私钥 = 它能签任意 team/role 的 token，被攻破则横向越权。生产应选其一（另起 change）：
- 独立的内部服务密钥对（与用户 token 不同 issuer，asset-service 增信内部 issuer）；
- 或 service mesh / 网关层做 mTLS，应用层不持私钥。
本 change 在 design 显式标注此债务，dev 先行。

## 三、取图链路（ai-gateway storyboard 多模态）

```
storyboard_generate_async(project_id, team_id, ...)
  ├─ 签 S2S token (internal_token, team_id from ai_tasks)
  ├─ GET asset-service /v1/assets/characters?... 经新接口按 (project_id, role=character_ref) 拉关联资产
  ├─ 对每张 file_url：httpx 下载字节 → 校验(大小/格式) → base64
  │     └─ spike 教训：过小/损坏图上游 400，需校验后跳过，最多取 N 张(防超限)
  ├─ messages=[{role:user, content:[ {image…}*N, {text: 原 prompt} ]}]
  └─ 其余流程不变(解析 JSON → 落 shots 表)
```

- `_anthropic_once` 只收纯文本，需新增 `_anthropic_once_multimodal(prompt, system, images)` 或扩展之；保留纯文本路径不动（其他生成端点不受影响）。
- **图片数量上限**（如 ≤4）与**单图大小上限**：防止 token 超限与上游拒绝。
- **无参考图时**：完全走原纯文本路径，不回归。

## Goals / Non-Goals
（见 proposal）补充：本 change 成功标准是「画布传角色参考图 → storyboard 生成时模型确实看到该图」端到端打通，且无参考图时行为与现在完全一致。

## 风险与取舍

- **[生产私钥下放]** ai-gateway 持私钥放大攻破影响面 → dev 先行，design 显式记债，生产方案另起 change。
- **[跨服务调用失败]** asset-service 不可达/超时 → 取图失败时**降级为纯文本生成**（不阻断分镜），并在 task 记 warning，不让参考图问题搞挂主流程。
- **[图片导致上游 400/超限]** → 下载后校验大小格式、限数量、单图限大小；不合格跳过。
- **[跨库无 FK 的悬挂关联]** project 删除后 project_assets 残留 → 可接受（查询按 project_id 过滤，残留不影响正确性）；后续可加清理任务。
- **[RLS 上下文]** ai-gateway 经 asset-service HTTP 调用，RLS 由 asset-service 设置（它本就有），ai-gateway 不直连 project_assets 表，边界清晰。
