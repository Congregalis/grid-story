# grid-story 技术栈选型

## 总览
**TS 全栈 + 多模型可切 + Postgres 一站式存储**。
单人开发友好、前后端共享 schema、运维只一个 DB。

---

## 前端

| 项 | 选择 | 理由 / 备选 |
|---|---|---|
| 构建 | **Vite + React 18** | 启动快、生态足；备选：Next.js（不需要 SSR，反而拖累） |
| 像素渲染 | **PixiJS v8 + @pixi/react** | 用于 Reader、立绘、装饰、转场 |
| **写作编辑器** | **TipTap v2**（基于 ProseMirror） | DOM 富文本，IME / 选区 / 批注 anchor 都现成；**不要用 PixiJS 写编辑器** |
| diff | `diff-match-patch` 或 `prosemirror-changeset` | TipTap 上做行/段 diff |
| 样式 | **Tailwind** + 像素字体（Fusion Pixel / 缝合像素体） + `image-rendering: pixelated` | 像素风用 CSS 也能实现，不必全压在 PixiJS |
| 状态 | **Zustand** | 单人项目避免 Redux 模板代码 |
| 数据请求 | **TanStack Query** | 缓存、乐观更新、失败重试 |
| 路由 | **TanStack Router** 或 React Router v7 | 二选一，类型安全选前者 |
| 表单 | React Hook Form + Zod | Bible 编辑表单要 Zod 校验 |

## 后端

| 项 | 选择 | 理由 / 备选 |
|---|---|---|
| 运行时 | **Node.js 20+**（或 Bun） | Bun 启动快但生态有边角；Node 稳 |
| 框架 | **Hono** | 轻、类型好、路由快；备选：Fastify（更稳重）、tRPC（类型直通但耦合前端） |
| ORM | **Drizzle** | 类型贴近 SQL、迁移可控；不选 Prisma（生成器拖慢、JSONB 类型差） |
| 校验 | **Zod** | schema 即类型，前后端共享 |
| 任务 | 起步：内置 `setImmediate` 队列<br>规模化：**BullMQ + Redis** | MVP 不需要 Redis 多一个进程 |

## 数据存储

| 项 | 选择 | 理由 |
|---|---|---|
| 主库 | **Postgres 16** | 关系 + JSONB（Bible.notes）+ 全文检索 + pgvector |
| 向量 | **pgvector** 扩展 | 同库省运维；百万级向量内够用 |
| 文件 | MVP：本地 `fs`<br>生产：**Cloudflare R2 / MinIO**（S3 兼容） | 像素素材、章节归档 |
| 章节版本 | DB 行存（带 `version` 字段 + 父版本指针），**不**额外起 Git | 章节 50KB 量级，行存最简单 |
| 部署 DB | 本地 Docker Compose；生产 **Neon** 或 **Supabase**（自带 pgvector） | |

## LLM 集成

| 项 | 选择 | 理由 |
|---|---|---|
| Anthropic | **`@anthropic-ai/sdk`** 原生 | 提示缓存、扩展思考都能用上 |
| Deepseek / 其他 | **`openai` SDK 改 baseURL** | Deepseek 兼容 OpenAI 协议；OpenRouter 同理 |
| ModelRouter | **自写薄封装**（约 300 行） | 不用 LangChain / Vercel AI SDK；保留对 prompt cache、stop、stream 的全控制 |
| Embedding | **OpenAI `text-embedding-3-small`** | 便宜、效果好；备选本地 BGE-M3 |
| Prompt 缓存 | Anthropic 原生 cache_control | 设定库切片做 ephemeral 缓存命中率高 |
| 流式 | SSE（前端 EventSource）or fetch streaming | TipTap 接收 token-by-token 更新 |

## Prompt 模板

| 项 | 选择 | 理由 |
|---|---|---|
| 格式 | **Markdown + 简单 `{{var}}` 替换** | 不引模板引擎依赖 |
| 存储 | `prompts/<agent>/<task>.v<n>.md` 文件 | 版本号即文件名，git 即历史 |
| Registry | 启动时扫描目录加载 + 内存缓存 | |

## 工程化

| 项 | 选择 | 理由 |
|---|---|---|
| Monorepo | **pnpm workspace** | 不引 Turborepo 复杂度；前后端共享 `packages/schema`（Zod 定义） |
| Lint/Format | **Biome** | 一个工具替 ESLint + Prettier，更快 |
| 测试 | **Vitest** + Playwright（E2E） | TipTap、PixiJS 都需要 E2E 验证体验 |
| 类型 | TS strict | |
| 环境变量 | dotenv + Zod 校验 | 启动时 fail-fast |
| 容器 | Docker Compose（Postgres + 后端 + 前端 dev） | |

## 部署形态

| 阶段 | 方案 |
|---|---|
| MVP（本地） | Docker Compose 跑 Postgres，前后端各 dev server |
| V1（自用上线） | 前端 Cloudflare Pages，后端 Fly.io / Railway，DB Neon |
| V2（多用户） | 加 Auth（Clerk 或 Lucia）+ R2 资产 + Telemetry（Axiom） |

---

## 仓库结构建议

```
grid-story/
├── apps/
│   ├── web/              # Vite + React + PixiJS + TipTap
│   └── server/           # Hono + Drizzle
├── packages/
│   ├── schema/           # Zod schema（Bible / Outline / Chapter）— 前后端共享
│   ├── llm/              # ModelRouter + Provider 封装
│   ├── prompts/          # *.md prompt 模板
│   └── pixel-kit/        # 像素 UI 组件 + 美术规范
├── docker-compose.yml    # Postgres
├── DESIGN.md
├── TASKS.md
└── STACK.md
```

---

## 三条容易踩的坑

1. **不要用 PixiJS 做写作编辑器**。IME / 选区 / 批注全做不动，会把 T2.4 拖到几周。文本框用 TipTap，外层装饰才用 PixiJS。
2. **不要起步就引 LangChain / Vercel AI SDK**。Composer 是系统心脏，必须自己掌控 prompt 拼装、缓存、流式。第三方抽象会挡路。
3. **不要先上 Qdrant 等独立向量库**。pgvector 在百万向量内毫无瓶颈，运维成本却差一个数量级。
