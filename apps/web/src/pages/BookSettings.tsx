import { PixelButton, PixelInput, PixelTextArea } from '@grid-story/pixel-kit';
import type { Book, UpdateBookInput } from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StarterBibleDialog } from '../features/bible/StarterBibleDialog';
import { ApiError, api, formatApiError } from '../lib/api';
import { useBookId } from '../lib/book';
import { toast } from '../lib/toast';

const CHARTER_FIELDS = [
  { key: 'worldview', label: '世界观', hint: '这个世界的基本运行规则与设定' },
  { key: 'era', label: '时代', hint: '故事发生的时代背景' },
  { key: 'themes', label: '核心思想', hint: '逗号分隔，如：牺牲,救赎,自由' },
  { key: 'hook', label: '脑洞 / 高概念', hint: '一句话概括最吸引人的设定亮点' },
  { key: 'pov', label: '视角约束', hint: '例如：第一人称、第三人称限知、多POV轮换' },
  { key: 'tone', label: '基调', hint: '例如：黑暗、轻松、史诗、讽刺' },
  { key: 'rules', label: '硬规则', hint: '逗号分隔，AI 必须遵守的铁律' },
  { key: 'avoid', label: '反约束', hint: '逗号分隔，AI 绝对不能写的内容' },
] as const;

function csvJoin(arr: string[]): string {
  return arr.join(', ');
}

