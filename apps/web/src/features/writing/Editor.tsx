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
    content,
    editable,
    editorProps: {
      attributes: {
        // prose 字号 / 行高 / 收宽 / 颗粒；不在此引入 @tailwindcss/typography
        class:
          'min-h-[400px] max-w-prose mx-auto font-prose text-prose ' +
          'leading-[1.85] focus:outline-none whitespace-pre-wrap',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getText()),
    immediatelyRender: false,
  });

  // 切章 / AI 写入时同步
  useEffect(() => {
    if (!editor) return;
    const current = editor.getText();
    if (current !== content) {
      editor.commands.setContent(content || '', false);
    }
  }, [content, editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  return <EditorContent editor={editor} className="cursor-text" />;
}
