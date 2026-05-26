# --- build stage ---
FROM golang:1.25-alpine AS builder

# 国内 GOPROXY 防 GFW; GOSUMDB=off 避开 sum.golang.org.
ENV GOPROXY=https://goproxy.cn,direct \
    GOSUMDB=off \
    CGO_ENABLED=0 \
    GOOS=linux

WORKDIR /src

# 缓存依赖
COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN go build \
	-trimpath -ldflags '-s -w' \
	-o /out/auth-service ./cmd/server

# --- runtime stage ---
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --from=builder /out/auth-service /app/auth-service

USER nonroot:nonroot
EXPOSE 8001
ENTRYPOINT ["/app/auth-service"]
