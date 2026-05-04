# MemoryWiki 需求文档

> 替代原 TASKS.md 中 T3.1（Retriever 向量混合检索）和 T3.2（Summarizer）。
> 方法论来源：Andrej Karpathy 的 [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 模式。
>
> **重要**：本文档不是对 Karpathy 方法的照搬，而是针对**长篇小说创作场景**的适配。Karpathy 原文的 wiki 用于代码/笔记/研究文献，事实密度高且文体不重要；小说不同——人物声音、对话语气、潜台词、伏笔都属于"文学事实"，摘要会损伤这些。本文档因此与原 gist 在以下点上有意分叉：
>
> 1. 保留**原文样本通道**（不是只读 wiki）
> 2. 每条断言强制**出处标签 + 三态可信度**
> 3. 允许**人工编辑** wiki 并以注释块保护
> 4. **Ingest 是事务**（staging + 原子 rename）
> 5. **Bible/Wiki 分歧**双写到上下文，不静默择一
> 6. 规模上来后，向量化作为 Query 加速器是合法的（不视作违反原则）
>
> 详细分叉点见 §10.C。

---

## 1. 背景与目标

### 1.1 为什么不用纯向量 RAG

传统 RAG（向量 + 关键词混合检索）在写小说场景下有结构性缺陷：

| 问题 | 具体表现 |
|------|----------|
| **片段碎片化** | 512-token chunk 把跨页的角色弧光、情节铺垫切成碎片 |
| **语义盲区** | embedding 相似度找"文字相近"而非"叙事相关"——角色死亡的场景不会因为和后续哀悼场景语义相关就被召回 |
| **无知识积累** | 每次查询从零开始。第三章 LLM 分析出某角色怕水源于童年阴影，这个洞察不会持久化 |
| **上下文浪费** | 大量无关旁白混入 chunk，挤占上下文窗口 |
| **不可审计** | 向量是不可解释的数字，作者无法验证 LLM 对世界观的理解是否正确 |

但**完全否定向量检索也是错的**。规模上来后（>200 wiki 页面），对 wiki 自身做向量化以加速 QueryNavigator 选页是合法的——见 §1.3 原则 5、§3.4。

### 1.2 MemoryWiki 的目标

让 LLM **增量构建并维护**一套持久化的 markdown wiki，作为系统**主**记忆机制（不是唯一记忆机制——原文仍是首要事实源）：

1. **知识复利**：每定稿一章，wiki 就变丰富一层。角色画像更深、世界规则更清晰、伏笔网更完整
2. **精准上下文**：写新章时不是检索碎片，而是导航到一个结构化的知识库中取用精准页面，**并配合近期相关章节的原文样本**
3. **人可审计**：作者在 Obsidian 或前端 Wiki 页面中浏览、验证 LLM 对故事世界的理解；每条断言带出处标签
4. **LLM 做苦力**：摘要、交叉引用、归档、一致性检查全部由 LLM 自动完成；但作者仍可手动编辑

### 1.3 核心原则

1. **原文是首要真相源，Wiki 是结构化索引**：原始章节文本永远不可被 wiki "替代"。Wiki 是**导航 + 摘要**层，关键写作上下文必须**同时**包含 wiki 页面和近期相关章节的原文片段
2. **Bible 是规范，Wiki 是观察**：StoryBible 是作者定义的"应该如此"，Wiki 是 LLM 从正文中观察到的"实际如此"。两者**分歧时同时呈现**到写作上下文，不静默择一
3. **每条断言带出处**：wiki 页面里所有事实必须带 `[ch-N]` / `[bible]` 标签，加 `[explicit]` / `[implied]` / `[inferred]` 三态可信度。`[inferred]` 是 LLM 脑补区，lint 优先复核
4. **作者可手动编辑**：人类可以编辑任何页面。`<!-- author-note start --> ... <!-- author-note end -->` 包裹的段落，下次 Ingest 时绝对不动
5. **主存储不向量化，向量是 Query 加速器**：所有 wiki 内容以 markdown 文件存储，其他索引/缓存均可从 markdown 重建。规模到 200+ 页面后，可对 wiki **页面级别**做 embedding 加速 QueryNavigator——但这是优化，不是事实存储
6. **Ingest 是事务**：单次 Ingest 跨 15+ 页，必须 staging + 原子 rename。失败不留半新半旧的 wiki
7. **文件优于应用，但不引入 git**：wiki 就是文件系统里的 markdown 文件，cat / grep / diff 全能用。版本机制使用 **滚动 `.bak` 备份（hardlink 节省磁盘）+ `wiki-history.jsonl` 机器可读日志**——这是一个系统，不是个人知识库，git 在 SaaS 形态下是运维包袱。详见 §5.1 Step 8、§10.B

---

## 2. 核心方法论

### 2.1 Karpathy LLM Wiki 概述

```
传统 RAG：每次查询 → embedding → 从原始文档检索片段 → 拼进 prompt
Wiki 方法：定稿时 → LLM 提炼知识 → 写入结构化 wiki 页面
          查询时 → LLM 导航 wiki → 精准读取相关页面 → 拼进 prompt
```

**本项目的扩展**：查询时除了 wiki 页面，还要**注入近期相关原文样本**。Karpathy 的场景（代码、研究笔记）原文事实密度足够高，摘要够用；小说原文里的"声音、语气、留白"无法摘要，必须保留。

### 2.2 三层架构

```
Layer 1 · 原始来源（不可变，首要真相源）
  ├─ Chapter（版本化正文）— 写作时保留近期章节原文样本入上下文
  ├─ StoryBible（结构化设定，作者管理）— "规范层"
  └─ Outline（层级大纲）

Layer 2 · Wiki（LLM 全权维护 + 作者可编辑）
  ├─ entities/      实体页（从 Bible + 正文提炼，带出处标签）
  ├─ chapters/      层级摘要（章 → 卷 → 全局）
  ├─ concepts/      概念 / 主题页
  ├─ tracking/      追踪页（时间线、伏笔、线索、divergences、redirects）
  ├─ index/         分类索引（角色/地点/章节...）+ 总目录
  └─ log.md         活动日志

Layer 3 · Schema（规约文档）
  └─ 页面模板 + 领域规约 + 工作流指令 + author-note 保护规则
      告诉 LLM wiki 长什么样、怎么维护、哪些不能动
```

### 2.3 三个核心操作

| 操作 | 触发时机 | 做什么 |
|------|----------|--------|
| **Ingest** | 章状态 → finalized | 进入 staging → 章摘要 → 抽取（区分 explicit/implied/inferred）→ 更新受影响页面（双输出：merged + divergences）→ 确定性更新 tracking 表 → 更新索引 → 追加 log → 原子 rename → 写 .bak + history.jsonl |
| **Query** | 写作 / 审稿 / 扩写前 | LLM 读分类索引 → 判断相关页面 → 精准读取 wiki → **同时调 ProseSampler 取近期原文样本** → 组装上下文（wiki 块 + 原文样本块 + Bible/Wiki 分歧块）→ 送入 ContextComposer |
| **Lint** | 定时 / 手动触发 | 检查角色矛盾、时间线冲突、未回收伏笔、孤儿页、过期摘要、Bible-Wiki 分歧、死链（slug rename）、`[inferred]` 断言复核、author-note 块完整性 |

---

## 3. 系统架构

### 3.1 模块分解

```
MemoryWiki（后端服务模块）
  ├─ WikiStore          markdown 读写 + 目录管理 + staging + 原子 rename + 滚动 .bak 快照（hardlink）+ history.jsonl
  ├─ WikiSchema         页面模板定义 + 领域规约 + frontmatter 宽松校验
  ├─ IngestPipeline     章定稿 → 摘要 → 抽取 → 合并页面（带 divergences）→ 确定性更新 tracking → 索引 → 日志 → 原子提交
  ├─ ProseSampler       按角色/章/场景过滤近期原文片段，供 Query 注入
  ├─ QueryNavigator     写作上下文 → 页面导航 → wiki + 原文 + 分歧的复合上下文组装
  └─ LintRunner         一致性检查 → lint 报告

Bible CRUD（既有模块）
  └─ emit 事件 entity.created / entity.updated → MemoryWiki 订阅触发对应 wiki 操作

前端
  ├─ WikiBrowser        wiki 浏览主页面
  ├─ WikiPage           单页渲染器（markdown + wikilinks + 出处标签 + author-note 高亮）
  ├─ WikiGraph          实体关系可视化
  ├─ WikiSearch         前端搜索
  └─ DivergencesPanel   待处理分歧列表
```

### 3.2 集成调用链

```
WorkflowEngine（章定稿）
  └─> IngestPipeline.run(bookId, chapterId)
        ├─> Summarizer（章摘要）
        ├─> ModelRouter（抽取 / 合并 LLM 调用）
        └─> WikiStore（staging 写入 → 原子 rename）

BibleStudio（实体 CRUD）
  └─> emit "entity.created" / "entity.updated"
        └─> MemoryWiki 订阅 → IngestPipeline.createEntityPageIfMissing(...)

WritingAgent / OutlineAgent / RewriteAgent / ReviewAgent（写作前）
  └─> QueryNavigator.query(bookId, context)
        ├─> WikiStore（读 index + 选中页面）
        ├─> ProseSampler（取近期相关原文样本）
        └─> ContextComposer（组装 wiki + 原文 + 分歧 prompt）

ReviewAgent（审稿时）
  └─> QueryNavigator.query(bookId, reviewContext)
        └─> LintRunner（一致性检查，含 Bible/Wiki 分歧）
```

### 3.3 Wiki 存储路径约定

```
{dataRoot}/books/{bookId}/wiki/
  ├─ index/
  │   ├─ _root.md                    # 总目录元信息（指向各分类索引）
  │   ├─ characters.md
  │   ├─ locations.md
  │   ├─ organizations.md
  │   ├─ items.md
  │   ├─ concepts.md
  │   └─ chapters.md
  ├─ log.md
  ├─ entities/
  │   ├─ characters/{slug}.md
  │   ├─ locations/{slug}.md
  │   ├─ organizations/{slug}.md
  │   └─ items/{slug}.md
  ├─ chapters/
  │   ├─ ch-{N}.md
  │   ├─ vol-{N}.md
  │   └─ global.md
  ├─ concepts/{slug}.md
  ├─ tracking/
  │   ├─ timeline.md
  │   ├─ foreshadowing.md
  │   ├─ loose-threads.md
  │   ├─ divergences-pending.md      # Bible/Wiki 或新旧观察分歧 - 待作者拍板
  │   ├─ redirects.md                # slug 重命名历史映射
  │   └─ lint/report-{YYYY-MM-DD}.md
  ├─ .staging/{run-id}/              # Ingest 临时区，提交后清空
  ├─ .bak/{timestamp}/               # 滚动备份（hardlink），保留最近 30 份
  ├─ .meta/
  │   └─ lint-state.json             # last_lint_at / last_skipped_reason 等
  └─ wiki-history.jsonl              # Ingest 增量日志（机器可读）
```

Slug 规则：与 Bible 实体对应时使用 Bible 实体的 slug；非 Bible 实体使用有意义的小写 kebab-case。**实体页通过 frontmatter 的 `bible_entity_id` 解析 wikilink**，slug 改名后通过 `redirects.md` 自动重定向（避免 wikilink 失效）。

### 3.4 规模分级（影响 index 与检索策略）

| 阶段 | 页面规模 | index 策略 | Query 选页方式 |
|------|---------|-----------|----------------|
| 早期 | < 50 页 | 各分类索引可直接列举 | LLM 读总目录 + 分类索引选页 |
| 中期 | 50–200 页 | 分类索引拆开维护，单类内部按更新时间分段 | LLM 先读 `index/_root.md` → 选子索引 → 选页 |
| 后期 | > 200 页 | 同中期 | 子索引选页时配合 wiki 页面级 embedding 检索（**对 wiki 页**做向量化，**不是**对原始章节碎片）|

后期的向量化属于 Query 优化层，不改变"markdown 是真相源"的原则。

---

## 4. 页面模板

### 4.1 通用 Frontmatter（所有页面都有）

```yaml
---
title: "页面标题"
slug: "canonical-slug"
page_type: "character | location | organization | item | concept | chapter-summary | volume-summary | global-state | timeline | foreshadowing | loose-threads | divergences | redirects | index | log"
created_at: "2026-05-04T10:00:00Z"
updated_at: "2026-05-04T12:00:00Z"
last_ingest_chapter: 5        # 最后一次更新来自哪一章
bible_entity_id: "uuid-or-null" # 关联的 Bible 实体（实体页主要用此字段做反向链接）
tags: ["tag1", "tag2"]
---
```

**Frontmatter 校验策略**：只 strict 校验 `page_type` / `slug` / `updated_at` 三项；其他字段 `passthrough`。校验失败记录但**不阻断**——LLM 输出格式漂移很常见，不能把这变成 retry 风暴。

### 4.2 出处标签规约（所有事实性正文都要带）

格式：`内容 [来源1] [来源2: 可信度]`

来源类型：
- `[ch-N]`：来自第 N 章正文。**默认是 `explicit`**——明文写出。
- `[ch-N: implied]`：第 N 章的潜台词 / 暗示，未明写。
- `[ch-N: inferred]`：LLM 从第 N 章推断的，可能脑补。**lint 优先复核**。
- `[bible]`：来自 Bible 强字段（作者直接定义）。
- `[author-note]`：作者手动编辑添加（在 author-note 块内时可省略）。

示例：
```markdown
- **核心特质**：寡言 [ch-1] [ch-3]、对水有强烈回避反应 [ch-5: implied]
- **欲望**：寻找母亲下落 [bible] [ch-2]
- **童年阴影源于落水**：[ch-5: inferred]   ← lint 会标记此条需复核
```

### 4.3 author-note 块（受保护内容）

```markdown
<!-- author-note start -->
李四在 ch-5 的沉默不是无话可说，是他对张三死讯的克制。
后续章节继续打磨这个克制感。
<!-- author-note end -->
```

**Ingest LLM prompt 硬规则**：所有 `<!-- author-note start ... end -->` 块**原样保留**，禁止改写、禁止删除。块外的内容才走合并流程。前端 WikiPage 渲染时给这类块视觉区分（背景色 / 左边栏标记）。

### 4.4 角色页（entities/characters/{slug}.md）

```markdown
---
page_type: "character"
bible_entity_id: "uuid"
status: "alive | dead | unknown"
first_appearance: 3
last_appearance: 12
---

# 张三

## 基本画像
- 身高约六尺，肩宽 [bible] [ch-1]
- 左眉有刀疤 [ch-3]
- 长发束成马尾 [ch-7]

## 性格与动机
- **核心特质**：寡言 [ch-1] [ch-3]、对水回避 [ch-5: implied]
- **内在冲突**：忠诚与复仇 [ch-2] [ch-8]
- **欲望 / 恐惧**：寻找母亲 [bible] [ch-2] / 怕水 [bible]

## 弧光轨迹
| 阶段 | 章 | 状态变化 | 出处 |
|------|----|---------|------|
| 起点 | ch-1 | 平静的剑客学徒 | [ch-1] |
| 转折 | ch-5 | 师父被杀，启程复仇 | [ch-5] |
| 现状 | ch-12 | 接近真凶但被迫救其家人 | [ch-12] |

## 关键关系
- **[[characters/li-si]]**：从结义到反目 [ch-3] [ch-9]
- **[[locations/jing-du]]**：童年成长地 [bible] [ch-7: implied]

## 关键场景 / 语录
- ch-3: 初次拔剑（标志性场景）
- ch-7: "我可以原谅，但不能忘记。" [ch-7]

## 能力 / 物品
- 残月剑 [ch-3]：师父遗物
- 内功心法《寒水诀》[ch-8]

## 待发展
<!-- author-note start -->
ch-15 之后准备让他经历"原谅复仇对象后人"的转折。
<!-- author-note end -->

- 母亲身世（[bible] 设定但未在正文揭晓）
- 怕水的起源（暗示与母亲失踪有关）[ch-5: inferred]   ← 待 lint 复核
```

### 4.5 地点页（entities/locations/{slug}.md）

```markdown
---
page_type: "location"
bible_entity_id: "uuid"
first_appearance: 2
---

# 京都

## 环境描述
- 城墙高三丈，黑石砌成 [ch-2]
- 主街贯穿东西 [ch-2] [ch-8]
- 雨季常起雾 [ch-8: implied]

## 氛围 / 基调
压抑、肃杀 [ch-2] [ch-8]

## 相关事件
| 章 | 事件 |
|----|------|
| ch-2 | 主角入城 |
| ch-8 | 大火焚毁东市 |

## 常驻角色
- **[[characters/zhang-san]]**：童年成长地 [bible]

## 子地点
- 东市 [ch-2]
- 城主府 [ch-4]
```

### 4.6 组织 / 物品页

结构与角色页类似，每条事实带出处标签。组织额外有 `成员列表`（每个成员带 `[ch-N]` 标记入会章），物品额外有 `持有者变更`（带变更章）。

### 4.7 概念页（concepts/{slug}.md）

```markdown
---
page_type: "concept"
bible_entity_id: "uuid-or-null"
---

# 灵力体系

## 定义
{当前已知的完整定义，带出处}

## 规则揭示历史
| 章 | 揭示内容 | 揭示方式 | 可信度 |
|----|---------|---------|--------|
| ch-1 | 灵力分九品 | 师父口述 | explicit |
| ch-7 | 九品之上还有"返虚" | 反派威吓时透露 | explicit |
| ch-11 | 返虚需以神魂为代价 | 主角推测 | inferred ← 待复核 |

## 已知边界 / 限制
- 修炼到第七品需突破"心境关" [ch-5]
- 反噬代价：内伤 [ch-9]

## 开放问题
- 返虚之上是否还有更高境界？
- "心境关"的具体表现是什么？
```

### 4.8 章摘要（chapters/ch-{N}.md）

章摘要本身是衍生摘要，**正文要点不强制带 [ch-N] 出处**（整页就是 ch-N 的摘要）。但若摘要里出现"伏笔"、"信息增量"等条目，要明确写出 `[implied]` / `[inferred]` 等可信度。

```markdown
---
page_type: "chapter-summary"
chapter_number: 5
chapter_id: "uuid"
word_count: 3200
status: "finalized"
---

# 第 5 章：{标题}

## 一句话概要
{一句话概括本章内容}

## 场景序列
### 场景 1：{场景名}
- **地点**：[[locations/xxx]]
- **出场角色**：[[characters/xxx]]、[[characters/yyy]]
- **事件**：{简述}
- **信息增量**：{本章揭示的新信息 / 设定}

## 角色发展
- **[[characters/xxx]]**：{本章的角色变化}

## 伏笔
### 种植
- {新伏笔描述} [implied | explicit] → 预计回收章：{N}

### 回收
- {回收了之前的伏笔 X，引用 ch-N: planted}

## 世界设定增量
- {本章揭示的关于世界观的新信息}

## 遗留线索
- {本章未解决、待后续处理的线索}
```

### 4.9 卷综合（chapters/vol-{N}.md）

```markdown
---
page_type: "volume-summary"
volume_number: 1
chapter_range: "1-12"
---

# 第 {N} 卷综合

## 卷概要
{3-5 句话概括整卷}

## 主线推进
{主线情节在本卷的推进}

## 角色弧光汇总
| 角色 | 起点（卷首）| 终点（卷末）| 关键转折章 |
|------|------------|------------|-----------|
| ... | ... | ... | ... |

## 伏笔盘点
| 伏笔 | 种植章 | 回收章 | 状态 |
|------|--------|--------|------|
| ... | ch-2 | ch-10 | 已回收 |
| ... | ch-8 | — | 待回收 |

## 遗留线索（传至下卷）
- ...
```

### 4.10 全书状态（chapters/global.md）

```markdown
---
page_type: "global-state"
total_chapters: 24
finalized_chapters: 18
total_words: 62000
---

# 全书状态

## 当前进度
- 已完成：第 1-18 章（共 24 章）
- 总字数：62,000
- 当前卷：第 2 卷（第 13-24 章）

## 主线状态
{当前主线情节所处阶段，接下来需要发生什么}

## 活跃角色
| 角色 | 当前状态 | 最后出场章 | 下一预计出场 |
|------|---------|-----------|-------------|
| ... | ... | ch-18 | ch-20 |

## 待解决问题
- {需要后续处理的线索 / 冲突 / 设定}

## 主题轨迹
- **{主题名}**：{当前主题的发展状态}
```

### 4.11 追踪页

**timeline.md**：按时间顺序的事件列表。**不走 LLM 合并**，由 IngestPipeline 从抽取的 JSON 结果**确定性追加**。每条含章号、故事内日期、事件描述、涉及角色、出处。

**foreshadowing.md**：伏笔登记表，**确定性增删改**。表格列：伏笔描述、种植章、预计回收章、实际回收章、状态（待回收/已回收/废弃）。

**loose-threads.md**：未解决线索，**确定性合并**。

**divergences-pending.md**（新增）：Ingest 抽出但未合并的"新观察 vs 旧 wiki" 或 "Wiki vs Bible" 分歧条目，等作者审阅。

```markdown
---
page_type: "divergences"
---

# 分歧待处理

## [2026-05-04] ch-5 抽取
### entities/characters/zhang-san.md
- **旧观察**：怕水（[bible]，源自童年）
- **新观察**：在 ch-5 主动游过护城河
- **建议处理**：（1）正文是否写偏？（2）此章里"怕水"被克服？请决定 wiki 该如何更新。
- **抽取证据**：ch-5 段落 ...
```

**redirects.md**（新增）：

```markdown
---
page_type: "redirects"
---

# Slug 重命名历史

| 原 slug | 新 slug | bible_entity_id | 改名时间 |
|---------|---------|-----------------|---------|
| zhang-san-old | zhang-san | uuid-1 | 2026-05-04 |
```

### 4.12 index/

```markdown
# index/_root.md
---
page_type: "index"
total_pages: 142
last_updated: "2026-05-04T12:00:00Z"
---

# Wiki 索引（总目录）

- [[index/characters]]：角色（30 页）
- [[index/locations]]：地点（18 页）
- [[index/organizations]]：组织（5 页）
- [[index/items]]：物品（12 页）
- [[index/concepts]]：概念 / 主题（22 页）
- [[index/chapters]]：章摘要（55 页：第 1–55 章 + 卷综合 + global）
- [[tracking/timeline]]、[[tracking/foreshadowing]]、[[tracking/loose-threads]]
- [[tracking/divergences-pending]]
```

各分类索引（如 `index/characters.md`）：

```markdown
---
page_type: "index"
category: "characters"
---

# 角色索引（30）

- [[characters/zhang-san]]：主角，剑客，当前状态：修炼突破中（更新 ch-18）
- [[characters/li-si]]：反派，魔教教主，当前状态：重伤逃遁（更新 ch-17）
...
```

### 4.13 log.md

```markdown
---
page_type: "log"
---

# Wiki 活动日志

## [2026-05-04 12:00] ingest run-{id} | 第 18 章定稿
- 更新角色页：zhang-san, li-si, wang-wu
- 更新地点页：jing-du
- 更新概念页：magic-system
- 确定性更新 timeline（+3 事件）、foreshadowing（回收 1，种植 2）
- 写入 divergences-pending（1 条）
- 更新 index
- 备份：.bak/2026-05-04T120000Z/（hardlink）
- history: run-{id} → 12 个文件变更

## [2026-05-03 15:30] lint | 定时检查
- 发现 2 条矛盾，1 条已修复
- 标记 3 个未回收伏笔
- inferred 复核：6 条，2 条建议改 implied，1 条建议删除
```

---

## 5. 业务流程

### 5.1 Ingest（章定稿 → Wiki 更新）

**事务化**：所有写入先到 `.staging/{run-id}/`，最后一步 `os.rename` 原子提交。

```
触发：WorkflowEngine 将章状态设为 "finalized"

Step 0 · 创建 staging
  生成 run-id（chapter-id + timestamp）
  WikiStore.openStaging(runId)：把当前 wiki 全量浅拷贝（hardlink 或 copy）到 .staging/{runId}/
  之后所有写入都写到 staging 路径

Step 1 · 章摘要
  Summarizer（Haiku）生成章摘要 → 写入 .staging/.../chapters/ch-{N}.md

Step 2 · 信息抽取（LLM 调用，结构化 JSON 输出）
  输入：章正文 + 当前 wiki 总目录索引 + 受影响实体页（含 author-note 块原文）
  LLM（Haiku）抽取，每条事实标可信度（explicit/implied/inferred）：
    a. 角色发展（新特质 / 关系变化 / 弧光进展 / 语录）
    b. 地点描写（新细节 / 氛围补充）
    c. 世界设定增量（规则揭示 / 历史补充）
    d. 情节事件（时间线条目 - 结构化字段）
    e. 伏笔（种植 / 回收 - 结构化字段）
    f. 遗留线索（新增 / 解决 - 结构化字段）

Step 3 · 实体 / 概念页合并（LLM 调用）
  对每个受影响的实体或概念页：
    输入：当前页内容（含 author-note 块）+ 抽取出的新信息
    LLM（Haiku）输出双字段：
      - merged_page：合并后的完整 markdown
        · 保留所有原有 [出处] 标签
        · 新事实附加来源标签 [ch-N] [explicit|implied|inferred]
        · author-note 块原样保留（硬规则）
      - divergences[]：检测到的"新旧矛盾"列表
        · Bible 强字段冲突
        · 与既有 [explicit] 事实矛盾
        · 与 [bible] 标签事实矛盾
    写入 .staging/.../entities/.../{slug}.md
    divergences 追加到 .staging/.../tracking/divergences-pending.md

Step 4 · 追踪页确定性更新（不走 LLM）
  从 Step 2 的 JSON 输出直接生成 markdown 表格行：
    - timeline.md：append 新事件行
    - foreshadowing.md：append 种植；标记回收
    - loose-threads.md：append 新增；删除已解决

Step 5 · 章摘要 / 卷综合 / 全局状态
  - chapters/ch-{N}.md（已在 Step 1 写）
  - vol-{N}.md：仅在跨卷边界更新（轻量 LLM 调用）
  - global.md：每章定稿后由 LLM 重新评估全书状态（Haiku）

Step 6 · 索引与分类索引
  IngestPipeline.updateIndex()：
    - 增改对应分类索引（如 index/characters.md 的对应行）
    - 更新 index/_root.md 的计数

Step 7 · 日志
  写 .staging/.../log.md 的最后一条："[2026-05-04 12:00] ingest run-{id} | ch-5 ..."

Step 8 · 原子提交
  WikiStore.commitStaging(runId)：
    a. 验证 staging 完整性（关键文件存在）
    b. 收集变更清单：对比 staging 与当前 wiki/，得到 files_changed 和每个文件的 before/after sha256
    c. 备份当前 wiki/ 到 .bak/{timestamp}/（用 hardlink：`rsync -a --link-dest=../../wiki ./wiki .bak/{ts}/` 或 `cp -al`，未变文件零拷贝）
    d. 原子 rename .staging/{runId}/ → 主目录
    e. 滚动清理：删除较早的 .bak/，保留最近 30 份
    f. 追加一行到 wiki-history.jsonl：
       { run_id, ts, chapter_id, run_type: "ingest",
         files_changed: [...],
         file_hashes_before: {...}, file_hashes_after: {...},
         backup_dir: ".bak/{timestamp}/" }

异常处理：
  - 任意 Step 1–7 失败：抛弃 .staging/{runId}/，主 wiki 不变
  - LLM 调用失败 → 重试 3 次 → 入 DLQ → 通知前端
  - Step 8 失败（罕见）→ 回滚到 .bak/{timestamp}/（再原子 rename 一次）
```

### 5.2 Query(写作前 → 上下文组装)

```
触发：WritingAgent / OutlineAgent / RewriteAgent / ReviewAgent 启动

Step 1 · 读总目录索引
  读取 index/_root.md → 获取分类索引列表和各类规模

Step 2 · 子索引选择（LLM 调用 / 经验规则）
  根据写作上下文（要写哪一章、涉及哪些角色 / 地点 / 概念），
  确定要读哪几个分类索引（通常 3-5 个）

Step 3 · 相关性判断（LLM 调用）
  输入：选中的分类索引内容 + 当前写作上下文
  LLM（Haiku）输出：需要读取的页面路径列表（最多 15 个）+ 每个的相关性理由

  规模 > 200 页时：可在此步前用 wiki 页面 embedding 加速预筛（见 §3.4）

Step 4 · 页面读取
  WikiStore 批量读取选中的页面，自动通过 redirects.md 跳转旧 slug

Step 5 · 原文样本注入（关键扩展，非 Karpathy 原意）
  ProseSampler.sample(bookId, {
    characters: [...],   // Step 3 选中的角色
    recentChapters: 3,   // 最近 3 章原文必拿
    keyScenes: [...]     // 角色页里 "关键场景 / 语录" 标记的章
  })
  → 返回原文片段 List<{ chapter, span, text }>

Step 6 · 分歧检测
  扫描选中页面：
    - frontmatter bible_entity_id 不为空：与 Bible 强字段对比
    - 读 tracking/divergences-pending.md 查与本上下文相关的待处理分歧
  生成 "Bible/Wiki 分歧" 上下文块

Step 7 · 上下文组装（输出给 ContextComposer）
  ContextBlocks {
    wiki: {
      characters: [...],     // 角色 wiki 页（含出处标签）
      locations: [...],
      concepts: [...],
      recentSummaries: [...], // 最近 N 章摘要
      globalState: {...},
      looseThreads: [...]
    },
    prose: [                  // 原文样本（关键）
      { chapter: 7, scene: "李四独自饮酒", text: "..." },
      ...
    ],
    divergences: [            // Bible/Wiki 分歧
      { entity: "li-si", bible: "怕水", wiki_observed: "ch-5 游过护城河", ... }
    ]
  }
  ContextComposer.assemble(blocks)

Step 8 · 缓存（可选优化）
  同一写作会话内已读取的 wiki 页缓存
  原文样本不缓存（每次按当前上下文取）
```

### 5.3 Lint（一致性检查）

```
触发：
  - 定时（每日一次，可配置时刻）
  - 手动（前端 /lint 按钮 或 API POST /wiki/lint）

Step 0 · 增量判断（跳过空跑）
  读取 .meta/lint-state.json 的 last_lint_at（首次为 null）
  扫描 wiki-history.jsonl：is there any entry with run_type == "ingest" 且 ts > last_lint_at？
    - 否：跳过本次 lint
        · 写入 lint-state.json：last_skipped_at = now, last_skipped_reason = "no ingest since last lint"
        · 不生成 report，不追加 log.md（避免噪音）
        · 手动触发模式下，向调用方返回 { skipped: true, reason }
    - 是：继续 Step 1
  注：手动触发可传 force=true 强制跑（用于排查）

Step 1 · 全页扫描
  读入所有 wiki 页面、redirects.md、divergences-pending.md

Step 2 · 检查项
  a. 角色矛盾（LLM）：同一角色的特质/外貌/状态在不同页矛盾
  b. 时间线冲突（LLM）：事件时间顺序矛盾
  c. 未回收伏笔（确定性）：超过预计回收章 5 章以上仍未回收
  d. 孤儿页（确定性）：无入链 / 无引用的实体页
  e. 过期摘要（确定性）：Chapter.updatedAt > 对应 wiki 页 updated_at
  f. Bible-Wiki 分歧（确定性 + LLM）：扫描所有带 bible_entity_id 的页，对比 Bible 强字段
  g. 死链（确定性，新增）：所有 [[...]] wikilink 解析失败
     - 优先用 bible_entity_id 通过 redirects.md 复活
     - 仍无法解析的报告
  h. inferred 复核（LLM，新增）：所有带 [inferred] 标签的断言抽样让 LLM 重读原章节验证
  i. author-note 块完整性（确定性，新增）：检查 `<!-- author-note start -->` 是否都有匹配的 end

Step 3 · 报告生成
  输出 lint 报告到 tracking/lint/report-{YYYY-MM-DD}.md
  按严重度分级：
    - Critical：h（inferred 错误）、i（块异常）
    - Warning：a, b, f, g
    - Info：c, d, e

Step 4 · 自动修复（可选）
  对明确可自动修复的（更新过期摘要、修复 author-note 块缺失 end），标记 auto-fixable
  其余需人工确认

Step 5 · 更新 lint-state
  写入 .meta/lint-state.json：last_lint_at = now, last_report_path = "tracking/lint/report-{date}.md"
```

---

## 6. 功能需求

### 6.1 后端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/books/:bookId/wiki/page/*` | 读取 wiki 页面内容（自动通过 redirects 跳转） |
| `GET` | `/api/books/:bookId/wiki/index` | 总目录索引 |
| `GET` | `/api/books/:bookId/wiki/index/:category` | 分类索引（characters/locations/...） |
| `GET` | `/api/books/:bookId/wiki/log` | 活动日志 |
| `GET` | `/api/books/:bookId/wiki/pages?dir=entities/characters` | 列出某目录下页面列表 |
| `POST` | `/api/books/:bookId/wiki/ingest` | 手动触发 ingest（body: `{chapterId}`） |
| `POST` | `/api/books/:bookId/wiki/query` | Query 导航（body: `{context}`）→ 返回组装后上下文（含 wiki + 原文样本 + 分歧） |
| `GET` | `/api/books/:bookId/wiki/prose-samples` | 原文样本（query: `characters[]`, `recentChapters`, `keyScenes[]`） |
| `GET` | `/api/books/:bookId/wiki/divergences` | 待处理分歧列表 |
| `POST` | `/api/books/:bookId/wiki/divergences/:id/resolve` | 标记分歧已处理（body: `{decision, note}`） |
| `POST` | `/api/books/:bookId/wiki/lint` | 触发 lint（query: `force=true` 跳过增量检查），返回 `{ skipped, reportPath }` |
| `GET` | `/api/books/:bookId/wiki/lint/reports` | lint 报告列表 |
| `GET` | `/api/books/:bookId/wiki/history` | 读取 wiki-history.jsonl，返回 ingest 历史列表（含变更文件与 hash） |
| `POST` | `/api/books/:bookId/wiki/rollback/:runId` | 回滚到某次 ingest 提交前的状态（从 .bak/{timestamp}/ swap 回主目录） |
| `GET` | `/api/books/:bookId/wiki/page/*/raw` | 页面原始 markdown |
| `GET` | `/api/books/:bookId/wiki/search?q=xxx` | 前端搜索（grep） |

### 6.2 前端页面与组件

| 组件 | 说明 |
|------|------|
| `WikiBrowser` | wiki 浏览主页面，路由 `/books/:bookId/wiki` |
| `WikiIndex` | 目录视图，按分类展示所有页面 |
| `WikiPage` | 单页渲染：markdown + wikilink + frontmatter + 出处标签高亮 + author-note 块视觉区分 |
| `WikiGraph` | 实体关系可视化（基于 wikilink + bible_entity_id） |
| `WikiSearch` | wiki 内搜索 |
| `DivergencesPanel` | 待处理分歧列表 + 一键决策 UI |
| `WikiLintPanel` | lint 报告查看 |

### 6.3 Prompt 模板（packages/prompts）

| 模板路径 | 用途 |
|----------|------|
| `memory-wiki/ingest-extract.v1.md` | 从章正文提取结构化信息（含 explicit/implied/inferred 三态） |
| `memory-wiki/ingest-merge-entity.v1.md` | 合并实体页：双输出 merged_page + divergences；硬规则保留 author-note 块、保留出处标签 |
| `memory-wiki/ingest-update-global.v1.md` | 更新 global.md（全书状态重评估） |
| `memory-wiki/query-select-categories.v1.md` | 选择需要读取的分类索引 |
| `memory-wiki/query-select-pages.v1.md` | 在选中分类索引内选页面 |
| `memory-wiki/lint-character.v1.md` | 角色一致性检查 |
| `memory-wiki/lint-timeline.v1.md` | 时间线冲突检查 |
| `memory-wiki/lint-inferred-review.v1.md` | `[inferred]` 断言复核 |

注意：tracking 页（timeline / foreshadowing / loose-threads）**没有 prompt 模板**——它们是确定性表格更新。

### 6.4 共享 Schema（packages/schema/src/wiki.ts）

```typescript
// page_type 枚举
// 通用 frontmatter Zod schema：strict 校验 page_type/slug/updated_at，其他字段 passthrough
// 抽取阶段的结构化输出 schema（ExtractedInfo）：
//   含 timeline_events, foreshadowing_planted/paid_off, loose_threads,
//   character_updates[], location_updates[], concept_updates[]
//   每条事实带 confidence: "explicit" | "implied" | "inferred"
// 合并阶段的双输出 schema（MergeResult）：merged_page + divergences[]
// ContextBlocks 类型（wiki + prose + divergences 三段式）
```

---

## 7. 原子任务清单

> 已从原 85 条压缩到 ~30 条；估时按"实际人时"标注。`[IND]` = 与同 sprint 内其他任务无依赖（可调度灵活），不代表真能并行执行。

### Sprint 0 · 基础设施（WikiStore + WikiSchema + ProseSampler，~2d）

| ID | 任务 | 依赖 | 估时 |
|----|------|------|------|
| MW-01 | `[IND]` `packages/schema/src/wiki.ts`：page_type 枚举 + 通用 frontmatter Zod（strict 三字段 + passthrough）+ ExtractedInfo / MergeResult / ContextBlocks 类型导出 | — | 3h |
| MW-02 | `apps/server/src/memory-wiki/` 模块骨架 + WikiStore 基础（构造、读、写、列、删、ensureDir） | MW-01 | 2h |
| MW-03 | WikiStore 事务支持：openStaging / commitStaging（原子 rename + hardlink .bak 备份 + 写 wiki-history.jsonl）/ rollbackStaging（按 runId 从 .bak swap）/ 滚动清理保留最近 30 份 | MW-02 | 4h |
| MW-04 | WikiStore wikilink 解析：通过 bible_entity_id + redirects.md 解析；增加 `resolveLink(linkText) → realPath` | MW-02 | 2h |
| MW-05 | WikiSchema：renderTemplate / parseFrontmatter（gray-matter）/ validatePage（宽松） | MW-01, MW-02 | 2h |
| MW-06 | `[IND]` ProseSampler：按 `{characters, recentChapters, keyScenes}` 从 Chapter 表取原文片段 | — | 3h |
| MW-07 | WikiStore + WikiSchema + ProseSampler 单测（tmp 目录） | MW-03, MW-05, MW-06 | 3h |

### Sprint 1 · Ingest 管线（~3d）

| ID | 任务 | 依赖 | 估时 |
|----|------|------|------|
| MW-10 | Prompt 模板：`ingest-extract.v1.md`（结构化 JSON 输出 + explicit/implied/inferred 三态可信度） | — | 2h |
| MW-11 | Prompt 模板：`ingest-merge-entity.v1.md`（双输出 merged_page + divergences；硬规则：保留 author-note 块、保留出处标签、不删除 author-note 块外的明确事实） | — | 2h |
| MW-12 | Prompt 模板：`ingest-update-global.v1.md` | — | 1h |
| MW-13 | IngestPipeline 框架（DI: WikiStore, WikiSchema, ModelRouter, PromptRegistry, ChapterStore） | MW-02, MW-05 | 2h |
| MW-14 | IngestPipeline.extractInfo + chapter summary 写入 staging | MW-10, MW-13 | 3h |
| MW-15 | IngestPipeline.mergeEntityPages（受影响页迭代调 LLM；写 merged_page 入 staging；divergences 追加 staging 的 divergences-pending.md） | MW-11, MW-13 | 4h |
| MW-16 | IngestPipeline.updateTrackingDeterministic（timeline / foreshadowing / loose-threads 表格行确定性合并，**不走 LLM**） | MW-13 | 3h |
| MW-17 | IngestPipeline.updateGlobalAndIndices（global.md + index/_root.md + 各分类索引） | MW-12, MW-13 | 3h |
| MW-18 | IngestPipeline.appendLog + commit 整合（编排 Step 0–8 + 错误处理 + 重试） | MW-14, MW-15, MW-16, MW-17 | 3h |
| MW-19 | Bible CRUD 事件总线对接：BibleStudio 实体创建/更新 → emit → MemoryWiki 订阅 → createEntityPageIfMissing | MW-13 | 3h |
| MW-20 | WorkflowEngine 接入：章 finalized 自动触发 IngestPipeline.run | MW-18 | 1h |
| MW-21 | API：`POST /api/books/:bookId/wiki/ingest` + 集成测试（建测试 book + chapter → run → 校验 staging 提交、wiki 文件正确、divergences 写入） | MW-20 | 4h |

### Sprint 2 · Query 导航（~2d）

| ID | 任务 | 依赖 | 估时 |
|----|------|------|------|
| MW-30 | Prompt 模板：`query-select-categories.v1.md` + `query-select-pages.v1.md` | — | 2h |
| MW-31 | QueryNavigator 框架 + DI（WikiStore, ProseSampler, ModelRouter） | MW-02, MW-06 | 2h |
| MW-32 | QueryNavigator.determineRelevantPages（两步选页：分类 → 页面） | MW-30, MW-31 | 3h |
| MW-33 | QueryNavigator.detectDivergences（扫描选中页 + 读 divergences-pending） | MW-31 | 2h |
| MW-34 | QueryNavigator.assembleContext（wiki 块 + 原文样本块 + 分歧块的三段式输出） | MW-31, MW-32, MW-33 | 3h |
| MW-35 | ContextComposer.acceptWikiContext：把 ContextBlocks 拼入 prompt（含原文样本和分歧告警） | MW-34 | 2h |
| MW-36 | WritingAgent + OutlineAgent + RewriteAgent + ReviewAgent 接入 QueryNavigator | MW-35 | 3h |
| MW-37 | API：`POST /api/books/:bookId/wiki/query` + `GET /wiki/prose-samples` + `GET/POST /wiki/divergences` | MW-34 | 3h |
| MW-38 | QueryNavigator 测试 + 集成测试 | MW-37 | 3h |

### Sprint 3 · Lint（~1.5d）

| ID | 任务 | 依赖 | 估时 |
|----|------|------|------|
| MW-50 | Prompt 模板:lint-character / lint-timeline / lint-inferred-review | — | 2h |
| MW-51 | LintRunner 框架 + 增量 skip（Step 0：读 wiki-history.jsonl 判断是否需要跑）+ 各 check 实现（a–i 九项；LLM 项与确定性项分离）+ 报告生成 + 更新 lint-state.json | MW-02, MW-50 | 7h |
| MW-52 | API：`POST /api/books/:bookId/wiki/lint`（含 force 参数）+ `GET /api/books/:bookId/wiki/lint/reports` | MW-51 | 1h |
| MW-52a | API：`GET /api/books/:bookId/wiki/history` + `POST /api/books/:bookId/wiki/rollback/:runId` | MW-03 | 2h |
| MW-53 | LintRunner 测试 | MW-51 | 2h |

### Sprint 4 · 前端（~3d）

| ID | 任务 | 依赖 | 估时 |
|----|------|------|------|
| MW-60 | WikiBrowser 三栏布局 + 路由 `/books/:bookId/wiki` | — | 3h |
| MW-61 | WikiIndex（按分类展示） | MW-60 | 2h |
| MW-62 | WikiPage：react-markdown + remark-gfm + wikilink 解析 + 出处标签高亮 + author-note 块视觉区分 + frontmatter 信息栏 | — | 4h |
| MW-63 | WikiGraph（基于 wikilink + bible_entity_id 的实体关系图） | — | 3h |
| MW-64 | WikiSearch + 后端 grep API | MW-02 | 2h |
| MW-65 | DivergencesPanel：列表 + 一键决策 UI | MW-37 | 3h |
| MW-66 | WikiLintPanel + WikiHistoryPanel（读 history.jsonl，展示 ingest 时间线 + 一键回滚） | MW-52, MW-52a | 3h |
| MW-67 | 入口集成：app 导航、WritingDesk 工具栏 "📖 Wiki"、BibleStudio 实体页 "在 Wiki 中查看" | MW-60 | 2h |
| MW-68 | 像素主题适配 | MW-60–66 | 3h |

### Sprint 5 · 收尾（~0.5d）

| ID | 任务 | 依赖 | 估时 |
|----|------|------|------|
| MW-80 | TASKS.md 阶段三同步：MemoryWiki 任务取代 T3.1 / T3.2；ContextComposer v2 标记完成 | — | 0.5h |
| MW-81 | 端到端测试：建 book → 写 3 章 → 每章定稿触发 ingest → 校验 wiki 内容、原文样本注入、分歧检测、Bible-Wiki 联动 | MW-21, MW-38 | 4h |
| MW-82 | DEVELOPER.md 添加 MemoryWiki 章节（架构图、典型流程、调试技巧） | MW-81 | 2h |

**合计估时**：~12d 实际人时（约现实 24d，符合 TASKS.md 中 T3.1 = 6d 的两倍倍率）。

---

## 8. 验收标准

### 8.1 Ingest 管线

- [ ] 章 finalized 后，自动生成章摘要写入 `chapters/ch-{N}.md`
- [ ] 实体信息变化合并到 `entities/.../{slug}.md`，**每条事实带 `[ch-N]` 出处和 explicit/implied/inferred 标签**
- [ ] 时间线 / 伏笔 / 遗留线索通过**确定性更新**（无 LLM 调用）追加到 tracking 页
- [ ] 分歧（Bible 强字段冲突 / 与既有事实矛盾）自动写入 `tracking/divergences-pending.md`
- [ ] **author-note 块（`<!-- author-note start/end -->`）原样保留**，跨多次 Ingest 不被改写或删除
- [ ] index 在每次 ingest 后更新；log.md 追加一条
- [ ] **Ingest 是事务**：staging 失败时主 wiki 不变；提交后写入 .bak/{timestamp}/（hardlink）+ 追加一行 wiki-history.jsonl
- [ ] **滚动备份**：保留最近 30 份 .bak/，可通过 `/wiki/rollback/:runId` 回滚
- [ ] 新 Bible 实体创建（事件总线触发）自动建初始 wiki 页
- [ ] LLM 调用失败时错误不传播、有明确日志

### 8.2 Query 导航

- [ ] 给定写作上下文，QueryNavigator 返回的页面列表覆盖所有相关实体
- [ ] **返回的上下文同时包含三块：wiki 页面 + 近期相关原文样本 + Bible/Wiki 分歧告警**
- [ ] 原文样本来自 ProseSampler，按角色 / 章节范围过滤
- [ ] Bible 强字段与 wiki 观察分歧时，**两者并列呈现**到上下文，不静默择一
- [ ] 页面读取通过 redirects.md 解析改名后 slug
- [ ] 上下文块大小可控（不超过 ContextComposer 的 token 预算）

### 8.3 Lint

- [ ] 角色矛盾、时间线冲突、Bible-Wiki 分歧被检出
- [ ] 超过预计回收章 5 章以上未回收的伏笔被标记
- [ ] 孤儿页、过期摘要、死链被列出
- [ ] **`[inferred]` 标签的断言被抽样复核**
- [ ] **author-note 块完整性检查**（缺失 end 等）
- [ ] 报告按严重度分级（Critical / Warning / Info）
- [ ] **增量 skip**：上次 lint 之后 wiki-history.jsonl 无新 ingest 条目时，定时触发自动跳过（不生成空报告，不污染 log），手动可 `force=true` 覆盖

### 8.4 前端

- [ ] WikiBrowser 可按分类浏览所有 wiki 页面
- [ ] WikiPage 渲染 markdown，**出处标签 `[ch-N]` 高亮可点击跳章**
- [ ] **author-note 块在前端有视觉区分（背景色 / 边栏）**
- [ ] wikilink 点击通过 bible_entity_id 解析（slug 改名仍可跳）
- [ ] WikiGraph 展示实体间关系
- [ ] **DivergencesPanel 可查看待处理分歧并一键决策**（采纳新观察 / 保留 Bible / 标记需在正文修补）
- [ ] 从 WritingDesk / BibleStudio 可一键跳转到 wiki

### 8.5 整体

- [ ] **不再用碎片向量化做事实查询**；后期可对 wiki 页面级 embedding 加速 QueryNavigator（不视为违反原则）
- [ ] **原文章节文本始终可被 ProseSampler 注入到上下文**——wiki 不替代原文
- [ ] 所有 wiki 数据以 markdown 文件存储，可被 Obsidian / VS Code 直接打开
- [ ] 端到端流程：写章 → 定稿 → wiki 自动更新（事务化）→ 写下一章 → 上下文 = wiki + 原文样本 + 分歧

### 8.6 成本与时延预算（实测后填）

| 操作 | Token 上限（目标） | 时延上限（目标） |
|------|-------------------|----------------|
| 单次 Ingest（一章定稿，10 个受影响实体） | < 30k tokens | < 90s |
| 单次 Query（写新章前） | < 8k tokens | < 5s |
| 单次 Lint（30 角色 / 50 章） | < 50k tokens | < 3min |

实测低于目标时调高，超出时优先优化 prompt 长度 / 减少 LLM 调用次数。

---

## 9. 与现有模块的关系

```
StoryBible（结构化字段）
  │  作者通过 BibleStudio 维护
  │  "规范层"：角色应该长这样
  │  → emit "entity.created" / "entity.updated"
  │
  ├──→ MemoryWiki（叙事状态）
  │      LLM 从正文自动提炼 + 作者可手动编辑
  │      "观察层"：根据已写内容，角色的实际表现
  │      每条事实带出处标签；分歧自动入 divergences-pending
  │
  ├──→ ContextComposer
  │      从 MemoryWiki 获取上下文块（wiki + 原文样本 + 分歧告警）
  │
  └──→ ReviewAgent
         对比 Bible 规范 ↔ Wiki 观察（含 inferred 标签复核）
         发现不一致 → DivergencesPanel 提示作者
```

### Bible <-> Wiki 同步策略

- **Bible 实体创建时**：BibleStudio emit `entity.created` 事件 → MemoryWiki 订阅 → 用 Bible 强字段创建初始 wiki 实体页（无 prose 引用，全部标 `[bible]`）
- **Bible 实体更新时**：BibleStudio emit `entity.updated` 事件 → MemoryWiki 写一条 divergences 提示"Bible 已更新，wiki 是否需要重新合并？"
- **Wiki 观察出问题时**：Ingest 实时检出分歧 → 自动入 `tracking/divergences-pending.md`；Lint 周期性二次检出
- **Wiki 不写回 Bible**：从正文中发现新设定项时，由 BibleAgent（T3.5）提示作者手动入库

---

## 10. 附录

### A. 与原 T3.1/T3.2 的对照

| 原 ID | 原内容 | 新归属 |
|-------|--------|--------|
| T3.1 | Retriever（向量 + 关键词 / 实体过滤混合检索） | **废弃**。事实查询由 MemoryWiki QueryNavigator 替代；规模上来后可对 wiki 页面级 embedding 做 Query 加速（属优化层，非真相源） |
| T3.2 | Summarizer（章摘要 → 卷摘要 → 全局摘要的层级压缩） | **并入** MemoryWiki IngestPipeline。摘要直接写入 wiki 页面作为持久化知识，且**与原文样本通道并存**——摘要不替代原文 |

### B. 技术选型备注

- **Markdown 解析**：后端 `gray-matter`（frontmatter）+ `marked`/`remark`（预览）；前端 `react-markdown` + `remark-gfm` + `remark-wiki-link`
- **文件存储**：Node.js `fs` + 工作区 `wiki/` 目录
- **原子事务**：`fs.rename` 实现原子提交
- **版本机制（不用 git）**：本系统是 SaaS 形态，单作品 .git 目录是运维包袱，故采用两层轻量方案：
  - **滚动备份**：每次 ingest 提交后 `.bak/{timestamp}/`，用 hardlink 复制（`rsync -a --link-dest` 或 `cp -al`），未变文件 inode 共享，30 份备份 ≈ 1.5 份磁盘开销
  - **`wiki-history.jsonl`**：每次 ingest 追加一行机器可读日志（含 run_id, ts, files_changed, before/after sha256, backup_dir），用于审计 / 历史面板 / 回滚定位
  - 回滚 = 从 `.bak/{timestamp}/` swap 回主目录（再走一次原子 rename）
  - 备选方案对比：tar.gz 快照（每次 ~5MB IO）/ DB 行存版本（破坏文件即源的便利）/ git（运维包袱）—— hardlink 方案在性能、磁盘、运维三个维度都最优
- **LLM 调用**：通过 ModelRouter；抽取 / 合并用 Haiku；global.md 重评估和 inferred 复核可用 Opus
- **事件总线**：项目还没有，简单实现：后端模块用 Node EventEmitter；前端用现有 TanStack Query 的 invalidate 机制即可，不引入额外 broker

### C. 与 Karpathy 原 gist 的分叉点

| Karpathy 原方法 | 本项目调整 | 原因 |
|----------------|-----------|------|
| Wiki 替代原文查询 | Wiki + 原文样本通道并存 | 小说的"声音/语气/留白"不能被摘要 |
| 断言无强制出处 | 每条事实带 `[ch-N]` / `[bible]` + 三态可信度 | 作者审计 + lint 复核 + 防 LLM 脑补污染 |
| Wiki 视图为准 | Bible/Wiki 分歧时双写到上下文 | StoryBible 是作者的最终意图，不能被 LLM 静默覆盖 |
| 拒绝人工编辑（gist 隐含） | 允许编辑 + author-note 块保护 | 作者元洞察是 LLM 抽不出来的 |
| 永不向量检索 | 主存储不向量化；> 200 页时向量化作为 Query 加速 | 规模化时 LLM 读完整 index 不现实 |
| 冲突等 Lint 发现 | Ingest 实时输出 divergences | 早发现早决策，避免污染累积 |
| 单文件持久化 | Ingest staging + 原子 rename + 滚动 .bak（hardlink）+ history.jsonl | 跨 15+ 页的更新必须事务化；不用 git——SaaS 形态下 .git 目录是运维包袱 |

### D. 参考资料

- [Karpathy LLM Wiki Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — 方法论原始出处
- [Karpathy 原始推文](https://x.com/karpathy/status/2040470801506541998)
- [WUPHF DESIGN-WIKI.md](https://github.com/nex-crm/wuphf/blob/main/DESIGN-WIKI.md) — wiki 可视化设计参考
- [WUPHF WIKI-SCHEMA.md](https://github.com/nex-crm/wuphf/blob/main/docs/specs/WIKI-SCHEMA.md) — wiki schema 规约参考
- [Lilo](https://github.com/abi/lilo) — 另一个采用 LLM wiki 模式的项目
