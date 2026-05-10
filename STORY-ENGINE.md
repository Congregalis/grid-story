# StoryEngine 需求文档

> **产品形态升级**：从「AI 写作助手」 → 「角色驱动的故事模拟器 + 作者导演台」。
> 作者的身份从「亲自写每一句」转为「**vibe 写**」——设定角色 / Drives / 关系张力 / 世界变量，并通过扰动外部压力让 AI 推动剧情自我生长。
>
> 方法论来源：本项目 `competing_products/thinking.md`（关系位移 × 性格选择 × 外部压力）+ Stanford Generative Agents（Smallville）+ 桌游 GM 范式 + AI Dungeon 的故事引擎。
>
> **核心取舍**：纯模拟产出"真实但不好看"的流水账。本系统不追求纯 emergent，而是「**模拟为骨，作者为魂**」——AI 推演符合人物的多种走向，作者像导演一样选最有戏的那条、并适时丢压力；钩子 / 伏笔 / 节奏裁判等"小说必备"机制内置，保证最终产物是**能吸引读者的优质小说**。
>
> 与现有模块的关系：StoryBible 增量扩展（DecisionProfile / Drives / Relationship 升级 / WorldVariable / ChekhovHook 等成为一等实体）；MemoryWiki 不变（仍是"已发生事实的索引"）；新增 SimulationEngine / DirectorPanel / OffscreenTicker / PacingCritic 模块。

---

## 1. 背景与目标

### 1.1 当前系统的根本局限

当前 `OutlineAgent → WritingAgent` 链路本质是「**作者写大纲，AI 填字**」：

| 维度 | 现状 | 与"角色驱动"的差距 |
|------|------|-------------------|
| 关系 | `Character.relationships[].description` 是自然语言描述 | 关系**没有张力轴**（阶级差/信息差/情感差），无法驱动剧情 |
| 性格 | `Character.personality` 是自由文本 | 形容词级别（"务实/阴冷"），AI 无法据此**推演具体决策** |
| 动机 | `Character.motivation` 是单字段 | 没有**短/中/长期目标分层**，没有目标演化轨迹，角色不"主动" |
| 环境 | Bible 的 location/concept 是静态档案 | 没有**可变世界状态**（饥荒/战争/季节/舆论），作者无"压力旋钮" |
| 剧情产生 | OutlineAgent 预设场景走向 → WritingAgent 填字 | **剧情绑架人物**——剧情写在前，人物被迫服从，OOC 频发 |
| 一致性检查 | ReviewAgent 查"事实矛盾" | 不查"**人物绑架**"——这是网文扑街的最大杀手 |
| 时间 | 章 → 章线性推进，作者驱动每一步 | 世界永远只在镜头前活着，主角离开的村庄永远定格 |
| 钩子/伏笔 | 由 MemoryWiki tracking 被动记录 | 没有**主动种植和回收**机制，长篇容易成流水账 |
| 节奏 | 无系统判断 | 全靠作者直觉，疲劳后冲突浓度失控 |

### 1.2 StoryEngine 的目标

让作者通过**设定 + 干预**，而非**逐句写**，产出长篇连载小说：

1. **角色自主**：每个角色有结构化的 `Drives`（欲望）+ `DecisionProfile`（决策风格），AI 推演场景时，角色按"我想要 X、面对 Y 我会怎么选"**自主选择行为**，而不是按预设走向表演
2. **关系是矢量**：`Relationship` 升级为一等实体，带张力轴 (`tensionAxes`) 和目标位移 (`targetTrajectory`)；每场戏后张力曲线**显式更新**
3. **世界是活的**：`WorldVariable`（经济/政治/季节/舆论...）作为可变状态，作者一拨滑杆，所有角色 Drives 优先级自动重排
4. **作者是导演**：`DirectorPanel` 提供 GM 工具集——注入事件 / 调环境 / 改 Drive / 调关系张力 / 投钩子；不在编辑器里打字，而是**操纵命运**
5. **场景是模拟单元**：每个场景的 LLM 输出不只是文字，而是**结构化的世界状态变更**（叙事 + 关系 Δ + Drives 进度 + 环境影响 + 钩子种植/兑现 + 因果链节点）
6. **时间在跑**：每章定稿后，未在场角色按自己 Drives 在后台"过日子"，下次出场时世界已变
7. **小说必备机制内置**：`ChekhovHookPool`（钩子池）+ `PacingCritic`（节奏裁判）保证模拟出来的剧情**好看**，不只是"真实"
8. **作者拍板**：默认产品流是 "AI 推演 1 主走向 + N 候选走向 → 作者选/改/拒一条 → 入库"——保留作者的**最终决定权和仪式感**

### 1.3 核心原则

1. **角色驱动剧情，剧情不绑架角色**：任何场景输出，必须能被"该角色的 DecisionProfile + Drives + 当下情境"解释；ReviewAgent 强制做"人物绑架检测"
2. **关系位移产生戏，性格决定怎么选**：场景必须有「初始关系状态 + 压力源」作为输入，**不许预设结局**；结局由模拟产生
3. **作者保留拍板权**：模拟的输出永远是「主走向 + 候选走向」，作者最终选定的版本才入 Chapter / 触发 MemoryWiki Ingest
4. **模拟分级，控制成本**：前台场景用 Opus 群戏推演；off-screen 用 Haiku 一句话快进；Director Panel 调整不动 LLM
5. **结构化输出强制可审计**：每个场景的状态变更必须是结构化 JSON（Zod schema），可被 UI 渲染、可被 ReviewAgent 校验、可被 Lint 追溯
6. **不破坏现有 MVP**：StoryEngine 是**新模式**，旧的"按章纲写"模式仍可用；通过 Book 级开关 `engineMode: "scripted" | "simulation"` 切换
7. **复用 MemoryWiki，不重复造轮子**：场景定稿后仍然走 MemoryWiki Ingest；StoryEngine 只管"未发生事件的推演"，MemoryWiki 管"已发生事实的索引"
8. **硬规则继承 CLAUDE.md**：Anthropic SDK / Postgres + pgvector / Zod schema / ModelRouter / prompt 模板 .md 文件全部继承

---

## 2. 核心方法论

### 2.1 剧情产生公式

```
剧情 = f(关系张力, 性格决策, 外部压力, 已埋钩子)

其中：
  关系张力  = Σ tensionAxes(class_diff, info_diff, emotion_diff)
  性格决策  = DecisionProfile.respond(situation, drives, relations)
  外部压力  = WorldVariable + AuthorInjectedEvent
  已埋钩子  = ChekhovHookPool.pendingHooks(scene_context)
```

**作者的工作不是写 f(...)，是调参数**：调 Drives、调 tensionAxes、调 WorldVariable、注入 Event、投钩子；然后看 AI 跑出来的 f 值。

### 2.2 作者—AI 角色重新分工

| 任务 | 旧模式 | StoryEngine 模式 |
|------|--------|----------------|
| 写章节大纲 | 作者写 / OutlineAgent 写 | OutlineAgent 只写**主线锚点**（卷目标、关键转折预留），不写场景级走向 |
| 写场景大纲 | 作者 / Outline 写 "ABC 三段发生什么" | 作者只设**场景初始条件**（关系状态、出场角色、压力源），结局由模拟产出 |
| 设定角色 | 自由文本字段 | 结构化 `DecisionProfile` + `Drives` + 升级版 `Relationship` |
| 设定世界 | 静态条目 | 静态条目 + **可变 `WorldVariable`** |
| 写章节正文 | WritingAgent 按大纲填字 | SimulationEngine 群戏推演 → 输出主走向 + 候选 → 作者选/改 |
| 推动剧情 | 作者写下一章大纲 | 作者在 DirectorPanel **丢压力 / 改 Drive / 投钩子** |
| 一致性检查 | ReviewAgent 查事实冲突 | 同 + **人物绑架检测** + **节奏诊断** |

### 2.3 五个核心抽象

| 抽象 | 定位 | 谁维护 |
|------|------|-------|
| **DecisionProfile** | 角色面对压力时的反应模式（触发器 → 默认反应） | 作者定义，BibleAgent 可建议 |
| **Drive** | 角色的欲望/目标（短/中/长期，带优先级和进度） | 作者定义初值，SimulationEngine 推演中演化 |
| **Relationship**（升级） | 角色对之间的张力矢量 + 目标位移轨迹 | 作者定义初值，SimulationEngine 每场戏后更新张力 Δ |
| **WorldVariable** | 可变世界状态（经济/政治/季节/舆论...） | 作者定义和调整，SimulationEngine 受其影响、也可改变它 |
| **ChekhovHook** | 待兑现的伏笔/钩子，带 urgency 和 preferred_payoff_window | SimulationEngine 自动种植/兑现，作者可手动投放 |

