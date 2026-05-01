# TASKS · BibleStudio AI 扩展

> 本任务清单覆盖 T2.3 的扩展：
> 1. **BibleEntityEditor 改成 schema-driven**，支持全 6 类 Bible entity（角色 / 地点 / 组织 / 物品 / 时间线 / 概念）
> 2. **每类 entity 独立的 AI 生成**：用户输入一句话 → AI 产出对应类型的结构化字段
> 3. **AI refine 对话**：用户继续描述 / 指出不满，AI 在当前字段基础上修改
>
> **进度规则**：每完成一项把 `[ ]` 改成 `[x]`。全部勾满后合入主 `TASKS.md` 的 T2.3 备注，本文件删除。

---

## 执行顺序与理由

1. **Phase A 先做**（后端 + prompt）：prompt 调试是这批活里最耗时也最不可预测的一步，先把每类 entity 的 generate 调到能稳定出合法 JSON，再回头铺前端。
2. **Phase B 与 A 解耦**：前端 schema-driven 重构不依赖 AI，可与 prompt 调试穿插进行。
3. **Phase C 串通**：A + B 都就位后，dialog 把两边接起来。
4. **Phase D 收尾**：全 6 类 entity 实测 + commit。

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
- [ ] curl 各类 entity generate 一遍（6 次），输出经 zod 校验通过
- [ ] curl refine 至少 2 次，验证未提及字段稳定保持
- [ ] 可选：把上述 7 次调用补进 `scripts/smoke.sh`

---

## Phase B — 前端 BibleEntityEditor

### B.1 Config DSL
- [ ] 新建 `apps/web/src/features/bible/entity-config.ts`
- [ ] 定义 `FieldType`：`text` / `textarea` / `select` / `csv` / `entity-ref` / `entity-ref-multi` / `number`
- [ ] 写 6 份 `EntityConfig`，字段映射到 packages/schema
- [ ] 工厂 `emptyValues(bookId)` 返回各字段的默认值（数组 → `[]`、可空 → `null`）

### B.2 渲染器
- [ ] 新建 `apps/web/src/features/bible/BibleEntityEditor.tsx`，按 config 渲染
- [ ] 新建 `apps/web/src/features/bible/EntityRefPicker.tsx`，小弹窗从同 book 已有列表选 id

### B.3 BibleStudio 集成
- [ ] BibleStudio 移除 hard-code character 路径，改为读取当前 tab 的 EntityConfig
- [ ] 6 个 tab 全部 enabled，url 用 `?type=character` 等记录
- [ ] 删除旧 `CharacterEditor.tsx`
- [ ] `RelationshipGraph` 仅在 character tab 下显示
- [ ] 列表 trailing 文案按 entity type 适配（不再永远显示「关系数」）

### B.4 验证
- [ ] 6 类 entity 都能 手工 create / edit / delete 通
- [ ] entity-ref 引用的 id 被删除后，UI 显示原始 id（不挂掉）
- [ ] `pnpm --filter @grid-story/web typecheck` 通过

---

## Phase C — AI 对话 dialog

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

## Phase D — 端到端 + 收尾

- [ ] dev server 实测：6 类 entity 各跑一遍「idle → AI 生成 → refine 一次 → 采纳 → 主表单微调 → 保存」
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

---

## 完成标记

- [ ] 上面所有 `[ ]` 全部勾满
- [ ] 本文件已删除 / 已并入主 `TASKS.md`
