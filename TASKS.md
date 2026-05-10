# grid-story 任务拆分

工作量按**理想人天**估（单人专注、不含调优反复 / 美术素材生产）。
现实倍率 ×2 较稳。

---

## 阶段 0 · 脚手架（4d）

| ID   | 任务                                                               | 估时 | 依赖 | 验收                      |
| ---- | ------------------------------------------------------------------ | ---- | ---- | ------------------------- |
| T0.1 | 技术栈选型 + 项目初始化（前后端语言、框架、目录结构）              | 1d   | —    | 仓库可启动空白前后端      |
| T0.2 | `Storage` 接入：关系库 + 向量库 + 文件存储                         | 1.5d | T0.1 | 三种存储均可读写          |
| T0.3 | `ModelRouter` 雏形 + Anthropic SDK/Deepseek API 接入 + prompt 缓存 | 1d   | T0.1 | 一次调用打通 Opus / Haiku |
| T0.4 | `PromptRegistry` 雏形（模板加载、变量注入、版本号）                | 0.5d | T0.3 | 模板可外部 yaml/md 管理   |

---

## 阶段 1 · 后端 MVP 闭环（13d）

| ID   | 任务                                                                                  | 估时 | 依赖      | 验收                           |
| ---- | ------------------------------------------------------------------------------------- | ---- | --------- | ------------------------------ |
| T1.1 | `StoryBible` schema 设计（角色 / 地点 / 组织 / 物品 / 时间线 / 概念，强字段 + notes） | 2d   | T0.2      | schema 文档化 + 校验通过       |
| T1.2 | `Book` / `Outline` / `Chapter` / `Annotation` 数据模型                                | 1d   | T1.1      | 四类实体 CRUD 通过单测         |
| T1.3 | `StoryBible` CRUD + 字段校验 + 关系图查询                                             | 1.5d | T1.2      | 角色关系可双向查询             |
| T1.4 | `Outline` CRUD（层级：总纲 / 卷 / 章 / 场景）                                         | 1d   | T1.2      | 层级移动 / 重排不丢数据        |
| T1.5 | `Chapter` CRUD + 多版本（git-like 历史）                                              | 2d   | T1.2      | 任一历史版本可恢复             |
| T1.6 | `ContextComposer` v1（模板拼接：设定切片 + 大纲 + 指令）                              | 2d   | T1.3-T1.5 | 可针对任务类型产出完整 prompt  |
| T1.7 | `OutlineAgent`（idea → 总纲 / 卷纲 / 章纲 / 场景，逐层展开）                          | 1.5d | T1.6      | 给定一句 idea 能产出可入库章纲 |
| T1.8 | `WritingAgent`（场景首稿、续写）                                                      | 1.5d | T1.6      | 输入章纲产出≥2k 字草稿         |
| T1.9 | `WorkflowEngine` v1（最小章节状态机）                                                 | 0.5d | T1.5      | 状态迁移合法性受控             |

**MVP 后端可独立跑：CLI 喂 idea → 出章纲 → 出草稿 → 写入 Chapter。**

---

## 阶段 2 · 前端 MVP（PixiJS 像素风，14d）

| ID   | 任务                                                            | 估时 | 依赖       | 验收                             |
| ---- | --------------------------------------------------------------- | ---- | ---------- | -------------------------------- |
| T2.1 | PixiJS 脚手架 + 像素美术规范（调色板 / 字体 / 网格 / 缩放策略） | 2d   | T0.1       | 规范文档 + Demo 场景             |
| T2.2 | `PixelKit` 基础组件（按钮 / 输入 / 对话框 / 列表 / 滚动）       | 3d   | T2.1       | 组件 Storybook 化展示            |
| T2.3 | `BibleStudio`（角色卡 / 列表 / 编辑 / 关系图最小版）            | 3d   | T2.2, T1.3 | 可视化 CRUD 一名角色；AI 扩展已完成（6类实体 schema-driven 编辑 + AI 生成/refine/per-field 优化 + Story Charter 约束全链路注入）<br>✅ T2.3.P1：角色表单支持 `relationships` 增删改；保存后关系图反映更新 |
| T2.4 | `WritingDesk` 基础编辑器 + AI 触发按钮                          | 3d   | T2.2, T1.8 | 写作页能调 WritingAgent 产出草稿 |
| T2.5 | `OutlineCanvas` 卡片视图（层级 + 拖拽）                         | 2d   | T2.2, T1.4 | 拖卡片改大纲层级                 |
| T2.6 | 端到端串通 MVP 流（前后端打通 + 体验调优）                      | 1d   | 全部前面   | 能从 0 到产出第一章              |