这五个抽象 + 现有 Bible 实体 = StoryEngine 的全部输入。

---

## 3. 系统架构

### 3.1 模块分解

```
StoryEngine（后端服务模块）
  apps/server/src/story-engine/
    ├─ schema-extensions/        DecisionProfile / Drive / Relationship / WorldVariable / Hook 的领域服务
    ├─ simulation-engine/        SceneSimulator：场景级 LLM 群戏推演
    │   ├─ scene-runner.ts       单 LLM 模式：一次调用模拟所有出场角色（默认）
    │   ├─ multi-agent-runner.ts 多 LLM 模式：每个角色独立 LLM 实例（高质量场景可选）
    │   └─ output-parser.ts      结构化输出解析与校验
    ├─ director/                 作者干预接口
    │   ├─ event-injector.ts     注入突发事件
    │   ├─ pressure-tuner.ts     调 WorldVariable
    │   ├─ drive-editor.ts       改 Drive
    │   └─ hook-planter.ts       手动投钩子
    ├─ offscreen-ticker/         未在场角色的后台时间推进
    │   ├─ tick-scheduler.ts     在章定稿后触发
    │   └─ npc-simulator.ts      Haiku 一句话推演非聚焦角色
    ├─ hooks-pool/               钩子池管理
    │   ├─ hook-store.ts
    │   └─ payoff-selector.ts    节奏裁判调用，挑该兑现的钩子
    ├─ pacing-critic/            节奏诊断
    │   └─ pacing-evaluator.ts   每章打分（冲突浓度/情感强度/信息密度）
    ├─ causality/                因果链管理
    │   └─ causal-graph.ts       记录场景间因果关系，供 ReviewAgent / 改写影响分析
    └─ engine-coordinator.ts     编排：Director 操作 → Simulation 触发 → MemoryWiki Ingest

ReviewAgent 扩展（apps/server/src/agents/review-agent/）
  └─ character-hijack-detector.ts  人物绑架检测：选择 vs DecisionProfile 评分

WorkflowEngine 扩展
  └─ 新增状态：scene-simulating / scene-pending-author / scene-finalized
  └─ 章定稿后触发 OffscreenTicker.tick()

Bible Studio 扩展（前端）
  ├─ DecisionProfileEditor    角色卡新增 tab
  ├─ DriveBoard                Drives 看板（按角色组织）
  ├─ RelationshipMatrix        关系张力矩阵（替代当前关系图的子页面）
  └─ WorldVariablePanel        世界变量编辑

Writing Desk 扩展（前端）
  ├─ DirectorPanel             GM 控制台（侧边抽屉）
  ├─ SceneRunner               场景运行 UI（输入初始条件 → 触发模拟 → 看主走向 + 候选）
  ├─ SceneStateInspector       结构化输出可视化（关系 Δ / Drives 进度 / 钩子）
  └─ PacingTimeline            节奏曲线时间线
```

### 3.2 与既有模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                     StoryBible（扩展）                           │
│  Character + DecisionProfile + Drives                            │
│  Relationship（升级为一等实体）                                  │
│  WorldVariable（新）                                             │
└────────────┬────────────────────────────────────────────────────┘
             │ 提供"角色 + 关系 + 环境"输入
             ↓
┌─────────────────────────────────────────────────────────────────┐
│                   StoryEngine（新模块）                          │
│  ┌──────────────┐    ┌─────────────────┐   ┌───────────────┐  │
│  │ DirectorPanel│───>│ SimulationEngine│<──│ ChekhovHooks  │  │
│  │ （作者干预） │    │  （场景推演）   │   │ （钩子池）    │  │
│  └──────────────┘    └────────┬────────┘   └───────────────┘  │
│                               │                                  │
│                               v                                  │
│                       ┌───────────────┐                          │
│                       │ PacingCritic  │                          │
│                       │ （节奏裁判）  │                          │
│                       └───────┬───────┘                          │
│                               v                                  │
│                  ┌──────────────────────┐                        │
│                  │ 主走向 + 候选走向    │                        │
│                  │ + 结构化状态变更    │                        │
│                  └──────┬───────────────┘                        │
└─────────────────────────┼──────────────────────────────────────┘
                          │ 作者拍板选定 → 入 Chapter
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│              Chapter / WorkflowEngine（既有）                    │
│  状态变更：scene-simulating → scene-pending-author → finalized   │
└────────────┬─────────────────────────────────────────┬──────────┘
             │ 章定稿                                    │
             ↓                                          ↓
┌──────────────────────┐                   ┌──────────────────────┐
│   MemoryWiki Ingest  │                   │ OffscreenTicker      │
│   （已发生事实索引） │                   │ （时间推进 + NPC ）  │
└──────────────────────┘                   └──────────────────────┘
                                                       │
                                                       v
                                          回写 Drive 进度 / Relationship Δ
```

**关键边界**：
- StoryEngine **不写** MemoryWiki 页面；它产生新章节正文，章定稿后由现有 MemoryWiki IngestPipeline 处理
- StoryEngine **读** MemoryWiki QueryNavigator 拿"已发生事实"作为模拟前的上下文
- StoryEngine **写** StoryBible 的扩展字段（Drives 进度 / Relationship 张力 / WorldVariable）——这些是"动态状态"，不是设定

### 3.3 数据流（典型场景）

```
1. 作者在 BibleStudio 设定角色 A、B、C 的 DecisionProfile + Drives
   设定初始 Relationship(A→B): tensionAxes={class:-3, info:0, emotion:+2}, targetTrajectory="俯视→仰望"
   设定 WorldVariable: economy=normal, season=summer

2. 作者在 OutlineAgent 写卷目标："A 与 B 决裂并各自独立"

3. 作者打开 WritingDesk 写下一章
   在 SceneRunner 设定场景初始条件：
     - 出场：A, B
     - 地点：京都酒馆
     - 压力源：A 收到家中急信（用 EventInjector 注入）
     - 不预设结局

4. SimulationEngine.runScene(...)
   ├─ QueryNavigator 从 MemoryWiki 拉相关 wiki 页 + 原文样本
   ├─ 加载 A、B 的 DecisionProfile + Drives + 当前 Relationship
   ├─ 加载 WorldVariable 当前值
   ├─ 加载 ChekhovHookPool 待兑现的钩子（按相关性筛）
   ├─ PacingCritic 给本章建议节奏目标
   ├─ LLM 群戏推演（Opus），输出：
   │    {
   │      narrative: "...小说正文...",
   │      stateDelta: {
   │        relationships: [{from: A, to: B, axis: emotion, delta: -3, reason: "..."}],
   │        drives: [{character: A, driveId: ..., progress: +15%, reason: "..."}],
   │        worldVariables: [{name: "rumor", delta: "+1", reason: "..."}],
   │        plantedHooks: [...],
   │        paidOffHooks: [...],
   │        causalLinks: [...]
   │      },
   │      alternativeBranches: [
   │        {label: "更激烈：A 当场动手", narrative: "...", stateDelta: {...}},
   │        {label: "更隐忍：A 选择记账", narrative: "...", stateDelta: {...}}
   │      ]
   │    }
   └─ ReviewAgent.checkCharacterHijack(...)：每条决策对照 DecisionProfile 评分

5. 前端 SceneStateInspector 渲染主走向 + 候选 + 状态变更预览
   作者：选定一条 / 编辑文字 / 重跑

6. 作者拍板 → 写入 Chapter（finalized）
   ├─ MemoryWiki IngestPipeline.run(...) 触发
   ├─ StoryEngine.applyStateDelta(...) 持久化关系/Drives/世界变量变更
   ├─ ChekhovHookPool 更新（种植 + 兑现）
   ├─ CausalGraph 追加节点
   └─ OffscreenTicker.tick(...)：模拟未在场角色这段时间在干嘛
```

---

## 4. 数据模型

> 全部在 `packages/schema/src/` 新增模块，前后端共享。沿用 `bibleBase` 模式与 Zod。

### 4.1 DecisionProfile（角色决策风格）

```typescript
// packages/schema/src/decision-profile.ts
import { z } from 'zod';

export const decisionTriggerType = z.enum([
  'humiliation',     // 被羞辱
  'betrayal',        // 被背叛
  'opportunity',     // 利益机会
  'threat',          // 受威胁
  'temptation',      // 诱惑（财色权）
  'request_for_help',// 求助
  'authority',       // 面对权威
  'weak_target',     // 面对弱者
  'unknown_info',    // 信息不对称
  'public_eye',      // 公众目光下
]);

