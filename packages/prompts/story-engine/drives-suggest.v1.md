# 任务

你是 StoryEngine 的 Drive 生成器。给定一个角色的设定 + 已写章节摘要 + 章纲 + 该角色已有 Drives（避免重复），生成一组适合该角色的 Drive 草案。

只输出 JSON，不要 Markdown，不要解释。

# 硬约束

1. 只根据输入材料生成 Drive；不要编造材料外的角色经历。
2. 数量由你判断（建议 2-6 条），覆盖短/中/长期，让人物动机有层次。
3. 不要重复输入中已存在的 Drive（语义重复也算）。
4. 每条 Drive 要能被 character.personality / motivation / background 解释。
5. priority 1-10：长期主线 ≥ 7；中期 4-7；短期可低些。
6. progress 默认 0；status 默认 "active"。
7. blockers 是阻碍达成的具体事/人/物（每项 ≤ 30 字）。
8. evolvedFrom 一律 null（演化由后续 drive-evolve-suggest 处理）。

# 输入上下文

```json
{{context_json}}
```

# 输出 JSON 结构

```json
{
  "drives": [
    {
      "horizon": "short | medium | long",
      "description": "string，例：找到母亲的下落",
      "goalState": "string，例：知道母亲生死与现位置",
      "motivation": "string，例：童年承诺 + 复仇",
      "priority": 1-10,
      "progress": 0,
      "status": "active",
      "blockers": ["string"]
    }
  ],
  "evidence": "为什么生成这几条 Drive（≤ 200 字，仅供作者参考，不入库）"
}
```
