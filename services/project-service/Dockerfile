# --- build stage ---
FROM golang:1.25-alpine AS builder

ENV GOPROXY=https://goproxy.cn,direct \
    GOSUMDB=off \
    CGO_ENABLED=0 \
    GOOS=linux

WORKDIR /src

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN go build \
	-trimpath -ldflags '-s -w' \
	-o /out/project-service ./cmd/server

# --- runtime stage ---
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --from=builder /out/project-service /app/project-service

USER nonroot:nonroot
EXPOSE 8002
ENTRYPOINT ["/app/project-service"]