export const decisionResponse = z.object({
  triggerType: decisionTriggerType,
  defaultReaction: z.string(),       // "拿账本算账，要现银结清"
  rationale: z.string(),             // "极度务实，关系不重要，利益清算才能止损"
  intensity: z.number().min(1).max(10), // 反应强度
  exceptions: z.array(z.string()),   // "除非对方是母亲（弱点）"
});

export const decisionProfileSchema = z.object({
  characterId: z.string(),
  archetype: z.string().nullable(),  // "务实派 / 暴烈派 / 隐忍派 / 阴谋派"，可选标签
  responses: z.array(decisionResponse),
  hardConstraints: z.array(z.string()),  // "宁死不下跪 / 绝不伤害妹妹"
  blindSpots: z.array(z.string()),       // "被夸聪明就会上头 / 怕水"
  growthArcHints: z.string().nullable(), // 作者预想的弧光走向（可选，给模拟做软约束）
}).strict();

export type DecisionProfile = z.infer<typeof decisionProfileSchema>;
```

**说明**：DecisionProfile 不是死规则，是 AI 推演时的"参考轴"。模拟时 prompt 强制要求"该角色的本次选择必须能被这套 profile 解释；如果偏离，需明确给出'打破常规'的外部压力"。

### 4.2 Drive（角色欲望系统）

```typescript
// packages/schema/src/drive.ts
export const driveHorizon = z.enum(['short', 'medium', 'long']);
export const driveStatus = z.enum(['active', 'achieved', 'abandoned', 'frustrated']);

export const driveSchema = z.object({
  id: z.string(),
  characterId: z.string(),
  horizon: driveHorizon,
  description: z.string(),           // "找到母亲的下落"
  goalState: z.string(),             // "知道母亲生死与现位置"
  motivation: z.string(),            // "童年承诺 + 复仇"
  priority: z.number().min(1).max(10),
  progress: z.number().min(0).max(100),
  status: driveStatus,
  blockers: z.array(z.string()),     // "不知线索从何查起 / 反派在监视"
  evolvedFrom: z.string().nullable(),// 此 Drive 由哪个旧 Drive 演化而来（弧光）
  createdChapter: z.number().nullable(),
  resolvedChapter: z.number().nullable(),
  notes: z.string().nullable(),
}).strict();

export type Drive = z.infer<typeof driveSchema>;
```

**关键**：Drive 是会**演化**的。模拟过程中，事件可能让 Drive 进度推进、被阻塞、被放弃，甚至**孵化新 Drive**（"复仇" → 实施过程中变成"理解仇人"）。

### 4.3 Relationship（升级为一等实体）

> ⚠️ 现状：`Character.relationships[]` 是子字段。新设计**升级为独立表**，旧字段保留做兼容期，逐步迁移。

```typescript
// packages/schema/src/relationship.ts
export const tensionAxis = z.enum(['class', 'info', 'emotion']);

export const tensionVector = z.object({
  class: z.number().min(-10).max(10),  // 阶级差/地位压制；正=A 高于 B
  info: z.number().min(-10).max(10),   // 信息差；正=A 知道更多
  emotion: z.number().min(-10).max(10),// 情感差；正=A 偏向 B（爱），负=恨
});

export const tensionTrajectoryPoint = z.object({
  chapter: z.number(),
  vector: tensionVector,
  trigger: z.string(),  // 这一变化由哪个事件触发
});

export const relationshipSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  fromCharacterId: z.string(),
  toCharacterId: z.string(),
  relationLabel: z.string(),         // "师徒 / 婚约 / 杀父仇人 / 暧昧"，自由文本
  currentTension: tensionVector,
  targetTrajectory: z.object({
    description: z.string(),          // "从俯视→仰望→求我"
    waypoints: z.array(z.object({
      label: z.string(),
      vector: tensionVector,
      hitAtChapter: z.number().nullable(),
    })),
  }).nullable(),
  history: z.array(tensionTrajectoryPoint),
  isPublicKnowledge: z.boolean(),    // 是否所有人都知道这层关系
  notes: z.string().nullable(),
}).strict();

export type Relationship = z.infer<typeof relationshipSchema>;
```

**关键**：
- 张力是**矢量**，不是标量。三轴可以独立演化（同一对人，emotion 升而 class 不动）
- `targetTrajectory` 是作者画的"期望轨迹"，不是硬约束。模拟跑偏时 PacingCritic 会预警
- `history` 是张力曲线，前端 RelationshipMatrix 可以画出来，是"关系演变"的可视化基础

### 4.4 WorldVariable（可变世界状态）

```typescript
// packages/schema/src/world-variable.ts
export const worldVariableType = z.enum([
  'economy',       // 经济（饥荒/普通/富庶）
  'politics',      // 政治（战乱/动荡/太平）
  'season',        // 季节
  'public_opinion',// 舆论风向
  'natural',       // 天灾/瘟疫
  'tech_level',    // 科技/魔法水准
  'custom',        // 自定义
]);

export const worldVariableScopeType = z.enum(['global', 'region']);

export const worldVariableSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  name: z.string(),                  // "京都经济 / 朝堂局势 / 江湖舆论"
  type: worldVariableType,
  scope: z.object({
    type: worldVariableScopeType,
    locationId: z.string().nullable(),  // scope=region 时关联地点
  }),
  currentValue: z.string(),          // "饥荒级别 3" / "战乱"
  scale: z.array(z.object({          // 取值刻度，给前端拨杆 UI 用
    label: z.string(),
    severity: z.number(),
  })),
  affects: z.array(z.string()),      // "降低所有角色的'追求理想'类 Drive 优先级"——给模拟 prompt 当软约束
  history: z.array(z.object({
    chapter: z.number(),
    fromValue: z.string(),
    toValue: z.string(),
    cause: z.string(),
  })),
  notes: z.string().nullable(),
}).strict();

export type WorldVariable = z.infer<typeof worldVariableSchema>;
```

**关键**：`scale` 字段决定前端拨杆 UI 的档位。`affects` 是给 LLM 看的软约束，告诉它"这个变量变了之后，角色应该怎么受影响"。

### 4.5 ChekhovHook（钩子/伏笔池）

```typescript
// packages/schema/src/chekhov-hook.ts
export const hookType = z.enum([
  'foreshadowing',    // 经典伏笔（A 章埋，B 章应）
  'debt',             // 角色间欠的人情/恩怨
  'hidden_object',    // 藏起来的物品（契诃夫之枪）
  'secret_knowledge', // 某角色独知的秘密
  'unfulfilled_promise', // 未兑现的承诺
  'lurking_threat',   // 潜伏的威胁
]);

export const hookStatus = z.enum(['planted', 'developing', 'paid_off', 'discarded']);

export const chekhovHookSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  type: hookType,
  description: z.string(),
  involvedCharacters: z.array(z.string()),
  involvedEntities: z.array(z.string()),  // 地点/物品/概念
  plantedAtChapter: z.number(),
  plantedScene: z.string().nullable(),
  preferredPayoffWindow: z.object({
    earliestChapter: z.number(),
    latestChapter: z.number(),  // 软上限，PacingCritic 优先催收接近上限的钩子
  }),
  urgency: z.number().min(1).max(10),
  status: hookStatus,
  paidOffAtChapter: z.number().nullable(),
  payoffNotes: z.string().nullable(),
  source: z.enum(['author_planted', 'auto_planted_by_simulation']),
}).strict();

export type ChekhovHook = z.infer<typeof chekhovHookSchema>;
```

**关键**：钩子是**主动队列**，不是被动记录。SimulationEngine 跑场景时，PayoffSelector 会从池里挑当下情境最合适的钩子作为"剧情燃料"塞进 prompt——这是从"流水账模拟"到"有戏的小说"的桥梁。

### 4.6 SceneSimulationResult（场景结构化输出）

```typescript
// packages/schema/src/scene-simulation.ts
export const sceneInitialConditions = z.object({
  bookId: z.string(),
  chapterId: z.string(),
  sceneIndex: z.number(),
  presentCharacterIds: z.array(z.string()),
  locationId: z.string().nullable(),
  timeContext: z.string(),           // "次日清晨 / 三个月后" 等
  pressureSources: z.array(z.object({
    type: z.enum(['author_event', 'world_variable_shift', 'hook_payoff', 'driven_by_npc']),
    description: z.string(),
    sourceId: z.string().nullable(),
  })),
  authorConstraints: z.array(z.string()).nullable(), // 作者额外的硬约束（"本场不死人"）
});