---

## 阶段 3 · V1 记忆与质量（17d + patches）

> **记忆机制变更**：原 T3.1 向量混合检索 + T3.2 Summarizer 已合并为 **MemoryWiki**（Karpathy LLM Wiki 模式）。
> MemoryWiki 是阶段 3 最核心的模块，详细设计见 **[`MEMORY-WIKI.md`](./MEMORY-WIKI.md)**。
> Bible 是规范（作者定义），Wiki 是观察（LLM 从正文提炼），两者互补校验。

| ID   | 任务                                                               | 估时 | 依赖            | 验收                                       |
| ---- | ------------------------------------------------------------------ | ---- | --------------- | ------------------------------------------ |
| T3.1 | `MemoryWiki`（LLM 维护的 markdown wiki 记忆系统，含 IngestPipeline / QueryNavigator / LintRunner / Summarizer，详见 MEMORY-WIKI.md）✅ 核心完成；实体挂载补丁见 T3.1.P1 | 6d   | T0.2, T1.1, T1.5 | 章定稿 → wiki 自动更新；写作前从 wiki 获取精准上下文；lint 可检出矛盾；前端 WikiBrowser 上线；E2E 测试覆盖 |
| T3.2 | `ContextComposer` v2（接 MemoryWiki QueryNavigator，替换旧向量检索路径）✅ 已并入 T3.1 Sprint 2 | 1d   | T3.1            | prompt 上下文全部来自 wiki 页面，无 embedding 调用 |
| T3.3 | `RewriteAgent`（扩写 / 缩写 / 润色 / 换风格 / 换视角）✅ 已完成    | 1d   | T3.2            | 五种改写均能跑通                           |
| T3.4 | `ReviewAgent` v1（OOC / 设定冲突 / 时间线 / 伏笔，可结合 LintRunner）✅ 已完成 | 3d   | T3.1, T3.2      | 输出结构化问题列表                         |
| T3.5 | `BibleAgent`（章节产出新设定 → 提示作者入库）✅ 已完成             | 1.5d | T3.4            | 每章自动给出新设定建议                     |
| T3.6 | `FeedbackLoop` v1（接受 / 拒绝 / 编辑记录沉淀）✅ 已完成           | 1.5d | T1.9            | 反馈数据可导出                             |
| T3.7 | `WritingDesk` 进阶：diff 视图 + 段落级批注 + 局部重写触发✅ 已完成 | 3d   | T2.4            | 选段触发 RewriteAgent 并 diff              |

### 阶段 3 当前缺口

| ID       | 状态   | 还差什么 |
| -------- | ------ | -------- |
| T3.1     | 已完成 | MemoryWiki 核心与 `T3.1.P1`（Wiki ↔ Bible 实体挂载 + 主角标记）均已完成。 |
| T3.2     | 已完成 | 已接入 MemoryWiki QueryNavigator，无 embedding 路径。 |
| T3.3     | 已完成 | 五种改写模式已接入选区改写与全文 AI 修订；`rewriteMode` 已贯穿 UI、后端 schema、WritingAgent、prompt，并补后端单测。 |
| T3.4     | 已完成 | OOC / 设定冲突 / 时间线 / 伏笔四类审稿维度已进入共享 schema、prompt、ReviewPanel 与 ReviewAgent 上下文；补 schema / agent 单测。 |
| T3.5     | 已完成 | 审稿后自动扫描章节新设定，生成强类型 Bible 入库候选；作者可在写作页“入库”面板选择入库或忽略。 |
| T3.6     | 已完成 | AI 候选与 Bible 入库候选的接受 / 拒绝反馈已持久化到 `feedback_record`，并提供 JSON 导出接口。 |
| T3.7     | 已完成 | AI 候选面板支持 diff 视图；写作页右栏支持段落级批注、定位、完成与段落级改写触发。 |

---

## 阶段 4 · StoryEngine · 故事引擎升级（17d）

> **产品形态升级**：从「AI 写作助手」→「角色驱动的故事模拟器 + 作者导演台」。
> 详细需求见 [`STORY-ENGINE.md`](./STORY-ENGINE.md)。
> 核心思想：剧情不预设走向，由角色 Drives + DecisionProfile + WorldVariable + 作者外部压力**自我生长**；作者通过 DirectorPanel 调参数 + 拍板分支驱动剧情。
> 通过 `books.engine_mode = 'simulation'` 与旧"按章纲写"流程隔离，渐进上线。

