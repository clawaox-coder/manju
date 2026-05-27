-- pg init script (scripts/dev/initdb/01-app-role.sql)
--
-- docker postgres 镜像约定: /docker-entrypoint-initdb.d/*.sql 在 fresh data 目录
-- 首次启动时自动跑. 已存在的 data/pg 不会触发 — 那时需手动 psql 跑一次 (见 README).
--
-- 为什么要这个: docker-compose pg 默认 user (manju) 是 SUPERUSER, 而 SUPERUSER
-- 直接绕过 RLS, 导致 dev 实测 RLS 看似生效实际失效, 容易留 leak 漏到 prod.
-- T-006/T-007/T-008/T-009/T-010 e2e 时观察到此问题. 修法 (与各 service 集成测试
-- helpers 同套):
--   - 建非 owner 业务 role `manju_app` + GRANT 表权限
--   - 各 service 运行 DSN 切到 manju_app
--   - manju 保持 SUPERUSER (用于 atlas migration), atlas 仍以 manju 身份跑
--
-- 幂等: 用 DO $$ ... EXCEPTION 包 CREATE ROLE, 重跑不报错.
-- 注意: GRANT ON ALL TABLES 仅对**当前已存在**的表生效. 之后建的新表 (例如新
-- service migration) 还需手动 GRANT, 或靠 ALTER DEFAULT PRIVILEGES 让 manju 后续
-- 建的表/序列/函数自动给 manju_app 读写权限.

DO $$ BEGIN
  CREATE ROLE manju_app WITH LOGIN PASSWORD 'manju_app';
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE manju_app WITH LOGIN PASSWORD 'manju_app';
END $$;

GRANT USAGE ON SCHEMA public TO manju_app;

-- 现有表/序列/函数权限 (init 时表还没建, 这两条主要兜手动重跑场景)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO manju_app;
GRANT USAGE                          ON ALL SEQUENCES IN SCHEMA public TO manju_app;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA public TO manju_app;

-- 之后 atlas migration 由 manju 跑, 默认权限自动给 manju_app
ALTER DEFAULT PRIVILEGES FOR ROLE manju IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO manju_app;
ALTER DEFAULT PRIVILEGES FOR ROLE manju IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO manju_app;
ALTER DEFAULT PRIVILEGES FOR ROLE manju IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO manju_app;