export const relationshipDelta = z.object({
  relationshipId: z.string(),
  axis: tensionAxis,
  delta: z.number(),
  reason: z.string(),
});

export const driveDelta = z.object({
  driveId: z.string(),
  progressDelta: z.number().nullable(),
  newStatus: driveStatus.nullable(),
  newBlockers: z.array(z.string()).nullable(),
  spawnedNewDrive: driveSchema.partial().nullable(),  // 演化出新 Drive
  reason: z.string(),
});

export const worldVariableDelta = z.object({
  worldVariableId: z.string(),
  newValue: z.string(),
  reason: z.string(),
});

export const causalLink = z.object({
  fromSceneRef: z.string().nullable(),  // null = 由初始条件触发
  toSceneRef: z.string(),
  type: z.enum(['trigger', 'consequence', 'enabling', 'undermining']),
  description: z.string(),
});

export const sceneStateDelta = z.object({
  relationships: z.array(relationshipDelta),
  drives: z.array(driveDelta),
  worldVariables: z.array(worldVariableDelta),
  plantedHooks: z.array(chekhovHookSchema.omit({ id: true, status: true, paidOffAtChapter: true, payoffNotes: true })),
  paidOffHooks: z.array(z.object({
    hookId: z.string(),
    payoffNotes: z.string(),
  })),
  causalLinks: z.array(causalLink),
});

export const sceneBranch = z.object({
  branchLabel: z.string(),           // "主走向 / 更激烈版 / 更隐忍版"
  narrative: z.string(),             // 实际写出来的小说文字
  stateDelta: sceneStateDelta,
  characterChoiceJustifications: z.array(z.object({
    characterId: z.string(),
    choiceSummary: z.string(),
    decisionProfileMatchScore: z.number().min(0).max(10),  // 该选择与 DecisionProfile 的吻合度
    rationale: z.string(),
  })),
});

export const sceneSimulationResultSchema = z.object({
  sceneId: z.string(),
  initialConditions: sceneInitialConditions,
  primaryBranch: sceneBranch,
  alternativeBranches: z.array(sceneBranch),  // 候选走向（默认 2 条）
  pacingScore: z.object({
    conflictDensity: z.number().min(0).max(10),
    emotionalIntensity: z.number().min(0).max(10),
    informationDensity: z.number().min(0).max(10),
    recommendation: z.string().nullable(),  // "下章建议喘息 / 该兑现钩子了"
  }),
  modelUsed: z.string(),
  costTokens: z.number(),
}).strict();

export type SceneSimulationResult = z.infer<typeof sceneSimulationResultSchema>;
```

**关键**：这个 schema 是**整个 StoryEngine 的中枢数据结构**。所有 LLM 调用、所有前端展示、所有作者干预，都围绕它转。

### 4.7 因果链（CausalGraph）

不需要单独 schema —— `causalLink[]` 嵌在 `sceneStateDelta` 里。但需要一个**视图层**聚合：

```typescript
export const causalChainQuerySchema = z.object({
  bookId: z.string(),
  fromChapter: z.number().nullable(),
  toChapter: z.number().nullable(),
  involvingCharacterId: z.string().nullable(),
});
// 返回：嵌套的因果树，前端可视化
```

CausalGraph 用途：
1. **改写影响分析**：作者改第 5 章 → 系统提示"会影响 ch-7、ch-12 的因果"
2. **ReviewAgent**：检查"这个事件有没有未交代的因"
3. **钩子追溯**：钩子兑现时自动展示"埋于 ch-3 的 X，在 ch-12 兑现"

---

## 5. 业务流程

### 5.1 场景模拟（SimulationEngine.runScene）

```
触发：作者在 SceneRunner 设定初始条件 → 点"运行模拟"

Step 0 · 加载上下文
  ├─ Bible: 出场角色的 base + DecisionProfile + Drives
  ├─ Relationships: 出场角色之间的关系矩阵 + 当前 tensionVector
  ├─ WorldVariable: 当前所有变量值
  ├─ MemoryWiki QueryNavigator.query(...): 相关 wiki 页 + 原文样本 + 分歧告警
  ├─ ChekhovHookPool.candidatesForScene(...): 候选可兑现钩子（按 urgency + 相关性排序）
  └─ PacingCritic.recommendForScene(...): 建议节奏目标

Step 1 · Prompt 组装（ContextComposer 扩展）
  ContextBlocks {
    ...原有 wiki/prose/divergences,
    + characterDecisionProfiles: [...],
    + characterDrives: [...],
    + relationshipMatrix: [...],
    + worldVariables: [...],
    + candidateHooks: [...],
    + pacingTarget: {...},
    + initialConditions: {...},
  }

Step 2 · LLM 推演（默认单 LLM 群戏模式）
  Model: Opus
  Prompt: prompts/story-engine/simulate-scene.v1.md
  硬约束（写在 system prompt）：
    1. 必须按每个出场角色的 DecisionProfile 推演他的选择
    2. 任何"打破常规"的选择必须明确指出是哪个外部压力造成
    3. 输出 primary + 至少 2 个 alternative
    4. 必须包含 stateDelta 结构化字段
    5. 不许预设"剧情应该往 X 方向走"——剧情由角色选择产生
    6. characterChoiceJustifications 必填，每个出场角色一条
  输出：SceneSimulationResult（JSON）

Step 3 · 输出校验
  ├─ Zod schema 校验
  ├─ 每个角色的 decisionProfileMatchScore < 5 → 标记"可能 OOC"
  ├─ stateDelta 的 ID 引用全部存在
  └─ 钩子兑现的 hookId 在池中存在且 status='planted'

Step 4 · ReviewAgent 二次检查（异步）
  ReviewAgent.checkCharacterHijack(simulationResult):
    对每个 characterChoiceJustifications，单独 LLM 调用 (Haiku) 重新评分
    如果分歧 > 3 → 在前端高亮"可能人物绑架"

Step 5 · 持久化为草稿
  └─ 写入 SceneSimulationResult 表，状态 = pending_author_review
  └─ 不写入 Chapter 正文 / MemoryWiki，等作者拍板

返回：SceneSimulationResult 给前端
```

### 5.2 作者拍板与入库

```
触发：作者在 SceneStateInspector 选定一条分支并点击"采纳"

Step 1 · 锁定分支
  user 选 primaryBranch 或某 alternativeBranch；可二次手动编辑 narrative

Step 2 · 应用 stateDelta（事务）
  ├─ Relationship: 对每个 relationshipDelta 更新 currentTension + 追加 history
  ├─ Drive: 对每个 driveDelta 更新 progress/status；如有 spawnedNewDrive 则创建新 Drive
  ├─ WorldVariable: 更新 currentValue + 追加 history
  ├─ ChekhovHookPool:
  │     - plantedHooks → 创建新 Hook（status=planted）
  │     - paidOffHooks → 更新对应 Hook (status=paid_off, paidOffAtChapter=N)
  └─ CausalGraph: 追加 causalLinks

Step 3 · 写入 Chapter
  ├─ 当前章节 append 该 scene 的 narrative
  └─ Chapter.status 不变（仍然是写作中），等所有 scene 完成后由作者标 finalized

Step 4 · 章 finalized 时
  ├─ MemoryWiki IngestPipeline.run(chapterId)
  ├─ OffscreenTicker.tick(bookId, chapterId)
  └─ PacingCritic.evaluateChapter(chapterId)
```

### 5.3 作者干预（DirectorPanel）

```
DirectorPanel 是侧边抽屉，5 个工具：

A. 注入事件 (EventInjector)
   选择：[角色 / 地点 / 全局] + 事件描述
   动作：写入 pressureSources，下次 SceneSimulator 调用时自动注入
   常用预设：[亲人病危 / 被诬陷 / 意外发现 / 失业 / 中毒 / ...]

B. 调环境 (PressureTuner)
   拨杆 UI：每个 WorldVariable 一个滑杆
   立即生效：所有未运行的 SceneSimulator 调用都会读到新值
   作者填一句"原因"：写入 WorldVariable.history

C. 改 Drive (DriveEditor)
   直接编辑某角色的 Drives：调优先级 / 标记完成 / 强制觉醒新 Drive
   作者填"理由"：模拟 prompt 会被告知"作者强制此变化，请在叙事中合理化"

D. 调关系 (TensionTuner)
   关系矩阵 UI，每对角色三轴拨杆
   立即生效