| ID   | 任务                                                                                                            | 估时 | 依赖       | 验收                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------- | ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| T4.1 | StoryEngine Schema & DB 迁移：DecisionProfile / Drive / Relationship（升级独立表）/ WorldVariable / ChekhovHook / SceneSimulationResult；`books.engine_mode` 字段 | 3d   | T1.1       | Zod schema 完整 + drizzle migration 应用 + 旧 `character.relationships` 数据迁移到新 relationships 表                              |
| T4.2 | `SimulationEngine` v1：单 LLM 群戏推演 + 结构化输出（stateDelta）+ MemoryWiki 上下文注入 + CausalGraph 落库       | 4d   | T4.1, T3.1 | 给定初始条件能产出 primaryBranch + ≥2 alternativeBranches + 完整 stateDelta；characterChoiceJustifications 必填且 ID 引用校验通过 |
| T4.3 | `ReviewAgent` 扩展：人物绑架检测（character-hijack-detector）                                                   | 1d   | T4.2       | 每条决策对照 DecisionProfile 二次评分；与 SimulationEngine 自评分歧 > 3 标记"可能 OOC"                                            |
| T4.4 | `ChekhovHookPool` + `PacingCritic`：钩子主动队列 + 节奏裁判（章末打分 + 模拟前注入节奏目标 + 候选钩子）         | 2d   | T4.2       | 模拟前 PayoffSelector 注入 top-N 候选钩子；连续 3 章 conflictDensity < 3 触发 PacingTimeline 警告                                 |
| T4.5 | `OffscreenTicker`：Tier 分级时间推进（Tier-1 详细 / Tier-2 批量 / Tier-3 跳过）✅ 已完成（Sprint 4：character.importance 字段 + tier1/tier2 prompt + NpcSimulator + TickScheduler 接 onChapterFinalized + offscreen-actions API + WritingDesk OffscreenLogViewer） | 1.5d | T4.2       | 章 finalized 自动 tick；Drive 进度回写；总 token < 5k/章                                                                          |
| T4.6 | `DirectorPanel`（5 工具：注入事件 / 调环境 / 改 Drive / 调关系 / 投钩子）+ BibleStudio 扩展（DecisionProfileEditor / DriveBoard / RelationshipMatrix / WorldVariablePanel） | 2.5d | T4.1       | 5 干预工具均可触发；参数变更入对应 history；干预**不直接生成文字**——只改下次模拟读到的参数                                       |
| T4.7 | 前端集成与 E2E：SceneRunner / SceneStateInspector / CausalGraphViewer / PacingTimeline / engineMode 切换 + 端到端测试 ✅ Sprint 5 完成（SceneRunner / SceneStateInspector / SceneEngineDrawer / CausalGraphViewer / engineMode 切换 + WritingDesk 集成 + 像素主题复核 + `scripts/smoke-story-engine.sh` 真实 LLM E2E + DEVELOPER.md StoryEngine 章节） | 3d   | T4.2-4.6   | E2E：建 book → 设角色 + Drives + Relationship + WorldVariable → 跑 3 章 → 全程作者只在 DirectorPanel 干预 + Inspector 选分支 → 产出连贯小说 |

**StoryEngine 后端可独立跑：CLI 喂初始条件 → 模拟场景 → 输出 stateDelta + 多走向 → 拍板入库。**

---

## 阶段 5 · V2 美术与连载（22d）

| ID   | 任务                                                     | 估时 | 依赖       | 验收                          |
| ---- | -------------------------------------------------------- | ---- | ---------- | ----------------------------- |
| T5.1 | `AssetLibrary` 数据模型 + 与 Bible 实体 1:1 关联         | 1d   | T1.3       | 角色可绑定立绘资产            |
| T5.2 | `ArtAgent`（接外部像素生图 API,输入设定输出 prompt）     | 2d   | T5.1       | 角色 → 立绘 prompt → 图       |
| T5.3 | `ArtViewer`（资产管理 / 预览 / 替换）                    | 2d   | T5.1, T2.2 | 上传 / 替换立绘可视化         |
| T5.4 | 像素立绘 / 场景资产规范与初始素材集                      | 3d   | T2.1       | 一套通用 UI + 5 角色 + 3 场景 |
| T5.5 | `PublishPipeline`（章节排程 / 发布 / 订阅推送）          | 2d   | T1.5       | 定稿章可发布、可定时          |
| T5.6 | `Reader`（像素阅读器：立绘随对话切换 + 场景背景 + 音效） | 5d   | T5.3, T5.5 | 读完一章带立绘对话切换        |
| T5.7 | `CommentBus`（读者评论 → 作者反馈面板）                  | 2d   | T5.6       | 评论可流回写作侧              |
| T5.8 | `EvalDataset` + 回归脚本（prompt / 模型变更必跑）        | 2d   | T3.4       | 一键跑出对比报告              |
| T5.9 | `OutlineCanvas` 进阶（思维导图 / 时间线视图）            | 3d   | T2.5       | 切换两种视图                  |

