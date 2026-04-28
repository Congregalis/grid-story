# grid-story

AI 辅助小说创作工具 — 人机共创 + 长篇连载。

## 启动

```bash
cp .env.example .env        # 编辑 .env 填入 API keys
pnpm install                # 安装依赖
docker compose up -d        # 启动 Postgres（pgvector）
pnpm dev:server             # 后端 → :8432
pnpm dev:web                # 前端 → :8433
```

## 技术栈

TS 全栈 · Hono + Drizzle · Vite + React 19 + PixiJS + TipTap · Postgres/pgvector

详见 [STACK.md](STACK.md) · [DESIGN.md](DESIGN.md) · [TASKS.md](TASKS.md)