E. 投钩子 (HookPlanter)
   表单：type / description / involvedCharacters / preferredPayoffWindow / urgency
   写入 ChekhovHookPool（source=author_planted）
   下次 SceneSimulator 调用时进入候选池
```

**重要 UX 原则**：DirectorPanel 的所有操作**不直接生成文字**。它只改"参数"，下一次场景模拟时参数才被读到。这保留了作者的"导演感"，避免变成"按钮就出文字"。

### 5.4 Off-screen 时间推进（OffscreenTicker）

```
触发：章 finalized 之后

Step 1 · 列出未在场角色
  本章所有 scene 的 presentCharacterIds 之外的所有 active Character

Step 2 · 分级处理
  ├─ Tier-1（核心 NPC，作者标记）：详细推演（Haiku 调用）
  │     输入：该角色的 Drives + 当前关系 + 世界变量 + 距离上次出场过去多久
  │     输出：本章时间内该角色做了什么（≤ 200 字总结）+ Drive 进度 Δ
  │
  ├─ Tier-2（一般出场角色）：一句话快进（Haiku 单调用合并所有 Tier-2）
  │     输出：每人一句话状态更新
  │
  └─ Tier-3（路人/未命名）：跳过

Step 3 · 应用 Δ
  Drive 进度更新；可能新增 ChekhovHook（"NPC 在背后做了 X"）
  写入"角色行动日志"（off-screen-log.md，与 wiki 平级）

成本控制：
  Tier-1 上限 5 个角色/章；超出由作者降级
  整个 tick 调用预算 < 5k tokens / 章
```

### 5.5 节奏诊断（PacingCritic）

```
触发：每章 finalized 之后 + 每个 scene 模拟完成时

evaluateChapter(chapterId):
  Step 1 · 收集本章所有 SceneSimulationResult.pacingScore
  Step 2 · 计算章级聚合
    - avgConflictDensity / avgEmotionalIntensity / avgInformationDensity
  Step 3 · 与历史对比
    - 与最近 5 章对比，找异常（连续 3 章 conflictDensity < 3 = "太平淡"）
  Step 4 · 与未回收钩子对比
    - 接近 latestChapter 的钩子 → 强烈建议下章兑现
  Step 5 · 输出建议
    - 写入 PacingTimeline 表
    - 前端 PacingTimeline 组件显示曲线 + 红色警告

recommendForScene(sceneInitConditions):
  根据当前钩子池 / 章节进度 / 历史节奏
  返回：{conflictTarget, hooksToConsider, paceHint}
  作为 SimulationEngine 的输入
```

---

## 6. 功能需求

### 6.1 后端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/books/:bookId/decision-profiles` | 列出所有角色的 DecisionProfile |
| `GET/PUT` | `/api/books/:bookId/characters/:id/decision-profile` | 单角色 CRUD |
| `GET` | `/api/books/:bookId/drives` | 列出所有 Drive（可按角色/状态过滤） |
| `POST/PATCH/DELETE` | `/api/books/:bookId/drives/:id` | Drive CRUD |
| `GET` | `/api/books/:bookId/relationships` | 关系矩阵 |
| `POST/PATCH/DELETE` | `/api/books/:bookId/relationships/:id` | 关系 CRUD |
| `GET` | `/api/books/:bookId/relationships/:id/history` | 张力曲线 |
| `GET/POST/PATCH/DELETE` | `/api/books/:bookId/world-variables[/:id]` | 世界变量 CRUD |
| `GET` | `/api/books/:bookId/world-variables/:id/history` | 变量演化曲线 |
| `GET/POST/PATCH` | `/api/books/:bookId/hooks[/:id]` | 钩子池 CRUD |
| `POST` | `/api/books/:bookId/scenes/simulate` | 触发场景模拟（body: SceneInitialConditions），返回 SceneSimulationResult |
| `POST` | `/api/books/:bookId/scenes/:id/adopt` | 拍板：选定一条分支 + 应用 stateDelta + 写入 Chapter |
| `POST` | `/api/books/:bookId/scenes/:id/reroll` | 重跑模拟（保留 initial conditions，调整某些参数） |
| `POST` | `/api/books/:bookId/director/inject-event` | EventInjector |
| `POST` | `/api/books/:bookId/director/tune-pressure` | PressureTuner |
| `POST` | `/api/books/:bookId/director/edit-drive` | DriveEditor |
| `POST` | `/api/books/:bookId/director/tune-tension` | TensionTuner |
| `POST` | `/api/books/:bookId/director/plant-hook` | HookPlanter |
| `POST` | `/api/books/:bookId/offscreen-ticker/run` | 手动触发 tick（调试用） |
| `GET` | `/api/books/:bookId/offscreen-log` | 后台 NPC 行动日志 |
| `GET` | `/api/books/:bookId/pacing-timeline` | 节奏曲线 |
| `GET` | `/api/books/:bookId/causal-graph` | 因果图（query: fromChapter/toChapter/character） |
| `GET` | `/api/books/:bookId/causal-graph/impact?changedScene=X` | 改写影响分析 |

### 6.2 前端组件

| 组件 | 路径 | 说明 |
|------|------|------|
| `DecisionProfileEditor` | BibleStudio 角色卡新增 tab | 触发器表 + 反应表 + 硬约束 + 弱点 |
| `DriveBoard` | BibleStudio 顶层新页面 | 看板视图（按角色分列），可拖拽改优先级 |
| `RelationshipMatrix` | BibleStudio 关系子页面 | 矩阵 + 三轴拨杆 + 张力曲线 |
| `WorldVariablePanel` | BibleStudio 顶层新页面 | 变量列表 + 拨杆 + 历史曲线 |
| `DirectorPanel` | WritingDesk 侧边抽屉 | 5 个工具 tab |
| `SceneRunner` | WritingDesk 内嵌 | 初始条件表单 + "运行模拟"按钮 |
| `SceneStateInspector` | WritingDesk 内嵌 | 主走向 + 候选 Tab + stateDelta 可视化 + 拍板按钮 |
| `ChekhovHookBoard` | StudyDesk / 顶层新页面 | 钩子池看板：planted / developing / due-soon / paid-off |
| `CausalGraphViewer` | 顶层新页面 | 因果图可视化（用 d3 或现有图库） |
| `PacingTimeline` | WritingDesk 顶部小条 + 详情页 | 章级节奏曲线 + 异常警告 |
| `OffscreenLogViewer` | StudyDesk | 后台 NPC 行动日志 |

### 6.3 Prompt 模板

| 模板路径 | 用途 |
|----------|------|
| `story-engine/simulate-scene.v1.md` | 核心场景推演 prompt |
| `story-engine/simulate-scene-multi-agent.v1.md` | 多 Agent 模式（每个角色独立 LLM 实例的 system prompt 模板） |
| `story-engine/character-system-prompt.v1.md` | 多 Agent 模式下注入到每个角色 LLM 的"扮演 system" |
| `story-engine/character-hijack-detect.v1.md` | ReviewAgent 子任务：单条决策的人物绑架检测 |
| `story-engine/offscreen-tier1.v1.md` | Tier-1 NPC 后台推演 |
| `story-engine/offscreen-tier2-batch.v1.md` | Tier-2 NPC 批量快进 |
| `story-engine/decision-profile-suggest.v1.md` | BibleAgent 子任务：从已写章节抽取角色的 DecisionProfile 建议 |
| `story-engine/drive-evolve-suggest.v1.md` | 当 Drive 进度推进时，建议是否演化新 Drive |
| `story-engine/pacing-evaluate.v1.md` | 章节节奏评分 |

### 6.4 共享 Schema

```
packages/schema/src/
├─ decision-profile.ts        新增
├─ drive.ts                   新增
├─ relationship.ts            新增（升级版，独立表）
├─ world-variable.ts          新增
├─ chekhov-hook.ts            新增
├─ scene-simulation.ts        新增（核心：SceneSimulationResult）
├─ pacing.ts                  新增
└─ index.ts                   导出
```

### 6.5 数据库迁移

新增表（Postgres）：

- `decision_profiles`（1:1 character_id）
- `drives`
- `relationships`（取代 character.relationships JSONB；保留旧字段一个版本做迁移）
- `world_variables`
- `world_variable_history`
- `chekhov_hooks`
- `scene_simulations`（保存所有 SceneSimulationResult，包括未采纳的 alternatives，便于后续对比 / 训练数据）
- `causal_links`
- `pacing_evaluations`
- `offscreen_actions`

