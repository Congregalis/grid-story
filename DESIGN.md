# grid-story 设计文档

## 产品定位
AI 辅助小说创作工具，**人机共创 + 长篇连载**。
前端 **PixiJS 像素二次元风**，角色立绘 / 场景立绘 / 像素动效作为差异化体验。

## 设计原则（贯穿所有模块）
1. **长篇** → 分层记忆（结构化设定 + 滚动摘要 + 混合检索）
2. **共创** → 有状态、可回退、可批注；作者拥有最终决定权
3. **连载** → 章为单位的半自动流水线，不是批量出书
4. **设定库走强 schema**（核心字段结构化 + `notes` 自由字段兜底）

---

## 模块拆解（按层）

### 一、数据层（领域模型）
| 模块           | 职责                                                        |
| -------------- | ----------------------------------------------------------- |
| `Book`         | 作品元数据、题材、风格基调、目标字数、连载状态              |
| `StoryBible`   | 强 schema 设定库：角色 / 地点 / 组织 / 物品 / 时间线 / 概念 |
| `Outline`      | 层级大纲：总纲 → 卷 → 章 → 场景                             |
| `Chapter`      | 章节正文 + 多版本 + 状态机（草稿/审阅/定稿/发布）           |
| `Annotation`   | 批注与反馈，作为反馈闭环数据源                              |
| `AssetLibrary` | 像素美术资产，与 Bible 实体 1:1 关联                        |

### 二、记忆层
> 记忆机制采用 **Karpathy LLM Wiki** 模式，详见 [`MEMORY-WIKI.md`](./MEMORY-WIKI.md)。
> Bible 是规范（作者定义），Wiki 是观察（LLM 从正文提炼），两者互补校验。

| 模块              | 职责                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| `MemoryWiki`      | **系统记忆核心**。LLM 增量维护的 markdown wiki 知识库：IngestPipeline（章定稿→自动更新wiki）、QueryNavigator（写作前→导航到精准上下文）、LintRunner（一致性检查）。替代旧 Retriever + Summarizer |
| `ContextComposer` | **系统心脏**。按任务类型动态拼 prompt：设定切片 + wiki 上下文块 + 当前大纲 + 指令 |
| `TimelineTracker` | 维护事件时间线，供一致性检查（MemoryWiki tracking 页面的后端逻辑）                     |

### 三、能力层（AI 工具，每个都是结构化 IO 的可调用单元）
| 模块           | 职责                                                           |
| -------------- | -------------------------------------------------------------- |
| `OutlineAgent` | idea → 总纲 → 卷纲 → 章纲 → 场景，逐层展开                     |
| `WritingAgent` | 场景首稿、续写                                                 |
| `RewriteAgent` | 扩写 / 缩写 / 润色 / 换风格 / 换视角                           |
| `ReviewAgent`  | 一致性检查（OOC、设定冲突、时间线、伏笔）+ 文风校对 + 节奏诊断 |
| `BibleAgent`   | 从新章节自动抽取新设定项，提示作者入库                         |
| `ArtAgent`     | 基于设定生成像素立绘 prompt（接外部生图模型）                  |

### 四、编排层
| 模块             | 职责                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `WorkflowEngine` | 章节工作流状态机：大纲 → 草稿 → 自动审 → 人审 → 改写 → 定稿 → 入摘要/检索                                |
| `TaskQueue`      | 异步任务（长生成、批量审、摘要）                                                                         |
| `ModelRouter`    | 任务-模型路由：Opus 4.7 跑首稿/改写/审稿，Haiku 4.5 跑摘要/校对/分类，支持切换deepseek；统一 prompt 缓存 |
| `PromptRegistry` | prompt 模板版本化 + A/B + 命中率统计                                                                     |

### 五、反馈与质量
| 模块             | 职责                                                       |
| ---------------- | ---------------------------------------------------------- |
| `FeedbackLoop`   | 作者接受/拒绝/编辑/批注 → 偏好数据，回灌 prompt 与召回权重 |
| `QualityMetrics` | 客观（冲突数、字数节奏、可读性）+ 主观（LLM 评审，可选）   |
| `EvalDataset`    | 内部回归评测集，prompt/模型变更前必跑                      |

### 六、连载与读者侧
| 模块              | 职责                                               |
| ----------------- | -------------------------------------------------- |
| `PublishPipeline` | 定稿章节发布、排程、订阅推送                       |
| `Reader`          | 像素风阅读器（立绘随对话切换、场景背景、轻量音效） |
| `CommentBus`      | 读者评论 → 作者反馈面板（可选喂回 ReviewAgent）    |

### 七、前端（PixiJS 像素二次元）
| 模块            | 职责                                                |
| --------------- | --------------------------------------------------- |
| `WritingDesk`   | 章节工作台：编辑器 + diff + 批注 + 局部重写触发器   |
| `BibleStudio`   | 设定库 CRUD + 角色卡 + 关系图 + 时间线              |
| `OutlineCanvas` | 层级大纲视图（卡片流 / 思维导图）                   |
| `ArtViewer`     | 像素立绘与场景资产管理                              |
| `Dashboard`     | 写作进度、章节状态、订阅/读者数据                   |
| `PixelKit`      | 像素 UI 组件库 + 美术规范（按钮、对话框、过场动效） |

### 八、平台基础设施
| 模块        | 职责                                                   |
| ----------- | ------------------------------------------------------ |
| `Auth`      | 用户与作品权限（单作者起步，预留协作位）               |
| `Storage`   | 版本化章节存储（git-like）+ 关系库 + 向量库 + 资产 CDN |
| `Billing`   | 模型调用计量与配额（SaaS 形态启用）                    |
| `Telemetry` | tokens 用量、生成时延、prompt 命中、失败率             |

---

## 调用链（简化）
```
前端 Studio
    └─> 编排层 (WorkflowEngine / TaskQueue)
            └─> 能力层 (各 Agent)
                    └─> 记忆层 (MemoryWiki / ContextComposer)
                            └─> 数据层
ModelRouter + PromptRegistry 横切于能力层下方
```

---

## 阶段路线
- **MVP**：数据层 + `ContextComposer` + `OutlineAgent` + `WritingAgent` + `WritingDesk` + `BibleStudio` + 最小 `PixelKit`。跑通"idea → 章纲 → 草稿 → 人审 → 入库"。
- **V1**：补 `MemoryWiki` / `RewriteAgent` / `ReviewAgent` / `FeedbackLoop` / `OutlineCanvas` / `ArtViewer`。
- **V2**：上 `PublishPipeline` / `Reader` / `CommentBus` / `EvalDataset`。
