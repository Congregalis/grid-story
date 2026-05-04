import type { Editor } from '@tiptap/react';

/**
 * Per-paragraph AI mark decay:
 * When a paragraph contains mixed AI-marked and unmarked text,
 * remove the aiSource mark from the entire paragraph.
 * Call this after each document change.
 */
export function decayAiMarks(editor: Editor): void {
  const { doc } = editor.state;
  const aiMarkType = editor.schema.marks.aiSource;
  if (!aiMarkType) return;

  const tr = editor.state.tr;
  let modified = false;

  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return;

    let hasAi = false;
    let hasCleanText = false;

    node.descendants((child) => {
      if (!child.isText) return;
      if (child.marks.some((m) => m.type === aiMarkType)) {
        hasAi = true;
      }
      const text = child.text ?? '';
      if (text.trim().length > 0 && !child.marks.some((m) => m.type === aiMarkType)) {
        hasCleanText = true;
      }
    });

    if (hasAi && hasCleanText) {
      tr.removeMark(pos + 1, pos + node.nodeSize - 1, aiMarkType);
      modified = true;
    }
  });

  if (modified) {
    editor.view.dispatch(tr);
  }
}
