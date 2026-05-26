# project-service Makefile
# 假设已安装: node 22+, pnpm, docker, atlas

ATLAS ?= atlas
DATABASE_URL ?= postgres://manju:manju@localhost:5432/manju?sslmode=disable
REDIS_URL ?= redis://localhost:6379/1

.PHONY: help dev build start test test-integration typecheck migrate lint docker-build clean

help: ## 显示所有 target
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## 本地起服务 (依赖 docker compose 已起 pg+redis)
	@DATABASE_URL=$(DATABASE_URL) REDIS_URL=$(REDIS_URL) \
		JWT_PUBLIC_KEY_PATH=$(CURDIR)/../../scripts/dev/secrets/jwt-public.pem \
		JWT_ISSUER=manju-auth \
		HTTP_ADDR=:8002 \
		CORS_ORIGINS=http://localhost:5173 \
		pnpm dev

build: ## 编译 TypeScript
	pnpm build

start: build ## 编译后启动
	@DATABASE_URL=$(DATABASE_URL) REDIS_URL=$(REDIS_URL) \
		JWT_PUBLIC_KEY_PATH=$(CURDIR)/../../scripts/dev/secrets/jwt-public.pem \
		JWT_ISSUER=manju-auth \
		HTTP_ADDR=:8002 \
		pnpm start

test: ## 集成测试 (testcontainers 起 pg)
	pnpm test

typecheck: ## 类型检查
	pnpm typecheck

migrate: ## 应用迁移到本地 pg (需要 atlas)
	DATABASE_URL=$(DATABASE_URL) $(ATLAS) migrate apply --env local

lint: ## lint
	pnpm exec tsc --noEmit

docker-build: ## 构建镜像
	docker build -t manju/project-service:dev .

clean: ## 清理
	rm -rf dist node_modules/.cache
