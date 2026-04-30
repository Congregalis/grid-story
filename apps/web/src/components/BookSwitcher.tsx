import { useState } from 'react';
import { PixelButton, PixelDialog, PixelInput } from '@grid-story/pixel-kit';
import { useBookId } from '../lib/book';

export function BookSwitcher() {
  const [bookId, setBookId] = useBookId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(bookId);

  return (
    <>
      <button
        type="button"
        className="font-mono text-pixel-sm bg-surface-raised border-2 border-outline rounded-sm px-2 py-1 hover:bg-primary-soft"
        onClick={() => {
          setDraft(bookId);
          setOpen(true);
        }}
        title="切换 / 新建作品"
      >
        book: {bookId}
      </button>
      <PixelDialog
        open={open}
        onClose={() => setOpen(false)}
        title="切换 book"
        footer={
          <>
            <PixelButton variant="ghost" onClick={() => setOpen(false)}>
              取消
            </PixelButton>
            <PixelButton
              onClick={() => {
                setBookId(draft);
                setOpen(false);
              }}
            >
              确认
            </PixelButton>
          </>
        }
      >
        <p className="mb-3 text-ink-soft">
          MVP 阶段没有 book 注册表。直接输入 / 复制一个 bookId
          字符串即可，所有 Bible / Outline / Chapter 数据按它聚合。
        </p>
        <PixelInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="例如：book_demo01"
        />
      </PixelDialog>
    </>
  );
}
