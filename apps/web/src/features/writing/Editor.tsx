import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import { AiSourceMark } from './AiSourceMark';
import { decayAiMarks } from './aiDecayPlugin';
import { type EntityEntry, EntityHighlight } from './EntityHighlight';
import type { RewriteMode } from './rewriteModes';
import { SelectionActions } from './SelectionActions';

export interface ProseEditorHandle {
  insertAiContent: (text: string, timestamp: Date) => void;
  /** Replace the current selection with AI-marked content. No-op if nothing selected. */
  replaceSelection: (text: string, timestamp: Date) => void;
  /** Read the current editor content as plain text. */
  getText: () => string;
  /** Find and select a text fragment. Returns true if found. */
  selectText: (quote: string) => boolean;
}

export interface ProseEditorProps {
  content: string;
  onChange: (next: string) => void;
  placeholder?: string;
  editable?: boolean;
  /** Entity names/types for inline highlighting. Changes trigger re-decoration. */
  entities?: EntityEntry[];
  /** Called when user clicks on an entity highlight */
  onEntityClick?: (type: string, id: string) => void;
  /** Called when user requests AI rewrite of selected text */
  onRewriteRequest?: (selectedText: string, instruction: string, mode: RewriteMode) => void;
  /** Pre-fill instruction when rewrite input opens (用于"采纳建议") */
  defaultInstruction?: string;
  /** Increment to auto-open the rewrite input programmatically */
  triggerOpen?: number;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

function textToAiHtml(text: string, timestamp: Date): string {
  if (!text) return '';
  const ts = timestamp.toISOString();
  const title = `AI 生成于 ${timestamp.toLocaleString('zh-CN')}`;
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs
    .map((p) => {
      const lines = p.split('\n').map(escapeHtml);
      const inner = lines.join('<br>');
      return inner
        ? `<p><span data-source="ai" data-timestamp="${ts}" title="${escapeHtml(title)}" class="ai-source-mark">${inner}</span></p>`
        : '';
    })
    .filter(Boolean)
    .join('');
}

export const ProseEditor = forwardRef<ProseEditorHandle, ProseEditorProps>(function ProseEditor(
  {
    content,
    onChange,
    placeholder = '在这里开始这一章…',
    editable = true,
    entities,
    onEntityClick,
    onRewriteRequest,
    defaultInstruction,
    triggerOpen,
  },
  ref,
) {
  const entityHighlightExt = useMemo(() => EntityHighlight.configure(), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder }),
      AiSourceMark,
      entityHighlightExt,
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
      decayAiMarks(editor);
      const text = editor.getText({ blockSeparator: '\n\n' });
      onChange(text);
    },
    immediatelyRender: false,
  });

  useImperativeHandle(
    ref,
    () => ({
      insertAiContent: (text: string, timestamp: Date) => {
        editor?.commands.setContent(textToAiHtml(text, timestamp), false);
      },
      replaceSelection: (text: string, timestamp: Date) => {
        if (!editor) return;
        const { from, to } = editor.state.selection;
        if (from === to) return;
        editor.chain().deleteSelection().insertContent(textToAiHtml(text, timestamp)).run();
      },
      getText: () => {
        return editor?.getText({ blockSeparator: '\n\n' }) ?? '';
      },
      selectText: (quote: string) => {
        if (!editor || !quote) return false;
        const sep = '\n\n';
        const fullText = editor.getText({ blockSeparator: sep });
        // Normalize whitespace for fuzzy matching
        const norm = (s: string) => s.replace(/\s+/g, '');

        // Multi-strategy: exact → trimmed → whitespace-agnostic → prefix
        let idx = fullText.indexOf(quote);
        let matchLen = quote.length;
        if (idx === -1) {
          const trimmed = quote.trim();
          idx = fullText.indexOf(trimmed);
          if (idx !== -1) matchLen = trimmed.length;
        }
        if (idx === -1) {
          // Whitespace-agnostic: collapse all whitespace on both sides
          const fullNorm = norm(fullText);
          const quoteNorm = norm(quote);
          const nIdx = fullNorm.indexOf(quoteNorm);
          if (nIdx !== -1) {
            matchLen = quoteNorm.length;
            let realIdx = 0;
            let normIdx = 0;
            while (realIdx < fullText.length && normIdx < nIdx) {
              if (!/\s/.test(fullText[realIdx])) normIdx++;
              realIdx++;
            }
            idx = realIdx;
          }
        }
        if (idx === -1) {
          // Last resort: match by first 10 non-whitespace chars
          const prefix = norm(quote).slice(0, 10);
          if (prefix.length >= 4) {
            const fullNorm = norm(fullText);
            const pIdx = fullNorm.indexOf(prefix);
            if (pIdx !== -1) {
              matchLen = prefix.length;
              let realIdx = 0;
              let normIdx = 0;
              while (realIdx < fullText.length && normIdx < pIdx) {
                if (!/\s/.test(fullText[realIdx])) normIdx++;
                realIdx++;
              }
              idx = realIdx;
            }
          }
        }
        if (idx === -1) return false;
        const endIdx = idx + matchLen;

        // Walk through top-level blocks to map text offsets → ProseMirror positions.
        let offset = 0;
        let fromPos = 0;
        let toPos = 0;
        editor.state.doc.descendants((node, pos) => {
          if (!node.isBlock || node.type.name === 'doc') return;
          const blockLen = node.textContent.length;
          if (fromPos === 0 && idx >= offset && idx < offset + blockLen) {
            fromPos = pos + 1 + (idx - offset);
          }
          if (toPos === 0 && endIdx > offset && endIdx <= offset + blockLen) {
            toPos = pos + 1 + (endIdx - offset);
          }
          offset = offset + blockLen + sep.length;
          if (fromPos && toPos) return false;
        });
        if (fromPos && toPos) {
          editor.chain().focus().setTextSelection({ from: fromPos, to: toPos }).run();
          // Scroll selection into view: use DOM API for reliability
          requestAnimationFrame(() => {
            const { from } = editor.state.selection;
            const dom = editor.view.domAtPos(from);
            const el = dom.node instanceof Element ? dom.node : dom.node.parentElement;
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
          return true;
        }
        return false;
      },
    }),
    [editor],
  );

  // Sync editor content from props
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

  // Update entity highlight decorations when entity list changes
  useEffect(() => {
    if (!editor) return;
    editor.storage.entityHighlight.entities = entities ?? [];
    editor.view.dispatch(editor.state.tr.setMeta('entityHighlightRefresh', Date.now()));
  }, [entities, editor]);

  // Click on entity highlight → navigate to Bible
  useEffect(() => {
    if (!editor || !onEntityClick) return;
    const el = editor.view.dom;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const span = target.closest?.('[data-entity-id]') as HTMLElement | null;
      if (span) {
        const id = span.dataset.entityId;
        const type = span.dataset.entityType;
        if (id && type) onEntityClick(type, id);
      }
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [editor, onEntityClick]);

  return (
    <>
      {editor && onRewriteRequest && (
        <SelectionActions
          editor={editor}
          onRewrite={onRewriteRequest}
          defaultInstruction={defaultInstruction}
          triggerOpen={triggerOpen}
        />
      )}
      <EditorContent editor={editor} className="cursor-text" />
    </>
  );
});
