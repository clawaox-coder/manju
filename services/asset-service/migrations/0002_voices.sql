-- asset-service 0002: 补 voice 类型 (T-009 ai-gateway 切片同步引入)
-- depends-on: asset-service 0001 (asset_type enum 已存在)
--
-- PG 12+ 支持事务内 ADD VALUE, 但**不能在同事务内立即使用新值**.
-- atlas 默认逐条 statement 跑, 不会在同事务里用, 安全.
-- IF NOT EXISTS 让重复跑幂等.

ALTER TYPE asset_type ADD VALUE IF NOT EXISTS 'voice';