---

## 阶段 6 · 平台化（按需，8d）

| ID   | 任务                                           | 估时 | 依赖 | 验收             |
| ---- | ---------------------------------------------- | ---- | ---- | ---------------- |
| T6.1 | `Auth`（用户 + 作品权限）                      | 2d   | T0.2 | 多用户隔离作品   |
| T6.2 | `Billing` / `Quota`（模型调用计量与配额）      | 3d   | T0.3 | 超限拦截         |
| T6.3 | `Telemetry`（tokens / 时延 / 命中率 / 失败率） | 2d   | T0.3 | 仪表盘有四类指标 |
| T6.4 | `Dashboard`（写作进度 / 章节状态 / 读者数据）  | 1d   | T2.2 | 单页综览         |

---

## 补丁 / Patches

阶段验收外发现的小缺口,以补丁形式追加。
- 单点小补丁(角色关系编辑) → 详见 [`TASKS.patch.md`](./TASKS.patch.md)
- MVP 产品化 polish(沉浸感 / 去开发味 / 编辑器基线) → 详见 [`TASKS.polish.md`](./TASKS.polish.md)

| ID         | 标题                          | 挂靠  | 估时   | 状态     |
| ---------- | ----------------------------- | ----- | ------ | -------- |
| T2.3.P1    | 角色关系编辑                  | T2.3  | 0.75d  | 已完成   |
| T2.6.P1    | 去开发味(文案/路由清扫)      | T2.6  | 0.5d   | 已完成   |
| T2.6.P2    | 故事工作台 + 二级导航         | T2.6  | 2d     | 已完成   |
| T2.6.P3    | Writing 三栏会话容器          | T2.6  | 1.5d   | 已完成   |
| T2.6.P4    | 编辑器沉浸基线                | T2.4  | 1d     | 已完成   |
| T2.6.P5    | 进度仪表(mini-stats)         | T2.6  | 0.5d   | 已完成   |
| T2.3.P2    | Bible 全景关系图              | T2.3  | 1d     | 已完成   |
| T2.4.P1    | AI 产出可追溯(MVP 版)        | T2.4  | 1d     | 已完成   |
| T2.6.P6    | 文中设定高亮                  | T2.6  | 0.5d   | 已完成   |
| T2.4.P2    | AI 选区改写                  | T2.4  | 1d     | 待开工   |
| T2.4.P3    | AI 审稿(ReviewAgent)         | T2.4  | 1d     | 待开工   |
| T3.1.P1    | Wiki ↔ Bible 实体挂载 + 主角标记 | T3.1  | 2d     | 已完成   |

### T3.1.P1 验收口径

1. Wiki 实体页可手动挂载到已有 Bible entity；后端拒绝把同一个 Bible entity 挂到多个 Wiki 页面。
2. Wiki 实体页可从当前观察创建新的 Bible entity，创建后自动写回 `bible_entity_id`。
3. 支持最小主角标记：至少能在 Bible 中明确“主角角色”，使 `protagonist` / “主角”类 Wiki 观察可被挂到作者定义的角色。
4. 挂载只改 frontmatter，不改正文事实；后续 ingest 必须保留已挂载的 `bible_entity_id`，LLM 不得覆盖。
5. WikiBrowser 展示挂载状态，并提供“挂载已有 / 创建并挂载”入口；BibleEntityEditor 能跳转到已挂载 Wiki 页。
6. 单测覆盖唯一性约束、类型匹配、已挂载实体拒绝、创建后自动挂载；前端至少覆盖关键 API 调用路径。

---

## 推进建议

1. **不要并行两个阶段**：MVP 没跑通前别碰 V1，否则上下文管理会被卡死。
2. **先 T1.1**：StoryBible schema 是后续所有模块的"地基"，地基不稳后面全要重来。
3. **T2.1 的像素规范也要早定**：调色板 / 像素尺寸 / 字体如果中途换，前端要重做。
4. **prompt 调优时间单独留**：能力层每个 Agent 实际是"写代码 1d + 调 prompt 3-5d"，做心理准备。
5. **里程碑**：MVP（T2.6 完成）是第一个值得庆祝的点 — 此时已能产出真正的小说草稿。