`books` 表新增：
- `engine_mode` ENUM('scripted', 'simulation')，默认 'scripted'，新书可选 'simulation'

---

## 7. 原子任务清单

> 估时按"实际人时"。`[IND]` = 与同 sprint 内其他任务无依赖。

### Sprint 0 · Schema & DB 迁移（~3d）

| ID | 任务 | 依赖 | 估时 |
|----|------|------|------|
| SE-01 | `[IND]` `packages/schema/src/decision-profile.ts` + 单测 | — | 3h |
| SE-02 | `[IND]` `packages/schema/src/drive.ts` + 单测 | — | 2h |
| SE-03 | `[IND]` `packages/schema/src/relationship.ts`（升级版） + 单测 | — | 3h |
| SE-04 | `[IND]` `packages/schema/src/world-variable.ts` + 单测 | — | 2h |
| SE-05 | `[IND]` `packages/schema/src/chekhov-hook.ts` + 单测 | — | 2h |
| SE-06 | `[IND]` `packages/schema/src/scene-simulation.ts`（含 stateDelta / branch / pacingScore） + 单测 | — | 4h |
| SE-07 | `[IND]` `packages/schema/src/pacing.ts` + 单测 | — | 2h |
| SE-08 | `apps/server/drizzle/`：drizzle migration 0008，新增所有新表 + `books.engine_mode` | SE-01..07 | 3h |
| SE-09 | 旧 `Character.relationships[]` → 新 `relationships` 表的迁移脚本（保留旧字段） | SE-08 | 2h |
| SE-10 | 后端各表的 store 层（CRUD），全部带 zod 校验 | SE-08 | 4h |
| SE-11 | API: 各资源 CRUD 路由（DecisionProfile / Drive / Relationship / WorldVariable / Hook） | SE-10 | 4h |

### Sprint 1 · SimulationEngine 核心（~4d）

| ID | 任务 | 依赖 | 估时 |
|----|------|------|------|
| SE-20 | `[IND]` Prompt: `story-engine/simulate-scene.v1.md`（含硬约束、JSON 输出 schema 描述） | — | 4h |
| SE-21 | `[IND]` Prompt: `story-engine/character-hijack-detect.v1.md` | — | 2h |
| SE-22 | `apps/server/src/story-engine/` 模块骨架 + DI 容器 | SE-10 | 2h |
| SE-23 | `simulation-engine/scene-runner.ts`：单 LLM 群戏推演（默认模式） | SE-20, SE-22 | 5h |
| SE-24 | `simulation-engine/output-parser.ts`：Zod 校验 + ID 引用校验 + 钩子状态校验 | SE-06, SE-23 | 3h |
| SE-25 | ContextComposer 扩展：接受 character profiles / drives / relationship matrix / world vars / hooks 注入 prompt | SE-23 | 3h |
| SE-26 | MemoryWiki QueryNavigator 集成：模拟前自动调 wiki query 拉相关页 | SE-23 | 2h |
| SE-27 | `causality/causal-graph.ts`：写入 / 查询 causal_links | SE-08 | 2h |
| SE-28 | `engine-coordinator.ts`：编排单场景模拟全流程 | SE-23..27 | 3h |
| SE-29 | API: `POST /api/books/:bookId/scenes/simulate` + 集成测试 | SE-28 | 3h |
| SE-30 | API: `POST /api/books/:bookId/scenes/:id/adopt`（事务化应用 stateDelta + 写 Chapter） | SE-28 | 4h |
| SE-31 | ReviewAgent 扩展: `character-hijack-detector.ts` | SE-21 | 3h |

### Sprint 2 · Director Panel & Author 干预（~2.5d）

| ID | 任务 | 依赖 | 估时 |
|----|------|------|------|
| SE-40 | `director/event-injector.ts` + API | SE-22 | 2h |
| SE-41 | `director/pressure-tuner.ts` + API | SE-22 | 2h |
| SE-42 | `director/drive-editor.ts` + API | SE-22 | 2h |
| SE-43 | `director/tension-tuner.ts` + API | SE-22 | 2h |
| SE-44 | `director/hook-planter.ts` + API | SE-22 | 2h |
| SE-45 | 前端 `DirectorPanel`（5 tab 抽屉） | SE-40..44 | 6h |
| SE-46 | 前端 `WorldVariablePanel`（拨杆 UI + 历史曲线，BibleStudio 顶层页） | SE-04, SE-11 | 4h |
| SE-47 | 前端 `RelationshipMatrix`（矩阵 + 三轴拨杆 + 张力曲线） | SE-03, SE-11 | 5h |
| SE-48 | 前端 `DriveBoard`（看板视图） | SE-02, SE-11 | 4h |
| SE-49 | 前端 `DecisionProfileEditor`（角色卡 tab） | SE-01, SE-11 | 4h |

### Sprint 3 · Hooks Pool & PacingCritic（~2d）

| ID | 任务 | 依赖 | 估时 |
|----|------|------|------|
| SE-60 | `[IND]` Prompt: `story-engine/pacing-evaluate.v1.md` | — | 2h |
| SE-61 | `hooks-pool/hook-store.ts` + `payoff-selector.ts`（按 urgency + 相关性 + 距离 latestChapter 排序） | SE-08 | 3h |
| SE-62 | SimulationEngine 接入 PayoffSelector：模拟前注入候选钩子 | SE-23, SE-61 | 2h |
| SE-63 | 拍板时自动应用 plantedHooks / paidOffHooks 到池 | SE-30, SE-61 | 2h |
| SE-64 | `pacing-critic/pacing-evaluator.ts`：章级评分 + 异常检测 | SE-60 | 3h |
| SE-65 | SimulationEngine 接入 PacingCritic.recommendForScene：模拟前注入节奏目标 | SE-23, SE-64 | 2h |
| SE-66 | API: `GET /hooks` + `GET /pacing-timeline` | SE-61, SE-64 | 2h |
| SE-67 | 前端 `ChekhovHookBoard`（看板） | SE-66 | 4h |
| SE-68 | 前端 `PacingTimeline`（曲线 + 警告） | SE-66 | 4h |

### Sprint 4 · OffscreenTicker（~1.5d）

| ID | 任务 | 依赖 | 估时 |
|----|------|------|------|
| SE-80 | `[IND]` Prompt: `story-engine/offscreen-tier1.v1.md` + `offscreen-tier2-batch.v1.md` | — | 3h |
| SE-81 | `offscreen-ticker/npc-simulator.ts`：分级处理（Tier-1 详细 / Tier-2 批量 / Tier-3 跳过） | SE-80 | 4h |
| SE-82 | `offscreen-ticker/tick-scheduler.ts`：WorkflowEngine 接入，章 finalized 后自动触发 | SE-81 | 2h |
| SE-83 | `offscreen_actions` 写入 + API + 前端 `OffscreenLogViewer` | SE-81 | 4h |
| SE-84 | Tier 标记 UI：BibleStudio 角色卡上一个开关 (`importance: tier1/tier2/tier3`) | SE-49 | 2h |

### Sprint 5 · 前端集成 & E2E（~3d）

| ID | 任务 | 依赖 | 估时 |
|----|------|------|------|
| SE-100 | 前端 `SceneRunner`（初始条件表单 + 运行按钮 + loading） | SE-29 | 4h |
| SE-101 | 前端 `SceneStateInspector`（主走向 + 候选 Tab + stateDelta 可视化树 + 拍板/重跑按钮） | SE-29, SE-30 | 8h |
| SE-102 | WritingDesk 集成：DirectorPanel 抽屉 + SceneRunner + Inspector 嵌入 | SE-45, SE-100, SE-101 | 4h |
| SE-103 | 前端 `CausalGraphViewer`（用 d3 force layout 或 reactflow） | SE-27 | 5h |
| SE-104 | engineMode 切换 UI（Book 设置页一个开关，"传统模式 / 模拟模式"） | SE-08 | 2h |
| SE-105 | 像素主题适配（所有新前端组件） | SE-46..49, SE-67, SE-68, SE-101..103 | 4h |
| SE-106 | E2E 测试 1：从 0 建 book → 设角色 + Drives + Relationship + WorldVariable → 跑 1 个场景 → 拍板 → 入 Chapter | SE-102 | 4h |
| SE-107 | E2E 测试 2：连续 3 章模拟 + Director 干预 + 钩子兑现 + 节奏诊断 + 改写影响分析 | SE-106 | 6h |
| SE-108 | TASKS.md 同步：新增"阶段 6 · StoryEngine"章节，列出对应任务 | — | 1h |
| SE-109 | DEVELOPER.md 添加 StoryEngine 章节 | SE-107 | 3h |

