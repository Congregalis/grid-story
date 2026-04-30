import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect } from 'react';

export interface ProseEditorProps {
  /** 受控内容；切章时 ProseEditor 会同步到 editor 内部 */
  content: string;
  onChange: (next: string) => void;
  placeholder?: string;
  editable?: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 把存为「\n\n 隔段」的 plain text 转回 ProseMirror 可解析的 HTML。
 * 单 \n 在段内当软换行（<br>）；空段被忽略。
 *
 * 用 plain text 而非 HTML 持久化的理由：
 *  1) AI agent 输出本来就是 plain text
 *  2) wordCount = content.length 保持准确
 *  3) 后续做 diff / 导出 / 摘要更直观
 */
function textToHtml(text: string): string {
  if (!text) return '';
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs
    .map((p) => {
      const lines = p.split('\n').map(escapeHtml);
      return `<p>${lines.join('<br>')}</p>`;
    })
    .filter((p) => p !== '<p></p>')
    .join('');
}

export function ProseEditor({
  content,
  onChange,
  placeholder = '在这里开始这一章…',
  editable = true,
}: ProseEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: textToHtml(content),
    editable,
    editorProps: {
      attributes: {
        class:
          'min-h-[400px] max-w-prose mx-auto font-prose text-prose ' +
          'leading-[1.85] focus:outline-none whitespace-pre-wrap',
      },
    },
    onUpdate: ({ editor }) => {
      // 段落以 \n\n 分隔；段内的硬换行（br）以 \n 分隔。
      const text = editor.getText({ blockSeparator: '\n\n' });
      onChange(text);
    },
    immediatelyRender: false,
  });

  // 切章 / AI 写入时同步：注意比较的是 plain text，不是 HTML
  useEffect(() => {
    if (!editor) return;
    const current = editor.getText({ blockSeparator: '\n\n' });
    if (current !== content) {
      editor.commands.setContent(textToHtml(content), false);
    }
  }, [content, editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  return <EditorContent editor={editor} className="cursor-text" />;
}
