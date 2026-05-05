# grid-story 开发者指南

> 这份文档面向接手 / 共建本仓库的工程师。产品级架构与设计原则见 [`DESIGN.md`](./DESIGN.md)，硬规则见 [`CLAUDE.md`](./CLAUDE.md)，技术选型见 [`STACK.md`](./STACK.md)。

---

## 仓库结构速览

```
grid-story/
├─ apps/
│  ├─ server/   Hono + Drizzle 后端
│  └─ web/      React + Vite + TipTap + PixiJS 前端
├─ packages/
│  ├─ schema/    Zod schema（前后端共享）
│  ├─ prompts/   markdown prompt 模板（按 agent / 任务版本化）
│  ├─ llm/       ModelRouter + PromptRegistry
│  ├─ composer/  ContextComposer
│  └─ pixel-kit/ 像素 UI 组件库
└─ scripts/      命令行工具（seed 等）
```

---

## MemoryWiki 模块

> 完整设计与原子任务清单见 [`MEMORY-WIKI.md`](./MEMORY-WIKI.md)。本节聚焦工程现状与调试技巧。

### 1. 架构与位置

后端模块路径 `apps/server/src/memory-wiki/`：

| 子模块 | 职责 |
|--------|------|
| `wiki-store.ts`       | Markdown 文件存储、staging 事务、原子 rename、滚动 `.bak` 备份（hardlink）、`wiki-history.jsonl` |
| `wiki-schema.ts`      | 模板渲染 + frontmatter 解析（gray-matter）+ 宽松校验 |
| `prose-sampler.ts`    | 从 Chapter 表按角色 / 章号取原文片段 |
| `ingest-pipeline.ts`  | 章定稿 → 章摘要 → 抽取 → 实体页合并 → tracking 确定性更新 → global → 索引 → 日志 → 原子提交 |
| `query-navigator.ts`  | 写作前的两步选页（分类 → 页面）+ 原文样本 + 分歧检测 → ContextBlocks |
| `lint-runner.ts`      | 一致性检查（角色矛盾 / 时间线 / 伏笔 / 死链 / inferred 复核 / author-note 完整性 / Bible-Wiki 分歧），增量 skip |
| `chapter-store.ts`    | DrizzleChapterStore：抽象 ingest 所需的章数据访问 |
| `events.ts`           | Bible 实体变更事件总线 |

`packages/schema/src/wiki.ts` 给出**所有跨边界类型**：`page_type` 枚举、frontmatter schema、`ExtractedInfo`、`MergeResult`、`ContextBlocks`、`WikiQueryContext`、`WikiLintResult` 等。

`packages/prompts/memory-wiki/` 下放着所有 LLM 模板：`ingest-extract.v1.md`、`ingest-merge-entity.v1.md`、`ingest-update-global.v1.md`、`query-select-categories.v1.md`、`query-select-pages.v1.md`、`lint-character.v1.md`、`lint-timeline.v1.md`、`lint-inferred-review.v1.md`。

### 2. 数据落点

每本作品的 wiki 都在 `{STORAGE_ROOT}/books/{bookId}/wiki/` 下，结构：

```
wiki/
├─ index/              总目录 + 分类索引
├─ entities/           characters / locations / organizations / items
├─ chapters/           ch-{N}.md / vol-{N}.md / global.md
├─ concepts/
├─ tracking/           timeline / foreshadowing / loose-threads / divergences-pending / redirects / lint/*
├─ .staging/{run-id}/  Ingest 临时区，提交后清空
├─ .bak/{ts}/          滚动 hardlink 备份（默认 30 份）
├─ .meta/lint-state.json
└─ wiki-history.jsonl  机器可读的 ingest / rollback 增量日志
```

`STORAGE_ROOT` 默认 `./storage`（环境变量可改）。Wiki 是文件系统里的 markdown 文件，可直接用 Obsidian / VS Code 打开。

### 3. 触发链

```
WorkflowEngine.onChapterFinalized
  └─> IngestPipeline.run({ bookId, chapterId })
        ├─ Summarizer / extract（Haiku 类小模型）
        ├─ mergeEntityPages（每个受影响实体页一次 LLM）
        ├─ updateTrackingDeterministic（无 LLM，从抽取的 JSON 直接生成表格）
        ├─ updateGlobalAndIndices
        └─ commitStaging（写 .bak、原子 rename、追加 history.jsonl）

BibleStudio.entityCreated/updated
  └─> emit "entity.created" / "entity.updated"
        └─> IngestPipeline.createEntityPageIfMissing

WritingAgent / OutlineAgent / RewriteAgent / ReviewAgent
  └─> QueryNavigator.query({ bookId, context })
        ├─ 选分类 → 选页面（两步 LLM）
        ├─ ProseSampler.sample 取近期原文
        └─ 组装 ContextBlocks（wiki + prose + divergences）

LintRunner.run（定时 / 手动 /lint 接口）
  └─ 增量 skip + 9 项检查 → tracking/lint/report-{date}.md
```

### 4. 后端 API

