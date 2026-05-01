import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PixelButton, PixelDialog, PixelInput } from '@grid-story/pixel-kit';
import { useBookId } from '../lib/book';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import type { Book } from '@grid-story/schema';

export function BookSwitcher() {
  const [bookId, setBookId] = useBookId();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const qc = useQueryClient();

  const booksQuery = useQuery<Book[]>({
    queryKey: ['books'],
    queryFn: () => api.get<Book[]>('/book'),
  });

  const currentBook = booksQuery.data?.find((b) => b.id === bookId);
  const label = currentBook?.title ?? `book: ${bookId.slice(0, 20)}`;

  const createMutation = useMutation({
    mutationFn: (title: string) =>
      api.post<Book>('/book', {
        title,
        author: '',
        genre: '',
        style: '',
        status: 'planning',
        worldview: null,
        era: null,
        themes: [],
        hook: null,
        pov: null,
        tone: null,
        rules: [],
        avoid: [],
        notes: null,
      }),
    onSuccess: (book: Book) => {
      qc.invalidateQueries({ queryKey: ['books'] });
      setBookId(book.id);
      setCreateOpen(false);
      setNewTitle('');
      setOpen(false);
      toast.success(`已创建「${book.title}」`);
    },
    onError: (e: unknown) => {
      const msg = e instanceof ApiError ? `后端 ${e.status}: ${JSON.stringify(e.body)}` : (e as Error)?.message;
      toast.error(`创建失败：${msg}`);
    },
  });

  return (
    <>
      <button
        type="button"
        className="font-mono text-pixel-sm bg-surface-raised border-2 border-outline rounded-sm px-2 py-1 hover:bg-primary-soft max-w-[200px] truncate"
        onClick={() => {
          setOpen(true);
        }}
        title="切换 / 新建作品"
      >
        {label}
      </button>

      {/* Book list dialog */}
      <PixelDialog
        open={open}
        onClose={() => setOpen(false)}
        title="切换作品"
        footer={
          <PixelButton variant="ghost" onClick={() => setOpen(false)}>
            关闭
          </PixelButton>
        }
      >
        {booksQuery.isLoading && (
          <p className="text-ink-soft">加载中…</p>
        )}
        {booksQuery.error && (
          <p className="text-danger text-sm">
            加载失败：
            {booksQuery.error instanceof ApiError
              ? `后端 ${booksQuery.error.status}`
              : (booksQuery.error as Error)?.message}
          </p>
        )}
        {booksQuery.data && booksQuery.data.length === 0 && (
          <p className="text-ink-soft mb-3">暂无作品，请创建一个。</p>
        )}
        {booksQuery.data && booksQuery.data.length > 0 && (
          <ul className="space-y-1 mb-4">
            {booksQuery.data.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className={`w-full text-left font-mono text-sm px-2 py-1.5 rounded-sm border-2 transition-colors ${
                    b.id === bookId
                      ? 'border-primary bg-primary/10'
                      : 'border-outline bg-surface-raised hover:bg-primary-soft'
                  }`}
                  onClick={() => {
                    setBookId(b.id);
                    setOpen(false);
                  }}
                >
                  <span className="font-pixel text-pixel-sm">{b.title}</span>
                  <span className="text-ink-soft ml-2 text-xs">
                    {b.status} · {b.genre || '未分类'}
                  </span>
                  {b.id === bookId && (
                    <span className="float-right text-primary font-pixel text-pixel-sm">当前</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <PixelButton
          variant="ghost"
          size="sm"
          onClick={() => {
            setCreateOpen(true);
            setNewTitle('');
          }}
        >
          + 新建作品
        </PixelButton>
      </PixelDialog>

      {/* Create book dialog */}
      <PixelDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建作品"
        footer={
          <>
            <PixelButton variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </PixelButton>
            <PixelButton
              disabled={!newTitle.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate(newTitle.trim())}
            >
              {createMutation.isPending ? '创建中…' : '创建'}
            </PixelButton>
          </>
        }
      >
        <PixelInput
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="输入书名"
          autoFocus
        />
      </PixelDialog>
    </>
  );
}
