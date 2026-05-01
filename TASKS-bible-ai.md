# TASKS · BibleStudio AI 扩展

> 本任务清单覆盖 T2.3 的扩展：
> 1. **BibleEntityEditor 改成 schema-driven**，支持全 6 类 Bible entity（角色 / 地点 / 组织 / 物品 / 时间线 / 概念）
> 2. **每类 entity 独立的 AI 生成**：用户输入一句话 → AI 产出对应类型的结构化字段
> 3. **AI refine 对话**：用户继续描述 / 指出不满，AI 在当前字段基础上修改
> 4. **作品核心（Story Charter）注入全链路**：把"世界观/时代/主题/视角/基调/硬规则/反约束/脑洞"作为系统级约束，所有 agent 调用都带上
>
> **进度规则**：每完成一项把 `[ ]` 改成 `[x]`。全部勾满后合入主 `TASKS.md` 的 T2.3 备注，本文件删除。

---

## 执行顺序与理由

1. **Phase A**（已完成）：后端 BibleAgent + prompt 模板，prompt 调试是这批活里最不可控的一步，先趟过。
2. **Phase B**（已完成）：前端 BibleEntityEditor schema-driven，与 A 解耦推进。
3. **Phase C**（新增，下一步做）：Book + Story Charter 基础设施。Charter 作为 ContextComposer 的新输入槽位，所有 agent 自动吃到，不改 agent 代码。**这是 Phase D 真正想要的能力前提**。
4. **Phase D**（原 C）：AI 对话 dialog —— 现在天然带 Charter 上下文。
5. **Phase E**（原 D）：端到端 + 收尾。

---

## Phase A — 后端 BibleAgent + Prompt

### A.1 Agent 与路由
- [x] 新建 `apps/server/src/agents/bible-agent.ts`
- [x] 方法 `generateEntity(type, description, ctx)` —— 出完整 entity 字段，zod 校验，失败重试 1 次
- [x] 方法 `refineEntity(type, current, feedback, ctx)` —— 同上，输入带当前 entity state
- [x] 路由 `POST /agent/bible/generate`（body: `{ bookId, entityType, description }`）
- [x] 路由 `POST /agent/bible/refine`（body: `{ bookId, entityType, current, feedback }`）
- [x] 在 `apps/server/src/index.ts` 装配 BibleAgent（注入 ContextComposer + ModelRouter）

### A.2 Prompt 模板（`packages/prompts/bible-agent/`）
- [x] `generate-character.v1.md` —— 强调 flaw / motivation / contradiction
- [x] `generate-location.v1.md` —— 强调氛围 / 历史 / 重要性
- [x] `generate-organization.v1.md` —— 强调权力结构 / 目标 / 内部张力
- [x] `generate-item.v1.md` —— 强调来源 / 能力 / 隐喻
- [x] `generate-timeline-event.v1.md` —— 强调因果 / 关联角色与地点
- [x] `generate-concept.v1.md` —— 强调规则 / 边界 / 例子
- [x] `refine.v1.md`（共用） —— JSON-merge 风格，未提及字段保持不变

### A.3 验证
- [x] curl 各类 entity generate 一遍（6 次），输出经 zod 校验通过
- [x] curl refine 至少 2 次，验证未提及字段稳定保持
- [x] 可选：把上述 7 次调用补进 `scripts/smoke.sh`

---

## Phase B — 前端 BibleEntityEditor

### B.1 Config DSL
- [x] 新建 `apps/web/src/features/bible/entity-config.ts`
- [x] 定义 `FieldType`：`text` / `textarea` / `select` / `csv` / `entity-ref` / `entity-ref-multi` / `number`
- [x] 写 6 份 `EntityConfig`，字段映射到 packages/schema
- [x] 工厂 `emptyValues(bookId)` 返回各字段的默认值（数组 → `[]`、可空 → `null`）

### B.2 渲染器
- [x] 新建 `apps/web/src/features/bible/BibleEntityEditor.tsx`，按 config 渲染
- [x] 新建 `apps/web/src/features/bible/EntityRefPicker.tsx`，小弹窗从同 book 已有列表选 id

