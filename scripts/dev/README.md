# scripts/dev — 本地开发栈

## 起服务

```bash
cd scripts/dev
cp .env.example .env.local       # 一次性
./jwtgen.sh                      # 生成 secrets/jwt-{private,public}.pem
docker compose up -d
```

## 服务清单

| 服务 | 端口 | 备注 |
|---|---|---|
| postgres-16 | 5432 | db=manju, user=manju (SUPERUSER, atlas migration 用), 业务用 manju_app |
| redis-7 | 6379 | |
| minio | 9000 / 9001 | s3 api / 控制台 |
| kafka | 9092 / 9094 | 容器内 / host 回环, KRaft 单节点 |
| auth-service | 8001 | |
| project-service | 8002 | |
| script-service | 8003 | |
| asset-service | 8004 | |
| ai-gateway | 8005 | python+fastapi |
| render-service | 8006 | |
| render-worker | (kafka consumer) | jrottenberg/ffmpeg base, 内置 ffmpeg |

## RLS 与数据库 role 模型

`scripts/dev/initdb/01-app-role.sql` 建非 owner role `manju_app`,
所有 service 运行 DSN 走 `manju_app:manju_app@`. `manju` 保留 SUPERUSER
身份给 atlas migration 用.

**为什么**: docker postgres 默认 user (manju) 是 SUPERUSER, 直接绕过 RLS,
导致 dev 实测时 RLS 看似生效实际失效, leak 隐患. 切到 manju_app 后, RLS
策略真正起作用 (跨 team GET 返 404, list 返 0 项).

`/docker-entrypoint-initdb.d/*.sql` 仅在 fresh data 目录首次启动时跑.
若 `data/pg/` 已有数据, init script 不会触发. 这时手动跑一次:

```bash
docker exec -i manju-postgres psql -U manju -d manju < initdb/01-app-role.sql
```

幂等, 重跑无害.

## Makefile DSN 约定

各 service Makefile 里两个变量:

| 变量 | 默认值 | 用途 |
|---|---|---|
| `DATABASE_URL` | `manju_app:manju_app@localhost:5432/manju` | runtime (`make dev`, `make test-integration`) |
| `MIGRATE_DATABASE_URL` | `manju:manju@localhost:5432/manju` | atlas migration (`make migrate`, `make migrate-hash`) |

## 数据卷

`./data/{pg,redis,minio,kafka}` — 已 gitignore.
重置全部本地数据:

```bash
docker compose down
rm -rf data
docker compose up -d
```

## kafka topic

`render.requested` 16 partition, ack=all, key=team_id. 第一次 POST /v1/render
若撞 "Unknown Topic Or Partition", 手动建一次 (auto-create 元数据传播延迟):

```bash
docker exec manju-kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --topic render.requested --partitions 16 --replication-factor 1 --if-not-exists
```

m2 在 render-service 启动时改用 admin client 显式 CreateTopic, 一次解决.