function csvSplit(s: string): string[] {
  return s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function charterFilled(book: Book): number {
  return CHARTER_FIELDS.filter((f) => {
    const v = book[f.key as keyof Book];
    if (Array.isArray(v)) return v.length > 0;
    return v != null && v !== '';
  }).length;
}

export default function BookSettings() {
  const [bookId] = useBookId();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [starterOpen, setStarterOpen] = useState(false);

  const bookQuery = useQuery<Book>({
    queryKey: ['book', bookId],
    queryFn: () => api.get<Book>(`/book/${encodeURIComponent(bookId)}`),
  });

  const [form, setForm] = useState<Record<string, string>>({});

  // Sync remote → local form once loaded
  const [synced, setSynced] = useState(false);
  if (bookQuery.data && !synced) {
    const b = bookQuery.data;
    setForm({
      title: b.title ?? '',
      author: b.author ?? '',
      genre: b.genre ?? '',
      style: b.style ?? '',
      targetWordCount: b.targetWordCount?.toString() ?? '',
      status: b.status ?? 'planning',
      worldview: b.worldview ?? '',
      era: b.era ?? '',
      themes: csvJoin(b.themes ?? []),
      hook: b.hook ?? '',
      pov: b.pov ?? '',
      tone: b.tone ?? '',
      engineMode: b.engineMode ?? 'scripted',
      rules: csvJoin(b.rules ?? []),
      avoid: csvJoin(b.avoid ?? []),
      notes: b.notes ?? '',
    });
    setDirty(false);
    setSynced(true);
  }

  function updateField(key: string, value: string) {
    setSaved(false);
    setDirty(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildInput(): UpdateBookInput {
    return {
      title: form.title || undefined,
      author: form.author ?? '',
      genre: form.genre ?? '',
      style: form.style ?? '',
      targetWordCount: form.targetWordCount ? Number(form.targetWordCount) || null : null,
      status: (form.status as UpdateBookInput['status']) ?? 'planning',
      worldview: form.worldview || null,
      era: form.era || null,
      themes: csvSplit(form.themes ?? ''),
      hook: form.hook || null,
      pov: form.pov || null,
      tone: form.tone || null,
      engineMode: (form.engineMode as UpdateBookInput['engineMode']) ?? 'scripted',
      rules: csvSplit(form.rules ?? ''),
      avoid: csvSplit(form.avoid ?? ''),
      notes: form.notes || null,
    };
  }

  const saveMutation = useMutation({
    mutationFn: () => api.put<Book>(`/book/${encodeURIComponent(bookId)}`, buildInput()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book', bookId] });
      setSaved(true);
      setDirty(false);
      toast.success('作品设定已保存');
    },
    onError: (e: unknown) => {
      toast.error(formatApiError(e, '保存失败，请稍后重试'));
    },
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const input = buildInput();
      return api.post<Book>('/book', {
        ...input,
        id: bookId,
        title: input.title || '未命名作品',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book', bookId] });
      setSaved(true);
      setDirty(false);
      toast.success('作品已创建');
    },
    onError: (e: unknown) => {
      toast.error(formatApiError(e, '创建失败，请稍后重试'));
    },
  });

  const is404 = bookQuery.error instanceof ApiError && bookQuery.error.status === 404;
  const isPending = saveMutation.isPending || createMutation.isPending;

  // --- render helpers ---

  function fieldRow(
    key: string,
    label: string,
    hint: string,
    Component: typeof PixelInput | typeof PixelTextArea,
  ) {
    const inputId = `book-settings-${key}`;
    return (
      <div key={key} className="mb-4">
        <label className="block font-pixel text-pixel-sm text-ink mb-1" htmlFor={inputId}>
          {label}
        </label>
        <Component
          id={inputId}
          value={form[key] ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            updateField(key, e.target.value)
          }
          placeholder={hint}
        />
      </div>
    );
  }

  // --- loading ---
  if (bookQuery.isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-6">
        <p className="font-ui text-sm text-ink-soft">加载作品设定中…</p>
      </div>
    );
  }

  // --- not found: offer to create ---
  if (is404) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-6">
        <h1 className="font-pixel text-pixel-lg mb-4">作品设定</h1>
        <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-6 text-center">
          <p className="font-ui text-sm text-ink-soft mb-4">当前作品尚未创建。</p>
          <PixelButton onClick={() => createMutation.mutate()} disabled={isPending}>
            {isPending ? '创建中…' : '创建作品记录'}
          </PixelButton>
        </div>
      </div>
    );
  }

  // --- error ---
  if (bookQuery.error) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-6">
        <p className="font-ui text-sm text-danger">加载失败，请稍后重试。</p>
      </div>
    );
  }

  // --- loaded ---
  const b = bookQuery.data;
  if (!b) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-6">
        <p className="font-ui text-sm text-danger">加载失败，请稍后重试。</p>
      </div>
    );
  }
  const filled = charterFilled(b);
  const total = CHARTER_FIELDS.length;

  return (
    <div className="max-w-2xl mx-auto py-12 px-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-pixel text-pixel-lg">作品设定</h1>
        <PixelButton onClick={() => saveMutation.mutate()} disabled={isPending}>
          {isPending ? '保存中…' : '保存'}
        </PixelButton>
      </div>

      {saved && <p className="font-ui text-sm text-success mb-4">✓ 已保存</p>}

      {/* Basic info */}
      <section className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4 mb-6">
        <h2 className="font-pixel text-pixel-md mb-4">基本信息</h2>
        <div className="grid grid-cols-2 gap-x-4">
          {fieldRow('title', '书名 *', '作品名称', PixelInput)}
          {fieldRow('author', '作者', '作者名', PixelInput)}
          {fieldRow('genre', '类型', '如：仙侠、科幻、悬疑', PixelInput)}
          {fieldRow('style', '风格', '如：轻松、文艺、硬核', PixelInput)}
          <div className="mb-4">
            <label
              className="block font-pixel text-pixel-sm text-ink mb-1"
              htmlFor="book-settings-status"
            >
              状态
            </label>
            <select
              id="book-settings-status"
              className="block w-full bg-surface-raised text-ink font-ui text-sm border-2 border-outline rounded-sm px-3 h-8 focus:outline-none focus:border-primary"
              value={form.status ?? 'planning'}
              onChange={(e) => updateField('status', e.target.value)}
            >
              <option value="planning">构思中</option>
              <option value="writing">连载中</option>
              <option value="completed">已完结</option>
              <option value="hiatus">搁置中</option>
            </select>
          </div>
          <div>{fieldRow('targetWordCount', '目标字数', '如不限制请留空', PixelInput)}</div>
        </div>
      </section>

      {/* Engine mode */}
      <section className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4 mb-6">
        <h2 className="font-pixel text-pixel-md mb-2">写作引擎</h2>
        <p className="font-ui text-xs text-ink-soft mb-3">
          <strong>传统模式（scripted）</strong>：按章纲写，AI 起草、作者改稿。
          <br />
          <strong>模拟模式（simulation）</strong>：StoryEngine 推演场景、产出多分支，作者拍板入章。
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(['scripted', 'simulation'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => updateField('engineMode', mode)}
              className={`h-10 rounded-sm border-2 px-3 font-pixel text-pixel-sm text-left ${
                (form.engineMode ?? 'scripted') === mode
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-outline bg-surface-raised text-ink-soft hover:text-ink'
              }`}
            >
              {mode === 'scripted' ? '传统模式' : '模拟模式'}
              <span className="ml-2 font-mono text-[10px] text-ink-mute">{mode}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Story Charter */}
      <section className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-pixel text-pixel-md">创作约束</h2>
          <span className="font-pixel text-pixel-sm text-ink-soft">
            {filled}/{total} 项
          </span>
        </div>
        <div className="h-2 bg-surface-raised border border-outline rounded-sm mb-4 overflow-hidden">
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${total > 0 ? (filled / total) * 100 : 0}%` }}
          />
        </div>
        <p className="font-ui text-xs text-ink-soft mb-4">
          这些设定是 AI 写作时遵守的全局约束。 填得越具体，AI 产出越贴合你的设定。
        </p>
        {CHARTER_FIELDS.map((f) => {
          const isLong = f.key === 'worldview' || f.key === 'hook';
          return fieldRow(f.key, f.label, f.hint, isLong ? PixelTextArea : PixelInput);
        })}
      </section>

      {/* Notes */}
      <section className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4 mb-6">
        <h2 className="font-pixel text-pixel-md mb-4">备注</h2>
        {fieldRow('notes', '备注', '自由文本，作为补充说明', PixelTextArea)}
      </section>

      <section className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-pixel text-pixel-md">AI 生成起始设定</h2>
            {dirty && (
              <p className="mt-1 font-ui text-xs text-warning">有未保存更改，先保存再生成。</p>
            )}
          </div>
          <PixelButton disabled={isPending || dirty} onClick={() => setStarterOpen(true)}>
            基于创作约束生成设定
          </PixelButton>
        </div>
      </section>

      <StarterBibleDialog
        open={starterOpen}
        bookId={bookId}
        onClose={() => setStarterOpen(false)}
        onWritten={() => qc.invalidateQueries({ queryKey: ['bible'] })}
      />
    </div>
  );
}
