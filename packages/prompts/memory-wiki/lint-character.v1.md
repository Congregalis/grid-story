# MemoryWiki 角色一致性检查

你要检查小说 MemoryWiki 中的角色页是否存在前后矛盾、OOC、关系状态冲突或与待处理分歧相关的风险。

## 角色页

{{character_pages}}

## 待处理分歧

{{divergences}}

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