所有路由统一前缀 `/api/books/:bookId/wiki/...`，定义在 `apps/server/src/routes/wiki.ts`：

| 方法   | 路径                               | 说明 |
|--------|------------------------------------|------|
| POST   | `/wiki/ingest`                     | 手动触发 ingest |
| POST   | `/wiki/query`                      | 拼装写作上下文（wiki + prose + divergences） |
| GET    | `/wiki/prose-samples`              | 仅取原文样本 |
| GET    | `/wiki/divergences`                | 待处理分歧列表 |
| POST   | `/wiki/divergences/:id/resolve`    | 处置分歧（accept-new / keep-bible / patch-prose） |
| POST   | `/wiki/lint`                       | 触发 lint，可加 `?force=true` |
| GET    | `/wiki/lint/reports`               | lint 报告列表 |
| GET    | `/wiki/history`                    | 读 wiki-history.jsonl |
| POST   | `/wiki/rollback/:runId`            | 回滚到指定 ingest 提交前 |
| GET    | `/wiki/index`                      | 总目录 |
| GET    | `/wiki/index/:category`            | 分类索引（characters / locations / ...） |
| GET    | `/wiki/log`                        | 活动日志 |
| GET    | `/wiki/pages`                      | 列页面 + frontmatter（可加 `?dir=entities/characters`） |
| GET    | `/wiki/page/<rel-path-or-id>`      | 单页详情；先按路径直读，失败再走 `resolveLink`（按 `bible_entity_id` / slug / redirects 解析） |
| GET    | `/wiki/search?q=...`               | 全文 grep（每页最多 3 行高亮，最多 50 个命中） |

### 5. 前端

WikiBrowser 入口：`/books/:bookId/wiki`（`apps/web/src/pages/WikiBrowser.tsx`）。三栏布局：

- **左**：`WikiIndex` 按分类（角色 / 地点 / 组织 / 物品 / 概念 / 章节 / 追踪）展示，自带名称过滤。
- **中**：`WikiPageView`，`react-markdown` + `remark-gfm` 渲染，含：
  - `[[wikilink]]` → 内部跳转
  - 出处标签 `[ch-N]` `[ch-N: implied]` `[ch-N: inferred]` `[bible]` 按可信度高亮成不同颜色块
  - `<!-- author-note start -->...<!-- author-note end -->` 块整体抽出，用樱桃粉边框 + 角标突出
  - frontmatter 信息栏（slug、bible、首/末出场、状态、updated）
- **右**：搜索 + 工具 / 分歧 / Lint / 历史 / 图谱 五个 tab。

实体关系图 `WikiGraph` 是基于 wikilink 提取出的同心圆布局 SVG（按角色 / 地点 / 组织 / 物品 / 概念分环），节点点击跳页。

入口：导航栏 `Wiki` 按钮、`WritingDesk` 顶栏 `📖 Wiki`、`BibleStudio` 实体编辑栏 `📖 Wiki`（用 `bible_entity_id` 解析跳页）。

### 6. 调试技巧

- **触发一次 ingest 而不必走完整 workflow**：`POST /api/books/:bookId/wiki/ingest { chapterId }`。
- **看 wiki 的实际状态**：`ls -R storage/books/<bookId>/wiki/`，或在前端 WikiBrowser 浏览。
- **查看历史 / 回滚**：右栏 "历史" tab 或直接读 `wiki-history.jsonl`；回滚即从 `.bak/{ts}/` swap 回主目录。
- **lint 跳过不工作？**检查 `.meta/lint-state.json` 的 `last_lint_at`；用 `?force=true` 强制跑。
- **wikilink 解析失败**：先核对页面 frontmatter 的 `bible_entity_id`、`slug`，再看 `tracking/redirects.md`。
- **某条 fact 出处看着不对**：`[inferred]` 是 LLM 脑补，`[implied]` 是潜台词，`[ch-N]` 默认是 `[explicit]`；运行 lint 让 `lint-inferred-review` 复核。
- **prompt 改动调试**：所有模板按 `packages/prompts/<agent>/<task>.v<n>.md` 版本化，通过 `PromptRegistry` 加载。改 prompt 不需要重启即可生效。

### 7. 测试

```bash
pnpm -r test --run    # 全量
pnpm --filter @grid-story/server test --run -- memory-wiki   # 仅 ingest/query/lint 单测
pnpm --filter @grid-story/server test --run -- routes/__tests__/wiki   # 路由
```

E2E（建 book → 写章 → 定稿 → ingest → query）目前以 dev seed + 手动触发为主，自动化端到端测试见 Sprint 5 收尾任务。

---

## 像素风格约束（前端）

详见 [`apps/web/DESIGN.md`](./apps/web/DESIGN.md)。两条会被新模块踩坑的红线：

1. **永远不在正文里用像素字**。`WikiPageView` 的正文都是衬体，只有 chrome（按钮、tag、标题）才是 Fusion Pixel。
2. **阴影只用硬边**（`shadow-pixel-1` / `pixel-2` / `pixel-3`），任何 `box-shadow: ... blur > 0` 或 `backdrop-filter` 都会破坏颗粒感。
