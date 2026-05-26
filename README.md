# 漫剧AI Studio

```yaml
project:     manju-ai-studio
purpose:     AI 短剧创作平台. 剧本 → 分镜 → 视频 全流程 AI 辅助.
status:      frontend-shipped, backend-not-started
root:        /Users/aox/manju
docs:        /Users/aox/manju/docs  (agent 文档, 见 docs/INDEX.md)
audience:    AI 智能体开发者
```

## 启动

```bash
cd /Users/aox/manju
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc -b && vite build
```

## 技术栈快照

```yaml
frontend:
  framework:   react@19 + typescript@6
  build:       vite@8
  styling:     tailwindcss@4 (CSS-first config in src/index.css)
  state:       zustand@5 + persist
  router:      react-router@6
  ui:          shadcn/ui (Radix primitives)
  motion:      framer-motion@12
  dnd:         @dnd-kit
  icons:       lucide-react

backend (planned):
  api:         go + node
  ai-gateway:  python + fastapi
  rdb:         postgresql@16 (+ RLS)
  cache:       redis@7
  doc-store:   mongodb@7
  queue:       kafka@3
  storage:     s3 / aliyun-oss
  search:      meilisearch
  collab:      websocket + yjs (CRDT)
```

## 目录

```
src/
├── app/              # App, Router, ErrorBoundary
├── components/
│   ├── layout/       # AppShell, Header, Sidebar, ThemeToggle, ShortcutsOverlay
│   ├── ui/           # shadcn 原语 (17 个)
│   └── domain/       # 业务组件 (ProjectCard 等)
├── pages/            # 21 页面 (lazy)
├── hooks/            # useShortcuts, useConfirm, useTheme
├── store/            # zustand
├── data/mock.ts      # 本地 mock (将被 API 替换)
├── lib/              # utils, lazyWithRetry
├── types/            # 全部领域 TS 类型
└── index.css         # tailwind + design tokens

docs/                 # AI agent 友好文档
├── INDEX.md          # 文档总入口, 必读
├── prd.md            # 产品需求
├── architecture.md   # 技术架构
├── api.md            # API 规范
├── database.md       # 数据库 schema + DDL
├── design-system.md  # UI/UX 规范 + token
├── coding-standards.md
├── test-plan.md
├── deploy.md
├── security.md
└── project-plan.md
```

## Agent 首读路径

```yaml
step-1: 读 docs/INDEX.md     # 5 分钟, 拿到文档地图
step-2: 根据任务关键词查 §3 任务到文档映射
step-3: 加载选中的 docs/*.md
step-4: 开始工作
```

## 全局快捷键 (实现位于 src/hooks/useShortcuts.ts)

```yaml
"Ctrl+K":    focus-search
"Ctrl+N":    new-project-dialog
"Ctrl+S":    save (mock toast)
"?":         shortcuts-overlay
"Esc":       close-modal-or-overlay
"Space":     play-pause (in /video)
"ArrowLeft": prev-shot
"ArrowRight":next-shot
"j":         seek -2s
"l":         seek +2s
```

## License

Proprietary. © 星辰工作室.
