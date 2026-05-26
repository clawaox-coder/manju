# render-service Makefile
# 依赖: go 1.25+, docker (worker 镜像内 ffmpeg), atlas, sqlc。

.PHONY: help dev dev-worker test test-unit test-integration migrate sqlc lint build build-worker docker-build docker-build-worker clean

GO ?= go
ATLAS ?= atlas
SQLC ?= sqlc

DATABASE_URL ?= postgres://manju:manju@localhost:5432/manju?sslmode=disable

help: ## 显示所有 target
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## 本地起 HTTP 服务 (依赖 docker compose 已起 pg+minio+kafka)
	@DATABASE_URL=$(DATABASE_URL) \
		JWT_PUBLIC_KEY_PATH=$(CURDIR)/../../scripts/dev/secrets/jwt-public.pem \
		JWT_ISSUER=manju-auth \
		HTTP_ADDR=:8006 \
		S3_ENDPOINT=http://localhost:9000 \
		S3_ACCESS_KEY=manjuadmin \
		S3_SECRET_KEY=manjuadmin \
		S3_BUCKET=manju-renders \
		S3_REGION=us-east-1 \
		KAFKA_BROKERS=localhost:9092 \
		KAFKA_TOPIC_REQUESTED=render.requested \
		CORS_ORIGINS=http://localhost:5173,http://localhost:5174 \
		$(GO) run ./cmd/server

dev-worker: ## 本地起 worker (需要本机有 ffmpeg, 或走 docker compose)
	@DATABASE_URL=$(DATABASE_URL) \
		S3_ENDPOINT=http://localhost:9000 \
		S3_ACCESS_KEY=manjuadmin \
		S3_SECRET_KEY=manjuadmin \
		S3_BUCKET=manju-renders \
		S3_REGION=us-east-1 \
		KAFKA_BROKERS=localhost:9092 \
		KAFKA_TOPIC_REQUESTED=render.requested \
		KAFKA_CONSUMER_GROUP=render-workers \
		WORKER_ID=render-w-local \
		FFMPEG_BIN=ffmpeg \
		WORK_DIR=/tmp/render \
		JWT_PUBLIC_KEY_PATH=/dev/null \
		$(GO) run ./cmd/worker

test: test-unit test-integration ## 跑全部测试

test-unit: ## 单元测试 (不需要 docker)
	$(GO) test -race -count=1 -short ./internal/...

test-integration: ## 集成测试 (testcontainers 起 pg + minio + kafka)
	$(GO) test -race -count=1 -timeout 10m ./tests/integration/...

migrate: ## 应用迁移到本地 pg (需 atlas binary)
	$(ATLAS) migrate apply --env local

migrate-hash: ## 锁迁移目录 (写新迁移后必跑)
	$(ATLAS) migrate hash --env local

sqlc: ## 从 queries/*.sql + migrations/*.sql 生成 Go
	$(SQLC) generate

lint: ## 静态检查
	$(GO) vet ./...

build: ## 编译 service binary
	CGO_ENABLED=0 $(GO) build -trimpath -ldflags '-s -w' -o bin/render-service ./cmd/server

build-worker: ## 编译 worker binary
	CGO_ENABLED=0 $(GO) build -trimpath -ldflags '-s -w' -o bin/render-worker ./cmd/worker

docker-build: ## service 镜像
	docker build -t manju/render-service:dev .

docker-build-worker: ## worker 镜像 (含 ffmpeg)
	docker build -t manju/render-worker:dev -f Dockerfile.worker .

clean:
	rm -rf bin dist
	$(GO) clean -testcache
