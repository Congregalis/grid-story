import { BubbleMenu, type Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { useEffect, useRef, useState } from 'react';

interface SelectionActionsProps {
  editor: Editor;
  onRewrite: (selectedText: string, instruction: string) => void;
  defaultInstruction?: string;
  /** Increment to trigger auto-open of the rewrite input (for "采纳建议" flow). */
  triggerOpen?: number;
}

export function SelectionActions({ editor, onRewrite, defaultInstruction, triggerOpen }: SelectionActionsProps) {
  const [showInput, setShowInput] = useState(false);
  const [instruction, setInstruction] = useState('');
  const selectedRef = useRef<{ text: string; from: number; to: number } | null>(null);
  const prevTrigger = useRef(triggerOpen);

  // Auto-open input when parent triggers it (e.g. "采纳建议")
  useEffect(() => {
    if (triggerOpen === undefined || triggerOpen === prevTrigger.current) return;
    prevTrigger.current = triggerOpen;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const text = editor.state.doc.textBetween(from, to, '\n');
    if (!text.trim()) return;
    selectedRef.current = { text, from, to };
    setShowInput(true);
    if (defaultInstruction) setInstruction(defaultInstruction);
    // Restore selection visually
    requestAnimationFrame(() => {
      const tr = editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, from, to),
      );
      editor.view.dispatch(tr);
    });
  }, [triggerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track selection changes while input is open so re-selecting updates the captured text
  useEffect(() => {
    if (!showInput) return;
    const onSelectionUpdate = () => {
      const { from, to } = editor.state.selection;
      if (from === to) return;
      const text = editor.state.doc.textBetween(from, to, '\n');
      if (text.trim()) {
        selectedRef.current = { text, from, to };
      }
    };
    editor.on('selectionUpdate', onSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', onSelectionUpdate);
    };
  }, [showInput, editor]);

  const handleOpenInput = () => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, '\n');
    if (!text.trim()) return;
    selectedRef.current = { text, from, to };
    setShowInput(true);
    // Don't pre-fill from defaultInstruction on manual open —
    // defaultInstruction is only consumed by the auto-open (triggerOpen) flow.
    requestAnimationFrame(() => {
      const tr = editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, from, to),
      );
      editor.view.dispatch(tr);
    });
  };

  const handleSubmit = () => {
    const sel = selectedRef.current;
    if (!sel) return;
    onRewrite(sel.text, instruction.trim() || '润色改写');
    setInstruction('');
    setShowInput(false);
    selectedRef.current = null;
  };

  const handleCancel = () => {
    setInstruction('');
    setShowInput(false);
    selectedRef.current = null;
  };

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 150, placement: 'top' }}
      className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-1.5 flex items-center gap-1.5"
    >
      {!showInput ? (
        <button
          type="button"
          className="font-pixel text-pixel-sm text-ink hover:bg-surface-raised rounded-sm px-2 py-1 transition-colors whitespace-nowrap"
          onClick={handleOpenInput}
        >
          AI 改写
        </button>
      ) : (
        <div className="flex flex-col gap-1.5 min-w-[280px]">
          {selectedRef.current && (
            <div className="font-ui text-[11px] text-ink-mute bg-surface-raised rounded-sm px-2 py-1.5 max-h-[80px] overflow-y-auto pixel-scrollbar leading-relaxed">
              已选中「{selectedRef.current.text}」
              <span className="text-ink-soft ml-1">({selectedRef.current.text.length}字)</span>
            </div>
          )}
          <div className="flex items-start gap-1.5">
            <textarea
              className="flex-1 font-ui text-xs bg-surface-raised border border-outline-soft rounded-sm px-2 py-1 text-ink resize-none focus:outline-none focus:border-primary"
              placeholder="改写指令，如：更克制、更紧张…"
              rows={2}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
                if (e.key === 'Escape') handleCancel();
              }}
              autoFocus
            />
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                type="button"
                className="font-pixel text-[10px] text-primary hover:bg-primary-soft rounded-sm px-1.5 py-0.5 border border-primary"
                onClick={handleSubmit}
              >
                确定
              </button>
              <button
                type="button"
                className="font-pixel text-[10px] text-ink-mute hover:bg-surface-raised rounded-sm px-1.5 py-0.5 border border-outline-soft"
                onClick={handleCancel}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </BubbleMenu>
  );
}