### B.3 BibleStudio 集成
- [x] BibleStudio 移除 hard-code character 路径，改为读取当前 tab 的 EntityConfig
- [x] 6 个 tab 全部 enabled，url 用 `?type=character` 等记录
- [x] 删除旧 `CharacterEditor.tsx`
- [x] `RelationshipGraph` 仅在 character tab 下显示
- [x] 列表 trailing 文案按 entity type 适配（不再永远显示「关系数」）

### B.4 验证
- [x] 6 类 entity 都能 手工 create / edit / delete 通
- [x] entity-ref 引用的 id 被删除后，UI 显示原始 id（不挂掉）
- [x] `pnpm --filter @grid-story/web typecheck` 通过

---

## Phase C — Book + Story Charter 基础设施（新增）

### C.1 Book 表 & CRUD（先补这个长期欠债）
- [x] 新建 `apps/server/src/db/book-tables.ts`：`books` 表（id, title, author, genre, style, targetWordCount, status, notes, createdAt, updatedAt）
- [x] migration 脚本（`pnpm --filter @grid-story/server migrate` 走通）
- [x] 新建 `apps/server/src/routes/book.ts`：`GET /book` 列表、`GET /book/:id`、`POST /book`、`PUT /book/:id`、`DELETE /book/:id`
- [x] 在 `apps/server/src/index.ts` 注册 `/book` 路由

### C.2 Story Charter schema 扩展
- [x] `packages/schema/src/book.ts` 在 `bookSchema` 加 8 字段：
  - [x] `worldview: z.string().nullable()` —— 世界观
  - [x] `era: z.string().nullable()` —— 时代
  - [x] `themes: z.array(z.string())` —— 核心思想（多）
  - [x] `hook: z.string().nullable()` —— 脑洞 / 高概念
  - [x] `pov: z.string().nullable()` —— 视角约束
  - [x] `tone: z.string().nullable()` —— 基调
  - [x] `rules: z.array(z.string())` —— 用户硬规则
  - [x] `avoid: z.array(z.string())` —— 反约束（绝不出现）
- [x] DB schema 同步加列（jsonb for arrays），migration
- [x] `createBookInput` / `updateBookInput` 自动同步（zod omit 派生即可）
- [x] `packages/schema` 单测覆盖：合法 charter 通过；空 charter（全 null + 空数组）也通过

### C.3 ContextComposer 注入 Charter
- [x] `apps/server/src/db/queries.ts` 加 `fetchBookCharter(bookId)` —— 从 books 表拉 charter 字段（不存在时返回空 charter，不报错）
- [x] `ContextComposer.compose()` 增 `charter` 槽位
- [x] 渲染逻辑：空字段优雅降级（`worldview` 为空时整段不出现，避免 prompt 出现 "世界观：未填"）
- [x] 现有 BibleAgent / OutlineAgent / WritingAgent 的 prompt 模板升级到 v2，**顶部加固定 charter 块**（参考下面模板）；v1 文件保留不删，PromptRegistry 默认走 v2
- [x] charter 块用 cache_control 标记（Anthropic）—— charter 极少变，命中率会很高

```markdown
{{#if charter}}
# 作品核心（必须遵循）
{{#if charter.worldview}}世界观：{{charter.worldview}}{{/if}}
{{#if charter.era}}时代：{{charter.era}}{{/if}}
... 8 字段 ...
---
{{/if}}

# {{task_specific_content}}
```

> 注：项目目前没有 handlebars / mustache，PromptRegistry 是 `{{var}}` 替换。Charter 渲染要么在 composer 端预先拼好块文本喂给一个 `{{charter_block}}` 槽，要么 PromptRegistry 加最小条件支持。**前者更简单，倾向先做这个**。

### C.4 前端 BookSettings 页
- [x] `apps/web/src/pages/BookSettings.tsx`：8 字段编辑表单（textarea / csv 数组 / select）
- [x] 路由 `/settings`（或 nav 上「作品」按钮，与 Bible/Writing/Outline 并列）
- [x] 保存调 `PUT /book/:id`，toast 反馈
- [x] BookSwitcher 改造：从「localStorage hash 字符串」升级为「真实 book 列表 + 切换 + 新建 book」
- [x] Home 页 stats 区显示 charter 是否填写（鼓励补）

