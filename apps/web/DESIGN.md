---
name: grid-story
description: 像素二次元风的人机共创小说工具前端设计系统
colors:
  background: "#f4ead5"
  surface: "#fbf3df"
  surface-raised: "#ffffff"
  ink: "#2a2535"
  ink-soft: "#5b536a"
  ink-mute: "#9a93a8"
  outline: "#2a2535"
  outline-soft: "#cfc3a7"
  primary: "#5468ff"
  on-primary: "#ffffff"
  primary-soft: "#dee2ff"
  secondary: "#e85a8e"
  on-secondary: "#ffffff"
  secondary-soft: "#ffd6e4"
  success: "#2fa66a"
  warning: "#f0a93b"
  danger: "#d0413a"
typography:
  pixel-lg:
    fontFamily: "Fusion Pixel"
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 24px
  pixel-md:
    fontFamily: "Fusion Pixel"
    fontSize: 12px
    fontWeight: "400"
    lineHeight: 16px
  pixel-sm:
    fontFamily: "Fusion Pixel"
    fontSize: 10px
    fontWeight: "400"
    lineHeight: 12px
  prose-body:
    fontFamily: "Source Han Serif, Noto Serif CJK SC, serif"
    fontSize: 17px
    fontWeight: "400"
    lineHeight: 1.85
  prose-heading:
    fontFamily: "Source Han Serif, Noto Serif CJK SC, serif"
    fontSize: 22px
    fontWeight: "600"
    lineHeight: 1.4
  ui-body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 20px
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: 13px
    fontWeight: "400"
    lineHeight: 20px
rounded:
  none: 0px
  sm: 2px
  md: 4px
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  "2xl": 32px
components:
  pixel-button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.pixel-md}"
    rounded: "{rounded.sm}"
    padding: 8px 16px
    height: 32px
  pixel-button-primary-hover:
    backgroundColor: "#3d4ddb"
  pixel-button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.pixel-md}"
    rounded: "{rounded.sm}"
    padding: 8px 16px
    height: 32px
  pixel-button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.pixel-md}"
    rounded: "{rounded.sm}"
    padding: 8px 16px
    height: 32px
  pixel-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  pixel-input:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.ui-body}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
    height: 32px
  bible-tag-character:
    backgroundColor: "{colors.secondary-soft}"
    textColor: "{colors.secondary}"
    typography: "{typography.pixel-sm}"
    rounded: "{rounded.sm}"
    padding: 2px 6px
  ai-suggestion:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.prose-body}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  chapter-prose:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.prose-body}"
    padding: "{spacing.2xl}"
---

# grid-story 前端设计系统

