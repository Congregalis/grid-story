# MemoryWiki 时间线冲突检查

你要检查小说 MemoryWiki 的时间线页是否存在事件顺序、故事内日期、角色位置或因果顺序冲突。

## 时间线页

{{timeline_page}}

## 输出要求

只输出 JSON，不要 markdown，不要解释。格式：

{
  "issues": [
    {
      "severity": "critical | warning | info",
      "title": "短标题",
      "message": "具体问题说明",
      "page_path": "tracking/timeline.md",
      "evidence": "引用最小证据",
      "suggestion": "建议作者如何处理",
      "auto_fixable": false
    }
  ]
}

没有问题时输出：

{ "issues": [] }
