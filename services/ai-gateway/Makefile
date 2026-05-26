.PHONY: dev test lint docker-build

dev:
	uvicorn app.main:app --reload --port 8005

test:
	pytest tests/

lint:
	ruff check app/

docker-build:
	docker build -t manju/ai-gateway:dev .
