-- asset-service 0003: project_assets 关联表 (项目 ↔ 资产, 多对多 + role)
-- depends-on: asset-service 0001 (assets 表已存在)
-- see: openspec/changes/project-reference-assets/design.md
--
-- 设计选择:
--   - 多对多关联表, 而非给 assets 加 project_id: 同一资产可被多项目/多用途引用.
--   - role 区分用途 (character_ref | style_ref | script_ref | ...): 后续新增用途
--     只插不同 role 行, 零 schema 变更. 本次只用 character_ref.
--   - project_id 不设 FK: project 归 project-service 库, 跨库不强约束 (与 shots 同理).
--   - team_id 冗余存: RLS 隔离直接用本表 team_id, 不必 join assets.
--   - PK 三元组: 同一图在同一项目同一用途只关联一次, 幂等.

BEGIN;

CREATE TABLE project_assets (
  project_id  uuid        NOT NULL,
  asset_id    uuid        NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  role        varchar(32) NOT NULL,
  team_id     uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, asset_id, role)
);

-- 主查询路径: 按 (project_id, role) 列出参考图
CREATE INDEX idx_project_assets_lookup
  ON project_assets (project_id, role);

-- §6 RLS: team_id 隔离. FORCE 必需 (owner 默认绕过 RLS, 见 0001 头注释).
ALTER TABLE project_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_assets FORCE ROW LEVEL SECURITY;

CREATE POLICY project_assets_team_isolation ON project_assets
  USING (team_id = current_setting('app.team_id', true)::uuid);

COMMIT;
