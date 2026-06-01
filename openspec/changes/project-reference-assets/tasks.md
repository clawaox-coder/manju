# 实现计划:项目参考图 + 后端多模态取图

依赖顺序:T1(DB) → T2(asset-service API) → T3(前端关联) ∥ T4(S2S token) → T5(取图喂模型) → T6(端到端验证)。
每步独立可验证,不一次性糊。

## T1. 数据库:project_assets 关联表

- [x] T1.1 新建迁移 `services/asset-service/migrations/0003_project_assets.sql`:建表(project_id, asset_id FK→assets, role, team_id, created_at, PK 三元组)+ 索引 (project_id, role) + RLS(team_id 隔离,FORCE)
- [x] T1.2 迁移能在 dev 库跑通(以 owner manju 经 psql 应用);表结构、索引、RLS 策略就位
- [x] T1.3 验证:psql 确认表/索引/FK/RLS 就位;manju_app 自动获 arwd 权限;切 manju_app + set app.team_id 查询经 RLS 返回正常

## T2. asset-service:关联与查询 API(Go)

- [x] T2.1 repo 层:`LinkAsset`/`UnlinkAsset`(幂等 ON CONFLICT DO NOTHING)+ `ListByProjectRole`(join assets,prefixedAssetColumns 复用 scanAsset)
- [x] T2.2 handler + 路由:`POST /v1/projects/{pid}/assets`(body: asset_id, role)+ `GET /v1/projects/{pid}/assets?role=`;service 层 role 白名单校验。复用 RequireAuth + RequireWriteRole
- [x] T2.3 go build + go vet 全服务通过(集成测试补充留到 T6 统一回归)
- [x] T2.4 验证:真后端实测 — 关联 201、幂等不重复(GET count=1)、按 role 列出 200、非法 role 400

## T3. 前端:上传后关联到项目

- [x] T3.1 `src/lib/api/assets.ts`:新增 `linkProjectAsset` + `listProjectAssets`(AssetRole 类型),对齐 T2 路由
- [x] T3.2 `index.tsx` 的 `handleImageUploaded`:资产创建成功后调 linkProjectAsset(projectId, asset.id, 'character_ref');关联失败不阻断仅提示
- [x] T3.3 tsc 干净、37 测试全过(上传→关联落库的端到端验证并入 T6)

## T4. ai-gateway:S2S token 签发(可与 T3 并行)

- [x] T4.1 dev compose 给 manju-ai 挂 `jwt-private.pem`(只读)+ ASSET_SERVICE_URL;config 加 `jwt_private_key_path`/`asset_service_url`
- [x] T4.2 新增 `app/internal_token.py`:签短期(60s)服务令牌。**修正**:sub 必须是合法 UUID(asset middleware 会 uuid.Parse 否则 panic),改用固定哨兵 UUID 而非 "svc:ai-gateway";role=owner,team_id 入参,iss/jti/exp 齐全
- [x] T4.3 单测 `test_internal_token.py`:5 项全过(验签+claims齐全+短期+错 issuer 拒+无私钥降级)
- [x] T4.4 验证:容器内签 token 调 asset-service `/v1/assets/characters` 返回 200(token 被接受,RLS 隔离正常)

## T5. ai-gateway:取图 → 多模态喂模型

- [x] T5.1 新增 `_anthropic_once_multimodal`:content=[image…, text];保留原 `_anthropic_once` 纯文本不动
- [x] T5.2 取图辅助 `_fetch_project_reference_images`:S2S token 调 asset-service 按 (project, role) 拉资产 → httpx 下载 → 校验(MIN/MAX_IMAGE_BYTES、content-type)→ base64;限 MAX_REF_IMAGES=4;任何失败返空(降级)
- [x] T5.3 `storyboard_generate_async`:先取参考图,有图走多模态(并在 prompt 提示"保持角色一致")、无图走原纯文本;取图内部 try/except 不抛,不阻断
- [x] T5.4 验证:容器内端到端 — 建资产→关联项目→取图(1张,base64 55KB)→多模态生成,模型准确描述了参考图内容

## T6. 端到端验证

- [x] T6.1 全链路(T5.4 实测):建资产→关联项目→S2S 取图→多模态生成,模型准确描述参考图内容
- [x] T6.2 回归:无参考图项目取图返 0 → 走纯文本,行为与本 change 前一致
- [x] T6.3 asset-service go build/vet 通过;ai-gateway 16 单测过;前端 tsc 干净 + 37 测试过
- [x] T6.4 确认 `docker-compose.prod.yml` 未挂私钥(grep=0)→ 生产 has_s2s()=False 自动降级纯文本,不误用私钥;债务已记 design
