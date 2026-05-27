# script-service Makefile
# 依赖: go 1.25+, docker, atlas (https://atlasgo.io), sqlc (https://sqlc.dev)。

.PHONY: help dev test test-unit test-integration migrate sqlc lint build docker-build clean

GO ?= go
ATLAS ?= atlas
SQLC ?= sqlc

DATABASE_URL ?= postgres://manju_app:manju_app@localhost:5432/manju?sslmode=disable
MIGRATE_DATABASE_URL ?= postgres://manju:manju@localhost:5432/manju?sslmode=disable

help: ## 显示所有 target
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## 本地起服务 (依赖 docker compose 已起 pg)
	@DATABASE_URL=$(DATABASE_URL) \
		JWT_PUBLIC_KEY_PATH=$(CURDIR)/../../scripts/dev/secrets/jwt-public.pem \
		JWT_ISSUER=manju-auth \
		HTTP_ADDR=:8003 \
		CORS_ORIGINS=http://localhost:5173,http://localhost:5174 \
		$(GO) run ./cmd/server

test: test-unit test-integration ## 跑全部测试

test-unit: ## 单元测试 (不需要 docker)
	$(GO) test -race -count=1 -short ./internal/...

test-integration: ## 集成测试 (testcontainers 起 pg)
	$(GO) test -race -count=1 -timeout 8m ./tests/integration/...

migrate: ## 应用迁移到本地 pg (需 atlas binary)
	DATABASE_URL=$(MIGRATE_DATABASE_URL) $(ATLAS) migrate apply --env local

migrate-hash: ## 锁迁移目录 (写新迁移后必跑)
	DATABASE_URL=$(MIGRATE_DATABASE_URL) $(ATLAS) migrate hash --env local

sqlc: ## 从 queries/*.sql + migrations/*.sql 生成 Go
	$(SQLC) generate

lint: ## 静态检查
	$(GO) vet ./...

build: ## 编译可执行
	CGO_ENABLED=0 $(GO) build -trimpath -ldflags '-s -w' -o bin/script-service ./cmd/server

docker-build: ## 构建镜像
	docker build -t manju/script-service:dev .

clean:
	rm -rf bin dist
	$(GO) clean -testcache
