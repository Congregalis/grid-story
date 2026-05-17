# grid-story

> **AI 辅助小说创作工具** — 人机共创 + 长篇连载。
> 把角色 / 设定 / 钩子 / 因果建模成可推演的状态，让剧情**自己长出来**，作者拍板。
> 前端是像素二次元风的纸面手稿。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6.svg)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-4.6-orange.svg)](https://hono.dev)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev)

---

## 为什么这个项目存在

写 100 万字的小说不是写 100 个 1 万字短篇——长度不是问题，**人物前后一致 + 设定不打架 + 伏笔有回收**才是。市面上的 AI 写作工具大多停在"扩写一段"或"生成大纲"，到了第 50 章就开始角色失忆、设定打架。

grid-story 把"写小说"拆成三个独立机制：

1. **MemoryWiki**：把已写章节蒸馏成 LLM 自己维护的 markdown wiki，写下一章时按需检索——比 RAG/embedding 更可解释。
2. **StoryEngine**：角色不再是 prompt 的"主角名"，而是带 **Drives / DecisionProfile / Relationship** 的状态机。剧情=场景模拟（不预设走向，让角色按性格做选择，作者选分支）。
3. **MemoryBible**：作者定义的硬约束（世界观、角色档案）和 Wiki（LLM 观察）双轨校验，分歧自动报警。

---

## 8 层架构

```
   ┌─────────────────────────────────────────────────────────────┐
   │  ① 数据层    Postgres + pgvector + filesystem (wiki/storage) │
   │  ② Schema    Zod 共享 (packages/schema) — 前后端单一真相     │
   │  ③ 记忆      MemoryWiki: Ingest / Query / Lint / Snapshot   │
   │  ④ 故事引擎  StoryEngine: SimulationEngine / Director /     │
   │              OffscreenTicker / PacingCritic / HookPool      │
   │  ⑤ Agents    Outline / Writing / Rewrite / Review / Bible   │
   │  ⑥ 编排      ContextComposer (自写, 无 LangChain)           │
   │  ⑦ LLM       ModelRouter — Anthropic + OpenAI 协议族多供应商 │
   │  ⑧ UI        React 19 + TipTap + PixiJS (像素风 chrome)     │
   └─────────────────────────────────────────────────────────────┘
```

---

## 核心特性

### ✍️ Writing Desk
- TipTap 富文本编辑器 + AI 续写 / 选区改写 / 段落级批注
- 实时 diff 视图，AI 输出永远有 `primary-soft` 底标识"机器写的"
- 章节版本控制（git-like）+ 状态机 (draft / review / revised / final / published)

### 🧠 MemoryWiki
- 章节定稿 → 自动蒸馏到 markdown wiki（角色页 / 地点页 / 概念页 / 时间线 / 伏笔追踪）
- 写下一章时按问题选页（两步 LLM：选分类 → 选页面）+ 取原文样本
- Lint 9 项一致性检查（角色矛盾 / 时间线 / 伏笔 / Bible-Wiki 分歧 / inferred 复核）
- 可用 Obsidian 直接打开 `storage/books/{bookId}/wiki/`

### 🎬 StoryEngine
- **SimulationEngine**：给定初始条件（在场角色 / 时间 / 地点 / 外部压力），LLM 产出 primary + ≥2 候选分支，每条带完整 `stateDelta`
- **DirectorPanel**：5 个干预工具（注入事件 / 调环境变量 / 改 Drive / 调关系张力 / 投钩子）—— 只改参数，不直接写文字
- **OffscreenTicker**：章节定稿后自动推演离场角色（tier1 详细 / tier2 批量 / tier3 跳过）
- **PacingCritic**：每章打分（冲突 / 情绪 / 信息密度），连续低冲突触发预警
- **CausalGraph**：每次拍板分支落库因果链，支持影响分析

### 📚 StoryBible
- 6 类实体强 schema（角色 / 地点 / 组织 / 物品 / 时间线 / 概念）
- AI 生成 + per-field 优化 + 关系图可视化
- DecisionProfile / Drive / Relationship / WorldVariable / ChekhovHook 五个 StoryEngine 维度

### 🎨 像素二次元前端
- Fusion Pixel 字体 chrome + Source Han Serif 正文
- 硬边阴影、4px 网格、调色板（靛蓝驱动 AI / 樱桃粉标角色）
- 详见 [`apps/web/DESIGN.md`](apps/web/DESIGN.md)

---

## 快速启动

**前置**：Node 20+、pnpm 9+、Docker。

```bash
# 1. 克隆 + 装依赖
git clone https://github.com/Congregalis/grid-story.git
cd grid-story
pnpm install

# 2. 配 LLM key（至少一家）
cp .env.example .env
# 编辑 .env：ANTHROPIC_API_KEY 或 DEEPSEEK_API_KEY

# 3. 起 Postgres（pgvector）
docker compose up -d postgres

# 4. 跑数据库迁移
pnpm --filter @grid-story/server migrate

# 5. 一键起前后端
pnpm dev
# 后端 → http://localhost:8432
# 前端 → http://localhost:8433
```

打开 http://localhost:8433 ，新建一本书，从立项 → 设定 → 大纲 → 写作走一遍。

---

## 真实场景烟雾测试

不接受 mock —— 直接打真实 LLM，验证 StoryEngine 全链路：

```bash
bash scripts/smoke-story-engine.sh
```

17 步覆盖：建 book → 4 角色（含 importance 分级）→ DecisionProfile / Drive / Relationship / WorldVariable / Hook → 真实 simulate → adopt → finalize → 校验 PacingEvaluation / OffscreenAction / CausalGraph 全部写入。约 30~120s + 真实 token 成本。

---

## 仓库结构

```
grid-story/
├─ apps/
│  ├─ server/   Hono + Drizzle 后端，story-engine / memory-wiki / agents
│  └─ web/      React 19 + Vite + TipTap + PixiJS 前端
├─ packages/
│  ├─ schema/    Zod schema（前后端共享真相）
│  ├─ prompts/   markdown prompt 模板（按 agent / 任务版本化）
│  ├─ llm/       ModelRouter (Anthropic + OpenAI 协议族) + PromptRegistry
│  ├─ composer/  ContextComposer (自写薄编排层)
│  └─ pixel-kit/ 像素 UI 组件库
├─ scripts/      smoke 测试 + seed 工具
└─ docs (各 .md)
```

---

## 文档索引

| 文件 | 内容 |
|---|---|
| [`DESIGN.md`](DESIGN.md) | 产品定位 + 8 层架构 + 模块拆解 |
| [`STACK.md`](STACK.md) | 技术选型与权衡 |
| [`TASKS.md`](TASKS.md) | 任务清单与进度（阶段 0-6） |
| [`STORY-ENGINE.md`](STORY-ENGINE.md) | StoryEngine 详细需求与 schema |
| [`MEMORY-WIKI.md`](MEMORY-WIKI.md) | MemoryWiki 设计与子任务 |
| [`DEVELOPER.md`](DEVELOPER.md) | 工程现状 / 调试技巧 / 排雷 |
| [`CLAUDE.md`](CLAUDE.md) | 硬规则（不要破） |
| [`apps/web/DESIGN.md`](apps/web/DESIGN.md) | 前端设计系统（像素风约束） |

---

## 工程态度

不用 LangChain / Vercel AI SDK / instructor —— `ContextComposer` 自己写，约 300 行，可控、可调、可读。
不用 Qdrant / Weaviate / Pinecone —— Postgres + pgvector 够用，省一个运维对象。
不在 PixiJS 里渲染编辑器 —— Canvas 处理不了中文 IME 和段落选区。
所有 prompt 模板版本化（`packages/prompts/<agent>/<task>.v<n>.md`），不内联进代码。

详见 [`CLAUDE.md`](CLAUDE.md) §6 硬规则。

---

## 当前进度

- ✅ 阶段 0 · 脚手架
- ✅ 阶段 1 · 后端 MVP 闭环（CLI 喂 idea → 出章纲 → 出草稿）
- ✅ 阶段 2 · 前端 MVP + polish
- ✅ 阶段 3 · MemoryWiki + Rewrite / Review / Bible / Feedback
- ✅ 阶段 4 · StoryEngine（Sprint 0-5 全部完成）
- ⏳ 阶段 5 · V2 美术（PixiJS Reader + 立绘 + 发布管线）
- ⏳ 阶段 6 · 平台化（Auth / Billing / Telemetry）

---

## License

[MIT](LICENSE)