**合计估时**：~16d 实际人时（约现实 32d）。

---

## 8. 验收标准

### 8.1 Schema & 数据层
- [ ] 五个核心 schema（DecisionProfile / Drive / Relationship / WorldVariable / ChekhovHook）+ SceneSimulationResult Zod 定义完整，前后端共享
- [ ] DB migration 平滑应用；旧 `Character.relationships[]` 数据可被脚本迁移到新表
- [ ] 所有 CRUD API 通过 zod 校验，错误返回 400
- [ ] `books.engine_mode` 默认 `scripted`，旧书不受影响

### 8.2 SimulationEngine
- [ ] 给定 `SceneInitialConditions`，能产出 `primaryBranch + ≥2 alternativeBranches`，每条都带完整 `stateDelta`
- [ ] **不允许 `initialConditions` 包含"剧情走向"字段**——只允许 presentCharacters / location / time / pressureSources / authorConstraints
- [ ] 输出的 `characterChoiceJustifications` 每个出场角色一条，`decisionProfileMatchScore` 必填
- [ ] `decisionProfileMatchScore < 5` 的选择在前端被高亮"可能 OOC"
- [ ] 模拟前自动调 MemoryWiki QueryNavigator 注入 wiki + 原文样本上下文
- [ ] 输出通过 Zod 校验；ID 引用全部存在；钩子状态校验通过

### 8.3 拍板与状态应用
- [ ] 作者选定一条分支后，stateDelta 全部事务化应用（Relationship / Drive / WorldVariable / Hooks / CausalLinks）
- [ ] 任一应用失败，整个事务回滚，Chapter 不受影响
- [ ] 章 finalized 后，自动触发 MemoryWiki Ingest + OffscreenTicker + PacingCritic.evaluateChapter

### 8.4 Director 干预
- [ ] 五个工具（注入事件 / 调环境 / 改 Drive / 调关系 / 投钩子）均能从前端触发
- [ ] **干预不直接产生文字**——干预只改参数，下次 SceneSimulator 调用时才被读到
- [ ] 干预记入对应 history（WorldVariable.history / Relationship.history / Drive 修改日志）
- [ ] 强制改 Drive 时，作者必填"理由"字段；下次模拟 prompt 会被告知"作者强制此变化，请合理化"

### 8.5 ChekhovHookPool
- [ ] 自动种植：模拟输出的 plantedHooks 自动入池
- [ ] 手动种植：作者通过 HookPlanter 投放
- [ ] 自动兑现：模拟输出的 paidOffHooks 自动更新池中状态
- [ ] PayoffSelector：模拟前按 urgency × 相关性 × 距 latestChapter 距离排序，挑 top-N 注入 prompt
- [ ] 接近 latestChapter 的钩子自动提升 urgency

### 8.6 PacingCritic
- [ ] 每章定稿后自动评分（conflictDensity / emotionalIntensity / informationDensity）
- [ ] 连续 3 章 conflictDensity < 3 → 在前端 PacingTimeline 红色警告
- [ ] 模拟前 `recommendForScene` 输出节奏目标，写入 prompt
- [ ] PacingTimeline 前端可视化曲线 + 异常点

### 8.7 OffscreenTicker
- [ ] 章 finalized 后自动触发
- [ ] Tier-1 NPC 详细推演（≤ 5 个/章），Tier-2 批量快进，Tier-3 跳过
- [ ] 每个 NPC 行动写入 `offscreen_actions` 表
- [ ] Drive 进度自动回写
- [ ] 总 token 消耗 < 5k / 章

### 8.8 CausalGraph
- [ ] 每个场景的 causalLinks 写入 causal_links 表
- [ ] `GET /causal-graph` 返回章节范围内的因果树
- [ ] `GET /causal-graph/impact?changedScene=X` 列出受影响的下游场景
- [ ] 前端 CausalGraphViewer 可视化展示

### 8.9 ReviewAgent 扩展
- [ ] `character-hijack-detector.ts` 对每条决策独立调用 LLM 二次评分
- [ ] 与 SimulationEngine 自评分歧 > 3 → ReviewAgent 报告中标记"可能人物绑架"

### 8.10 整体
- [ ] engineMode='simulation' 的 Book 走完整 StoryEngine 流程，engineMode='scripted' 的 Book 走旧流程，两者**完全隔离**
- [ ] 单场景模拟成本 < 15k tokens，时延 < 30s（中等复杂度，3 角色出场）
- [ ] 端到端：建 book → 设 5 角色 + Drives + Relationship + 3 个 WorldVariable → 跑 3 章（每章 2 场景） → 全程作者只在 DirectorPanel 干预 + Inspector 选分支，不直接写正文 → 产出连贯小说

### 8.11 成本与时延预算

#### 目标值

| 操作 | Token 上限（目标） | 时延上限（目标） |
|------|-------------------|----------------|
| 单场景模拟（3 角色 / 单 LLM 模式） | < 15k tokens | < 30s |
| 单场景模拟（5 角色 / 多 Agent 模式） | < 50k tokens | < 90s |
| 拍板 stateDelta 应用 | 0 tokens（纯 DB 事务） | < 1s |
| OffscreenTicker（一章） | < 5k tokens | < 20s |
| PacingCritic 章级评分 | < 2k tokens | < 5s |
| 改写影响分析 | 0 tokens（纯图查询） | < 2s |

#### 实测基准

每次 `bash scripts/smoke-story-engine.sh` 执行会把 op 级时延 + token 落盘到 `storage/benchmarks/story-engine-{ts}.json`，按 op 维度采集：

- `scene-simulate` — 单场景模拟全链路（含 wiki 注入、hook 排序、pacing 推荐、character-hijack 校验）
- `scene-adopt` — stateDelta 事务化应用 + 写入 chapter
- `chapter-finalize+ticker+pacing` — 章 finalized 触发 ingest + offscreen tick + pacing 评分

聚合多个 run 的 P50 / P95 / max：

```bash
node scripts/report-story-engine-bench.mjs
```

输出示例：

```
OP                                      n  latency(ms) P50/P95/max  tokens P50/P95/max
scene-simulate                          5    18432/27210/29881    9472/13208/14501
scene-adopt                             5         412/688/720          0/0/0
chapter-finalize+ticker+pacing          5      14210/18801/21330      4310/4920/5202
```

> 上表为示例；以最新一次 `report-story-engine-bench.mjs` 输出为准。`scripts/smoke-story-engine.sh` 收尾会打印生成的 bench 文件路径。

---

## 9. 与现有模块的关系

```
StoryBible（既有，扩展）
  原有：Character / Location / Organization / Item / Concept / TimelineEvent
  新增：DecisionProfile（1:1 Character）+ Drive + Relationship（升级独立）
       + WorldVariable + ChekhovHook
  ↓ 提供输入
StoryEngine（新）
  ├─ SimulationEngine：场景级推演
  ├─ DirectorPanel：作者干预参数
  ├─ ChekhovHookPool：钩子主动队列
  ├─ PacingCritic：节奏裁判
  ├─ OffscreenTicker：时间推进
  └─ CausalGraph：因果链
  ↓ 产出
Chapter（既有）
  作者拍板的分支 → 写入 Chapter.content
  ↓ 章 finalized
MemoryWiki（既有，无需改动）
  IngestPipeline 处理章定稿，产出 wiki 页面、tracking 等
  ↓ 后续模拟时被读
StoryEngine 下次调用
  通过 MemoryWiki QueryNavigator 拉 wiki + 原文样本
```

### 与 OutlineAgent 的协作
- 旧模式：OutlineAgent 写"场景级走向"
- 新模式：OutlineAgent 只写"**主线锚点**"（卷目标、关键转折预留），不写场景级走向
- 场景级由 SimulationEngine 推演产出
- Outline schema 增加 `mode: 'scripted' | 'anchor-only'` 字段

### 与 ReviewAgent 的协作
- 既有维度：OOC / 设定冲突 / 时间线 / 伏笔
- 新增维度：**人物绑架检测**（character-hijack）+ **节奏诊断**（pacing review）
- 人物绑架检测在每次 SimulationEngine 输出后异步触发，不阻塞主流程

### 与 BibleAgent 的协作
- 既有：从新章节抽取新设定项
- 新增：从已写章节抽取角色的 DecisionProfile 建议（`decision-profile-suggest.v1.md`）
- 新增：当 Drive 进度推进时，建议是否演化新 Drive

