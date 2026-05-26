# --- build stage ---
FROM node:22-alpine AS builder

WORKDIR /src

# 装 pnpm
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate

COPY package.json ./
RUN pnpm install --no-frozen-lockfile --prod=false --ignore-scripts

COPY tsconfig*.json ./
COPY src ./src
RUN pnpm build

# --- runtime stage ---
FROM node:22-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.3.0 --activate

COPY package.json ./
RUN pnpm install --prod --no-frozen-lockfile --ignore-scripts && pnpm store prune

COPY --from=builder /src/dist ./dist

USER node
EXPOSE 8004
ENTRYPOINT ["node", "dist/index.js"]