> 本文件遵循 [google-labs-code/design.md](https://github.com/google-labs-code/design.md) 规范，仅约束**前端视觉与 UI**。
> 架构与模块拆解见根目录 `DESIGN.md`；技术选型见 `STACK.md`；硬规则见 `CLAUDE.md` §6。

## Overview

**像素二次元 + 纸面手稿。** 写作区是羊皮纸，工具栏是像素字弹窗按钮，Reader / 立绘 / 转场是 PixiJS 像素动画。气质是「温暖的、可以坐下来写一晚上」，不是冷酷工业风。

差异化的"像素"只在边缘装饰、立绘、状态指示，**不挡正文阅读**。三种语境各管一片：

- **作者写作时** — 纸面、衬体中文、低反差、最少打扰。
- **作者操作 UI 时** — 像素字、硬描边、硬边阴影，给点游戏感。
- **作者预览 / 读者阅读时** — PixiJS 动起来：立绘随对话切换、场景视差、像素转场。

## Colors

调色板偏暖：「老纸 + 深蓝紫墨」打底，**靛蓝**驱动 AI 与首要交互，**樱桃粉**指代角色与设定。状态色三档（绿 / 琥珀 / 砖红）。

- **Surface 三级**：羊皮纸 `#f4ead5` → 纸 `#fbf3df` → 纯白弹窗 `#ffffff`。避免纯白屏疲劳。
- **Ink**：深蓝紫 `#2a2535` 替代纯黑，长读更柔。
- **Outline**：所有像素 UI 必须 1px 主描边（深蓝紫），这是像素感的来源。
- **Primary（靛蓝）**：仅用于 AI 动作（生成、续写、建议气泡）和首要按钮。
- **Secondary（樱桃粉）**：角色 tag、人物名高亮、情感标记。
- **状态**：绿 = 接受 / 定稿；琥珀 = 待审 / 冲突警告；砖红 = 拒绝 / 删除 / 错误。

禁止渐变、毛玻璃、彩虹色 —— 像素美术配模糊 = 灾难。

## Typography

三套字体并存，**绝不混用**：

- **Fusion Pixel / 缝合像素体** — 仅用于 UI chrome：按钮、菜单、tag、状态标签、对话框标题。必须配 `image-rendering: pixelated`。
- **Source Han Serif / Noto Serif CJK** — 章节正文与大纲文本。中文长读必须衬线、行高 1.8+。
- **Inter / system-ui** — 表单、设置项、Bible 编辑表格。中性，不抢戏。
- **JetBrains Mono** — diff 视图、版本号、token 计数。

像素字号严格落在 **10 / 12 / 16** 三档，**不缩放、不取中间值**（hinting 会糊）。正文字号下限 17px。

## Layout

**4px 像素网格。** 所有 padding / margin / size 落在 4 的倍数上 —— 网格被打破的违和感非常明显。

- 间距阶梯：`xs 4 / sm 8 / md 12 / lg 16 / xl 24 / 2xl 32`。
- 卡片间距 16，section 间距 24–32。
- 三栏写作工作台：左 Bible 侧栏（≥ 240px）/ 中编辑器（fluid）/ 右大纲与历史（≥ 280px）。最低视口宽度 1280。
- 编辑器最大行宽 **64ch**（约 720px），超出强制收束 —— 长行的小说没人能读完。

## Elevation & Depth

**没有真阴影。** 像素风用「硬边阴影」表达层级：

- **Level 0（page）** — 直接平铺。
- **Level 1（card / panel）** — `box-shadow: 2px 2px 0 #2a2535`，偏右下 2px、不模糊。
- **Level 2（popover / dropdown）** — `box-shadow: 3px 3px 0 #2a2535`。
- **Level 3（modal）** — `box-shadow: 4px 4px 0 #2a2535` + 蒙层 `rgba(42, 37, 53, 0.4)`。

禁止 `filter: blur()`，禁止 `box-shadow` 任何带 spread / blur > 0。等待态用像素 spinner（4 帧循环），不用 CSS 旋转图标。

## Shapes

**圆角上限 4px。** > 4px 会暴露反走样，毁掉颗粒感。

- **方角（0）** — 像素按钮、tag、面板。**默认就是这个。**
- **2px** — 输入框、次级容器，给一点缓和。
- **4px** — 卡片、AI 建议气泡。
- **9999px** — 仅用于头像与圆形小指示器。

## Components

### Pixel UI（chrome）
- **按钮** — 高 32px，像素字 12px，2px 描边，硬边阴影。`primary` 同屏不超过 1 个。
- **Tag / Chip** — Bible 实体引用专用，角色用 `secondary-soft` 底 + 樱桃粉字；地点 / 物品 / 组织各占一调色板（在 `bible-tag-*` 变体里扩展）。
- **Input** — 32px 高，2px 圆角，聚焦时描边切到 `primary`。

### Prose（写作区）
- **Chapter Prose** — 17px / 1.85 行高 / 衬线，最大 64ch，底色 `surface`。**永远不显示像素字。**
- **AI Suggestion** — token-by-token 流式接收，底 `primary-soft`，3px 左实色 border 标识 AI 输出。Tab 接受 / Esc 拒绝。
- **Diff View** — 行级 + 字符级双层；新增 `success` 底，删除 `danger` 删除线。

### PixiJS 表面（仅这三处）
- **Reader** — 立绘随对话切换、场景视差、像素粒子转场。
- **角色立绘卡** — 静态图 + 微动效（呼吸、眨眼）。
- **过场动画** — 定稿、发布成功的庆祝动画。

编辑器、Bible CRUD、表单一律走 DOM + Tailwind。`PixelKit` 的 React 组件渲染 DOM，不渲染 Canvas。

## Do's and Don'ts

**Do**
- 间距全部落在 4px 网格上。
- 像素字号严格 10 / 12 / 16。
- 阴影只用硬边（`x y 0 color`）。
- AI 输出永远带 `primary-soft` 底或左 border —— 让作者一眼分清「我写的」和「机器写的」。
- 长文区背景用 `surface`，不用纯白。

**Don't**
- 别用 PixiJS 渲染编辑器、表单或任何需要 IME / 选区的文本（`CLAUDE.md` §6.1 硬规则）。
- 别在像素 UI 里用渐变、毛玻璃、`backdrop-filter`、阴影模糊。
- 别让圆角 > 4px（头像例外）。
- 别在正文里用像素字 —— 中文长读会瞎眼。
- 别用 emoji 替代图标 —— 像素工具配像素图标（由 `PixelKit` 提供）。
- 同屏别放两个 `primary` 按钮 —— 像素描边会互相打架。