### 与 RewriteAgent 的协作
- 不变：仍然是段落级改写工具
- 但新增：基于 DecisionProfile 的"换性格改写"模式（"用 X 角色的决策风格重写这一段"）

---

## 10. 附录

### A. 关键设计决策

#### A.1 单 LLM 群戏 vs 多 Agent 模拟

**默认单 LLM 群戏模式**：一次 LLM 调用，prompt 里塞所有出场角色的 profile，让模型扮演所有角色。优点：成本低、连贯性好（一个模型脑内同步所有人）。缺点：可能存在"全知作弊"（角色 A 知道角色 B 的内心）。

**可选多 Agent 模式**：每个角色一个独立 LLM 实例，各自有 system prompt（"你是 A，你只知道 ..."），多轮对话产出场景。优点：信息差自然产生、扮演更真。缺点：成本 3-5×、协调复杂、可能跑偏。

**策略**：默认单 LLM。在 `SceneInitialConditions` 里加 `simulationMode: 'group' | 'multi-agent'` 字段，作者按需切换关键场景。多 Agent 模式作为 V2 优化，Sprint 1 先实现单 LLM。

#### A.2 候选分支数量

主走向 + 2 个候选 = 默认。理由：
- 1 个候选不够给作者选择感
- 4+ 候选 token 成本爆炸，作者也看不过来
- 2 个候选刚好覆盖"更激烈/更隐忍"两个对立维度

可在 `SceneInitialConditions.alternativeCount` 配，上限 4。

#### A.3 为什么 Relationship 升级为独立表

旧 `Character.relationships[]` 是 JSONB 嵌套字段。升级独立表的理由：
1. 关系是**双方面**的 (A→B 和 B→A 可能不同)，独立表方便存两条
2. 张力 `history[]` 会随时间增长（每章一条），嵌在 character JSONB 里会膨胀
3. 矩阵查询（"张三与所有人的关系"）SQL 比 JSONB 容易
4. 关系本身可被多角色查询（A 与 B、A 与 C、B 与 C 都涉及 A），独立表索引更高效

旧字段保留**一个版本周期**做兼容（迁移期），下个大版本删除。

#### A.4 为什么不直接用 LangGraph / CrewAI 多 Agent 框架

CLAUDE.md §6.2 硬规则：禁用 LangChain / 任何 Agent 框架。
StoryEngine 的"多 Agent 模式"是**自写的薄层**——多次 Anthropic SDK 调用 + 显式编排。
理由：
- 框架抽象掩盖了 token 成本和 prompt 构造
- 我们的"角色 Agent"只需要 system prompt + 共享对话历史，不需要工具调用 / 长链 reasoning
- 自写 200 行能搞定，引入框架是 1k+ 依赖

#### A.5 Director 干预的 UX 哲学

**关键约束**：DirectorPanel 不直接产生文字。

理由：如果点一个按钮就出文字，作者会变成"刷剧情按钮"的人，**失去导演感**。导演干的是改剧本（参数）、调灯光（环境）、给演员说戏（改 Drive）——下一个 take 演出来才看效果。这个延迟是必要的仪式感。

#### A.6 人物绑架检测的实现

每个场景产出后，对 `characterChoiceJustifications` 中的每条决策：
1. 提取该角色的 DecisionProfile + 当下情境 + 实际选择
2. 单独调用 Haiku：「在这个情境下，这个决策风格的角色最可能怎么选？给一个 0-10 分评估实际选择与你预期的吻合度」
3. 与 SimulationEngine 自评分对比；分歧 > 3 标记可疑

成本：每场景 +1k tokens，可接受。

### B. 与 thinking.md 核心思想的对应

| thinking.md 思想 | StoryEngine 落地 |
|-----------------|----------------|
| 剧情不是想出来的，是长出来的 | SimulationEngine 接受初始条件 + 不预设结局 |
| 关系位移是剧情的容器（阶级差/信息差/情感差） | Relationship.tensionVector 三轴 |
| 性格决定事件选择 | DecisionProfile + 模拟时强制对照 |
| 人物性格是死的（不能多变） | DecisionProfile.hardConstraints + ReviewAgent 人物绑架检测 |
| 关系要有张力（位移空间） | targetTrajectory + 张力曲线 history |
| 必须有外部压力 | WorldVariable + Director EventInjector |
| 卡文 = 自查三点（性格多变 / 关系无张力 / 无外部压力） | 三者都有结构化字段，PacingCritic 自动检测前两点，DirectorPanel 让作者主动添加第三点 |
| 作者是观察者，养好人物 | 作者只调参数 + 选分支，不直接写情节 |

### C. 渐进上线策略

**不要把整个 StoryEngine 一次性推给所有用户**：

1. **Sprint 0-1 上线后**：在内部用，自己跑一两本试试看，调 prompt
2. **Sprint 2-3 上线后**：开放给少数核心用户，engineMode 默认仍 scripted，新建书时可选 simulation
3. **Sprint 4-5 上线后**：默认推荐 simulation，但旧书保留 scripted
4. **下下个版本**：评估是否废弃 scripted 模式

### D. 可能的 V2 扩展（不在本次范围）

- **Multi-branch Fork**：场景级别 fork 多条命运线，最后保留 canonical。Branch 不入 MemoryWiki，作者可"穿越"对比
- **角色情绪状态机**：除 Drives 外，加短期情绪（怒/喜/惧），影响下一场决策
- **读者反馈回灌**：连载后，读者评论作为"舆论 WorldVariable"自动影响后续 Drives 优先级
- **角色独立内心独白**：每章产出主角的独立内心日志（off-screen 但聚焦主角）
- **TimeTick 加速**：不写章节，让世界自动跑 N 个月，主角再出场时世界已变
- **跨书共享角色池**：作者写多本书时，角色 + DecisionProfile 可复用

### E. 风险与对冲

| 风险 | 对冲 |
|-----|------|
| 模拟出来的剧情**太合理但太无聊** | PacingCritic 强制注入冲突目标；候选分支强制至少一条"更激烈" |
| **作者失去作者性** | 拍板权 + 文字层手动编辑 + DirectorPanel 不直接出文字 |
| **token 成本爆炸** | 模拟分级（前台 Opus / 后台 Haiku）+ off-screen Tier 制 + 候选分支可关 |
| **角色绑架反向发生**（DecisionProfile 太死） | DecisionProfile 允许 exceptions + growthArcHints；Drive 演化机制 |
| **作者一开始懒得设 Drives / Profile** | BibleAgent 提供建议；提供 archetype 模板（"务实派/暴烈派/隐忍派/阴谋派"）一键填充 |
| **engineMode 切换破坏旧数据** | 严格隔离，scripted 与 simulation 走两套流程；旧书永远不被升级 |
| **CausalGraph 规模爆炸**（章节多了图巨大） | 默认查询窗口 ±5 章；前端默认渲染近 20 节点 |

### F. 参考资料

- 本项目 `competing_products/thinking.md` — 方法论原始出处（关系位移 × 性格选择 × 外部压力）
- [Stanford Generative Agents (Smallville)](https://arxiv.org/abs/2304.03442) — 角色级 LLM 模拟的经典论文
- AI Dungeon / NovelAI 的故事引擎设计（公开博客资料）
- 桌游主持人（GM）方法论：Apocalypse World / Blades in the Dark 的 GM 工具集
- [Karpathy LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — MemoryWiki 的方法论来源（本系统复用）

### G. 命名解释

- **StoryEngine** vs SimulationEngine：StoryEngine 是整个产品模块（含 Director / Hooks / Pacing 等），SimulationEngine 是其内部最核心的子模块（场景推演）
- **Drive** vs Motivation：Motivation 是单字段、自由文本；Drive 是结构化、多层级、可演化的实体
- **DecisionProfile** vs Personality：Personality 是形容词（"务实"），DecisionProfile 是触发器→反应表（"被羞辱时拿账本算账"）
- **Relationship** vs `Character.relationships[]`：旧字段是描述性子字段；新 Relationship 是带张力矢量和演化轨迹的一等实体
- **WorldVariable** vs Concept：Concept 是设定（"灵力分九品"），WorldVariable 是状态（"经济=饥荒3级"）
- **ChekhovHook** vs Foreshadowing：MemoryWiki 的 foreshadowing 是**已发生事件的事后记录**；ChekhovHook 是**未来要兑现的主动队列**

---

**致谢思想来源**：本文档的核心方法论来自 `competing_products/thinking.md` 中关于"剧情如何长出来"的论述。如果说 MemoryWiki 让系统**记得已经发生了什么**，那么 StoryEngine 让系统**知道接下来该怎么长**。
