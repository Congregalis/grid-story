# MemoryWiki `[inferred]` 断言复核

你要复核 MemoryWiki 中标记为 `[inferred]` 的断言。这类断言是 LLM 推断，必须谨慎。请根据断言文本和可用章节摘要判断：

- 证据不足或明显脑补：`critical`
- 表述过强，应该降级为 `[implied]` 或补充证据：`warning`
- 只是提醒作者复核：`info`

## inferred 断言

{{inferred_assertions_json}}

## 可用章节上下文

{{chapter_context}}

## 输出要求

只输出 JSON，不要 markdown，不要解释。格式：

{
  "issues": [
    {
      "severity": "critical | warning | info",
      "title": "短标题",
      "message": "具体问题说明",
      "page_path": "entities/characters/xxx.md",
      "evidence": "引用最小证据",
      "suggestion": "建议作者如何处理",
      "auto_fixable": false
    }
  ]
}

没有问题时输出：

{ "issues": [] }
