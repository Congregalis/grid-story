import { PixelButton, PixelDialog, PixelInput } from '@grid-story/pixel-kit';
import type { Book } from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatApiError } from '../lib/api';
import { useBookId } from '../lib/book';
import { toast } from '../lib/toast';

const BOOK_STATUS_LABEL: Record<Book['status'], string> = {
  planning: '构思中',
  writing: '连载中',
  completed: '已完结',
  hiatus: '搁置中',
};

export default function Bookshelf() {
  const [, setBookId] = useBookId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const booksQuery = useQuery<Book[]>({
    queryKey: ['books'],
    queryFn: () => api.get<Book[]>('/book'),
  });

  const sorted = booksQuery.data
    ? [...booksQuery.data].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
    : undefined;

  const createMutation = useMutation({
    mutationFn: (title: string) =>
      api.post<Book>('/book', {
        title,
        author: '',
        genre: '',
        style: '',
        targetWordCount: null,
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
      toast.success(`已创建「${book.title}」`);
      navigate(`/books/${book.id}/settings`);
    },
    onError: (e: unknown) => {
      toast.error(formatApiError(e, '创建失败，请稍后重试'));
    },
  });

  const enterBook = (id: string) => {
    setBookId(id);
    navigate(`/books/${id}`);
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-6">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-pixel text-pixel-lg mb-2">我的书架</h1>
          <p className="font-ui text-sm text-ink-soft">
            {sorted && sorted.length > 0
              ? `共 ${sorted.length} 部作品`
              : '创建你的第一部作品，开始创作之旅'}
          </p>
        </div>
        <PixelButton
          variant="primary"
          onClick={() => {
            setNewTitle('');
            setCreateOpen(true);
          }}
        >
          + 新建作品
        </PixelButton>
      </header>

      {booksQuery.isLoading && (
        <p className="text-ink-soft font-ui text-sm">加载中…</p>
      )}
      {booksQuery.error && (
        <p className="text-danger font-ui text-sm">加载失败，请稍后重试</p>
      )}

      {sorted && sorted.length === 0 && (
        <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-8 text-center">
          <p className="font-pixel text-pixel-md mb-4 text-ink-soft">书架空空</p>
          <p className="font-ui text-sm text-ink-soft mb-6">
            还没有作品，创建你的第一本书开始创作之旅。
          </p>
          <PixelButton
            variant="primary"
            onClick={() => {
              setNewTitle('');
              setCreateOpen(true);
            }}
          >
            + 新建作品
          </PixelButton>
        </div>
      )}

      {sorted && sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map((b) => (
            <button
              key={b.id}
              type="button"
              className="w-full text-left bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4 hover:border-primary transition-colors flex items-center gap-4"
              onClick={() => enterBook(b.id)}
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-pixel text-pixel-md mb-1 truncate">{b.title}</h3>
                <div className="font-ui text-xs text-ink-soft flex gap-3">
                  <span
                    className={`font-pixel text-pixel-sm ${
                      b.status === 'writing' ? 'text-success' : 'text-ink-soft'
                    }`}
                  >
                    {BOOK_STATUS_LABEL[b.status]}
                  </span>
                  {b.genre && <span>{b.genre}</span>}
                  <span>
                    最近更新: {new Date(b.updatedAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
              </div>
              <span className="text-ink-mute font-pixel text-pixel-sm shrink-0">进入 →</span>
            </button>
          ))}
        </div>
      )}

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
    </div>
  );
}
