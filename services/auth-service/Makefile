# auth-service Makefile
# 假设已安装: go 1.22+, docker, atlas (https://atlasgo.io), sqlc (https://sqlc.dev).

.PHONY: help dev test test-unit test-integration migrate sqlc lint build docker-build clean

GO ?= go
ATLAS ?= atlas
SQLC ?= sqlc

# 本地 DSN (与 scripts/dev/docker-compose.yml 对齐)
DATABASE_URL ?= postgres://manju_app:manju_app@localhost:5432/manju?sslmode=disable
MIGRATE_DATABASE_URL ?= postgres://manju:manju@localhost:5432/manju?sslmode=disable
REDIS_URL ?= redis://localhost:6379/0

help: ## 显示所有 target
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## 本地起服务 (依赖 docker compose 已起 pg+redis)
	@DATABASE_URL=$(DATABASE_URL) REDIS_URL=$(REDIS_URL) \
		JWT_PRIVATE_KEY_PATH=$(CURDIR)/../../scripts/dev/secrets/jwt-private.pem \
		JWT_PUBLIC_KEY_PATH=$(CURDIR)/../../scripts/dev/secrets/jwt-public.pem \
		HTTP_ADDR=:8001 \
		CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:4173 \
		$(GO) run ./cmd/server

test: test-unit test-integration ## 跑全部测试

test-unit: ## 单元测试 (不需要 docker)
	$(GO) test -race -count=1 -short ./internal/...

test-integration: ## 集成测试 (testcontainers 起 pg+redis)
	$(GO) test -race -count=1 -timeout 5m ./tests/integration/...

migrate: ## 应用迁移到本地 pg (需要 atlas binary)
	DATABASE_URL=$(MIGRATE_DATABASE_URL) $(ATLAS) migrate apply --env local

migrate-hash: ## 锁迁移目录 (写新迁移后必跑)
	DATABASE_URL=$(MIGRATE_DATABASE_URL) $(ATLAS) migrate hash --env local

sqlc: ## 从 queries/*.sql + migrations/*.sql 生成 Go
	$(SQLC) generate

lint: ## 静态检查
	$(GO) vet ./...

build: ## 编译可执行
	CGO_ENABLED=0 $(GO) build -trimpath -ldflags '-s -w' -o bin/auth-service ./cmd/server

docker-build: ## 构建镜像
	docker build -t manju/auth-service:dev .

clean:
	rm -rf bin dist
	$(GO) clean -testcache