### C.5 「AI 一键生成启动 Bible」（Charter 落地的演示价值）
- [x] 后端：`BibleAgent.generateStarterBible(charter, options?)` —— 一次 LLM 调用产出建议草案：`{ characters[], locations[], organizations[], items[], concepts[], timeline_events[] }`，每项是简短结构化卡片（不是完整 entity，让用户细化）
- [x] 路由 `POST /agent/bible/generate-starter`（body: `{ bookId }` —— charter 由 composer 自动注入）
- [x] Prompt：`packages/prompts/bible-agent/generate-starter.v1.md`，强调"基于 Charter 提议一组互相咬合的初始设定"
- [x] 前端：BookSettings 页底部「✨ 基于 Charter 生成启动 Bible」按钮 → preview dialog（可勾选 / 取消每项） → 「写入选中项」批量 POST 到对应 `/bible/{type}`
- [x] toast 报"已写入 X 个 entity"

### C.6 验证
- [ ] 创建 book → 填 charter → 保存
- [ ] curl `/agent/bible/generate?bookId=...` 观察 prompt（debug 模式打印 system prompt）：charter 块在最顶
- [ ] 同一 description 在不填 charter / 填了仙侠 charter / 填了赛博 charter 三种情况下，生成的 entity 风格明显不同
- [ ] 「AI 启动 Bible」按一次，预览出现 ≥ 8 条建议；选中部分写入；BibleStudio 看得到
- [ ] typecheck（schema / server / web 三处）

---

## Phase D — AI 对话 dialog（原 Phase C）

> 注：此 phase 内容不变，但现在 generate / refine 调用会自动带上 Charter 上下文（来自 Phase C.3）。

- [ ] 新建 `apps/web/src/features/bible/AiGenerateEntityDialog.tsx`
- [ ] 状态机：`idle` / `generating` / `preview` / `refining` / `error`
- [ ] 预览：用 EntityConfig 美化展示生成结果（不直接 dump JSON）
- [ ] refine textarea + 「继续修改」按钮，触发 refineEntity
- [ ] 「采纳」按钮 → 灌入主表单字段，**不调 POST**，关闭 dialog
- [ ] 错误状态展示 LLM 原始输出片段（≤ 500 字），参照 OutlineAgent dialog
- [ ] 在 BibleEntityEditor 顶部加 「✨ AI 生成」按钮
- [ ] 编辑态打开 dialog 时，自动把当前表单值作为 refine 的 `current` 起点（让用户基于已有 entity 继续描述）
- [ ] toast：generate / refine 成功失败都报

---

## Phase E — 端到端 + 收尾（原 Phase D）

- [ ] dev server 实测：填 charter → 6 类 entity 各跑一遍「idle → AI 生成 → refine 一次 → 采纳 → 主表单微调 → 保存」，观察是否符合 charter 风格
- [ ] BackendStatus 黄点（无 LLM key）下点 AI 按钮，dialog 错误信息清楚
- [ ] 提交 commit，message 里贴本任务清单的 commit-time 状态快照
- [ ] 把本文件并入 `TASKS.md` 的 T2.3 备注（一句话即可），删除本文件

---

## 边界 / 故意不做

- ❌ 多轮 chat 历史保留：refine 只用「当前 state + 单条 feedback」就够。
- ❌ Streaming 输出：IO 是结构化 JSON，全量返回更简单可靠。
- ❌ AI 直写 DB：必须经过主表单的「保存」按钮。合 CLAUDE.md §7「作者拥有最终决定权」。
- ❌ 跨 entity 共享 generate prompt：每类 entity 的 worldbuilding 重点差异大，硬抽象会出平庸稿件；6 份独立模板才能各扬其长。
- ❌ entity 删除时级联清理 ref 字段：先松 —— 悬空 id 让 UI 显示 id 而不是名字，避免引入复杂的 cascade 逻辑。后期需要时统一做。
- ❌ Charter 版本化 / 历史：charter 是 1:1 mutable 字段集，改了就改了。版本化能力等真有需求再做。
- ❌ Charter 模板库（"现代言情" / "仙侠" 一键套用）：好功能但是 V2 范畴；MVP 让用户从空白起步。
- ❌ 「AI 启动 Bible」自动写入：用户必须勾选确认每项才入库，不一键 dump。

---

## 完成标记

- [ ] 上面所有 `[ ]` 全部勾满
- [ ] 本文件已删除 / 已并入主 `TASKS.md`
