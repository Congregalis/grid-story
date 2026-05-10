import { PixelButton, PixelInput, PixelTextArea } from '@grid-story/pixel-kit';
import type { Book, UpdateBookInput } from '@grid-story/schema';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatApiError } from '../../../lib/api';
import { toast } from '../../../lib/toast';
import { CHARTER_STAGE, SETUP_STAGE } from '../definitions';
import type { StageContext } from '../types';

interface CharterStageProps {
  ctx: StageContext;
  bookId: string;
}

interface FormState {
  title: string;
  genre: string;
  hook: string;
  style: string;
  worldview: string;
  era: string;
  themes: string;       // CSV
  pov: string;
  tone: string;
  rules: string;        // CSV
  avoid: string;        // CSV
}

function fromBook(book: Book): FormState {
  return {
    title: book.title ?? '',
    genre: book.genre ?? '',
    hook: book.hook ?? '',
    style: book.style ?? '',
    worldview: book.worldview ?? '',
    era: book.era ?? '',
    themes: (book.themes ?? []).join(', '),
    pov: book.pov ?? '',
    tone: book.tone ?? '',
    rules: (book.rules ?? []).join(', '),
    avoid: (book.avoid ?? []).join(', '),
  };
}

function csvSplit(s: string): string[] {
  return s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function CharterStage({ ctx, bookId }: CharterStageProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(() => fromBook(ctx.book));

  // 后台 invalidate 后的最新 book 同步进表单（仅当用户未脏写时）
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setForm(fromBook(ctx.book));
  }, [ctx.book, dirty]);

  const update = <K extends keyof FormState>(key: K, value: string) => {
    setDirty(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: UpdateBookInput = {
        title: form.title.trim() || undefined,
        genre: form.genre.trim(),
        hook: form.hook.trim() || null,
        style: form.style.trim(),
        worldview: form.worldview.trim() || null,
        era: form.era.trim() || null,
        themes: csvSplit(form.themes),
        pov: form.pov.trim() || null,
        tone: form.tone.trim() || null,
        rules: csvSplit(form.rules),
        avoid: csvSplit(form.avoid),
      };
      return api.put<Book>(`/book/${encodeURIComponent(bookId)}`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book', bookId] });
      setDirty(false);
      toast.success('立项已保存');
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '保存失败')),
  });

  // 完成判定（Stepper 实时更新，但下一步按钮也用本地 form 计算更即时）
  const localProgress = useMemo(() => {
    const blockers: string[] = [];
    if (!form.title.trim()) blockers.push('书名');
    if (!form.genre.trim()) blockers.push('类型');
    if (!form.hook.trim()) blockers.push('一句话故事钩子');
    return { done: blockers.length === 0, blockers };
  }, [form]);

  // 实时进度（用 ctx 算的"持久化版本"）
  const persistedProgress = CHARTER_STAGE.computeProgress(ctx);

  const handleAdvance = async () => {
    if (!localProgress.done) {
      toast.info(`还差：${localProgress.blockers.join(' / ')}`);
      return;
    }
    if (dirty) {
      await saveMutation.mutateAsync().catch(() => null);
    }
    navigate(`/books/${bookId}/stages/${SETUP_STAGE.route}`);
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <header>
        <h1 className="font-pixel text-pixel-lg mb-1">📋 立项</h1>
        <p className="font-ui text-sm text-ink-soft">
          先把作品的"骨架"立起来——书名、类型、一句话故事钩子，是 AI
          后续生成所有内容的基础。其他字段填得越详细，AI 越懂你的世界。
        </p>
      </header>

      {/* 必填项 */}
      <section className="border-2 border-outline rounded-md bg-surface p-4 shadow-pixel-1 space-y-3">
        <h2 className="font-pixel text-pixel-md">
          必填 <span className="font-ui text-xs text-ink-mute">(完成判定 = 这三项)</span>
        </h2>
        <Field label="书名 *" hint="作品标题">
          <PixelInput
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="《雪夜回声》"
          />
        </Field>
        <Field label="类型 *" hint="例：玄幻、悬疑、科幻、言情">
          <PixelInput
            value={form.genre}
            onChange={(e) => update('genre', e.target.value)}
            placeholder="古典悬疑"
          />
        </Field>
        <Field label="一句话故事钩子 *" hint="这本书最吸引人的一句话设定">
          <PixelTextArea
            rows={2}
            value={form.hook}
            onChange={(e) => update('hook', e.target.value)}
            placeholder="十年前的雪夜失踪案，一柄断剑回到了原主手中。"
          />
        </Field>
      </section>

      {/* 选填 */}
      <section className="border-2 border-outline-soft rounded-md bg-surface-raised p-4 space-y-3">
        <h2 className="font-pixel text-pixel-md text-ink-soft">
          选填 <span className="font-ui text-xs text-ink-mute">(填得越多 AI 越懂)</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="基调 / 风格" hint="如：克制、冷峻、热血">
            <PixelInput
              value={form.style}
              onChange={(e) => update('style', e.target.value)}
            />
          </Field>
          <Field label="情绪基调" hint="如：黑暗、轻松、史诗、讽刺">
            <PixelInput value={form.tone} onChange={(e) => update('tone', e.target.value)} />
          </Field>
          <Field label="时代背景">
            <PixelInput value={form.era} onChange={(e) => update('era', e.target.value)} />
          </Field>
          <Field label="视角" hint="第一/第三人称限知/多 POV">
            <PixelInput value={form.pov} onChange={(e) => update('pov', e.target.value)} />
          </Field>
        </div>
        <Field label="世界观" hint="这个世界的基本运行规则">
          <PixelTextArea
            rows={3}
            value={form.worldview}
            onChange={(e) => update('worldview', e.target.value)}
          />
        </Field>
        <Field label="核心思想" hint="逗号分隔">
          <PixelInput
            value={form.themes}
            onChange={(e) => update('themes', e.target.value)}
            placeholder="执念, 真相, 救赎"
          />
        </Field>
        <Field label="硬规则" hint="逗号分隔，AI 必须遵守的铁律">
          <PixelInput
            value={form.rules}
            onChange={(e) => update('rules', e.target.value)}
            placeholder="人不可复活, 现实主义"
          />
        </Field>
        <Field label="反约束" hint="逗号分隔，AI 绝对不能写的内容">
          <PixelInput
            value={form.avoid}
            onChange={(e) => update('avoid', e.target.value)}
            placeholder="现代俚语, 直白说教"
          />
        </Field>
      </section>

      {/* 模式说明（不可改）*/}
      <section className="border-2 border-outline-soft rounded-md bg-surface-raised p-3 flex items-center justify-between gap-3">
        <div>
          <span className="font-pixel text-pixel-sm">创作模式</span>
          <span className="ml-2 font-ui text-xs text-ink-soft">
            {ctx.book.engineMode === 'simulation' ? '模拟模式 ✨' : '传统模式'}
          </span>
        </div>
        <span className="font-ui text-[11px] text-ink-mute">
          创建时已锁定 · 想换模式请新建一本书
        </span>
      </section>

      {/* 操作按钮 */}
      <footer className="flex flex-wrap gap-3 items-center">
        <PixelButton
          variant="ghost"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? '保存中…' : dirty ? '保存草稿' : '已保存'}
        </PixelButton>
        <PixelButton
          disabled={!localProgress.done || saveMutation.isPending}
          onClick={handleAdvance}
        >
          {localProgress.done
            ? `下一步：建设定 ② →`
            : `还差：${localProgress.blockers.join(' / ')}`}
        </PixelButton>
        <span className="ml-auto font-ui text-xs text-ink-mute">
          进度：{Math.round(persistedProgress.ratio * 100)}%
          {dirty && <span className="ml-2 text-warning">未保存</span>}
        </span>
      </footer>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-2">
        <span className="font-pixel text-pixel-sm text-ink">{label}</span>
        {hint && <span className="font-ui text-[11px] text-ink-mute">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
