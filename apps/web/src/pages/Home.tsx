import { PixelButton } from '@grid-story/pixel-kit';
import type { Book, Chapter, Character, Outline } from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CharterBanner } from '../components/CharterBanner';
import { MiniStats } from '../components/MiniStats';
import { ApiError, api, formatApiError } from '../lib/api';
import { useBookId } from '../lib/book';
import { type StepStats, getNextStep } from '../lib/nextStep';
import { seedDemoData } from '../lib/seed';
import { toast } from '../lib/toast';

export interface BookStats {
  characters: number;
  outlines: number;
  chapters: number;
  finalChapters: number;
  draftChapters: number;
  reviewChapters: number;
  draftChapterTitle?: string;
  reviewChapterTitle?: string;
  /** Word count across final + published chapters (latest version per root) */
  totalWords: number;
  /** Word count of the most recently updated chapter */
  lastChapterWords: number;
  /** Word count of chapters updated in the last 7 days */
  wordsThisWeek: number;
  publishedCount: number;
  draftCount: number;
  reviewCount: number;
  finalCount: number;
}

function StepCard({
  done,
  step,
  title,
  body,
  to,
  cta,
}: {
  done: boolean;
  step: number;
  title: string;
  body: React.ReactNode;
  to: string;
  cta: string;
}) {
  return (
    <div
      className={`border-2 border-outline rounded-md p-4 flex gap-3 items-start ${done ? 'bg-success/10' : 'bg-surface'} shadow-pixel-1`}
    >
      <div
        className={`shrink-0 w-8 h-8 flex items-center justify-center font-pixel text-pixel-md ${done ? 'bg-success text-on-primary' : 'bg-primary text-on-primary'}`}
      >
        {done ? '✓' : step}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-pixel text-pixel-md mb-1">{title}</h3>
        <div className="font-ui text-sm text-ink-soft leading-6 mb-3">{body}</div>
        <Link to={to}>
          <PixelButton size="sm" variant={done ? 'ghost' : 'primary'}>
            {cta}
          </PixelButton>
        </Link>
      </div>
    </div>
  );
}

const CHARTER_KEYS = [
  'worldview',
  'era',
  'themes',
  'hook',
  'pov',
  'tone',
  'rules',
  'avoid',
] as const;

function charterFilled(b: Book): number {
  return CHARTER_KEYS.filter((k) => {
    const v = b[k as keyof Book];
    if (Array.isArray(v)) return v.length > 0;
    return v != null && v !== '';
  }).length;
}

export default function Home() {
  const params = useParams();
  const urlBookId = params.bookId;
  const [storedBookId, setBookId] = useBookId();
  const bookId = urlBookId ?? storedBookId;

  // Sync URL → localStorage
  useEffect(() => {
    if (urlBookId && urlBookId !== storedBookId) {
      setBookId(urlBookId);
    }
  }, [urlBookId, storedBookId, setBookId]);

  const qc = useQueryClient();
  const [seedError, setSeedError] = useState<string | null>(null);
  const showSeedButton =
    import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === '1';

  const stats = useQuery<BookStats>({
    queryKey: ['stats', bookId],
    queryFn: async () => {
      const [chars, outlines, chaps] = await Promise.all([
        api.get<Character[]>(`/bible/characters?bookId=${encodeURIComponent(bookId)}`),
        api.get<Outline[]>(`/bible/outlines?bookId=${encodeURIComponent(bookId)}`),
        api.get<Chapter[]>(`/bible/chapters?bookId=${encodeURIComponent(bookId)}`),
      ]);
      const statusCount = (status: Chapter['status']) =>
        new Set(
          chaps.filter((c) => c.status === status).map((c) => c.chapterRootId),
        ).size;
      const latestByRoot = new Map<string, Chapter>();
      for (const c of chaps) {
        const existing = latestByRoot.get(c.chapterRootId);
        if (!existing || new Date(c.createdAt) > new Date(existing.createdAt)) {
          latestByRoot.set(c.chapterRootId, c);
        }
      }
      const draftChapters = [...latestByRoot.values()].filter((c) => c.status === 'draft');
      const reviewChapters = [...latestByRoot.values()].filter((c) => c.status === 'review');
      const finalChaps = [...latestByRoot.values()].filter(
        (c) => c.status === 'final' || c.status === 'published',
      );
      const totalWords = finalChaps.reduce((sum, c) => sum + c.wordCount, 0);
      const sortedByUpdated = [...chaps].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      const lastChapterWords = sortedByUpdated[0]?.wordCount ?? 0;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const wordsThisWeek = chaps
        .filter((c) => new Date(c.updatedAt) >= weekAgo)
        .reduce((sum, c) => sum + c.wordCount, 0);
      return {
        characters: chars.length,
        outlines: outlines.length,
        chapters: new Set(chaps.map((c) => c.chapterRootId)).size,
        finalChapters: statusCount('final') + statusCount('published'),
        draftChapters: draftChapters.length,
        reviewChapters: reviewChapters.length,
        draftChapterTitle: draftChapters[0]?.title,
        reviewChapterTitle: reviewChapters[0]?.title,
        totalWords,
        lastChapterWords,
        wordsThisWeek,
        publishedCount: statusCount('published'),
        draftCount: statusCount('draft'),
        reviewCount: statusCount('review'),
        finalCount: statusCount('final'),
      };
    },
  });

  const bookQuery = useQuery<Book>({
    queryKey: ['book', bookId],
    queryFn: () => api.get<Book>(`/book/${encodeURIComponent(bookId)}`),
    retry: false,
  });

  const seed = useMutation({
    mutationFn: () => seedDemoData(bookId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stats', bookId] });
      setSeedError(null);
      toast.success('已灌入示例数据');
    },
    onError: (e: unknown) => {
      setSeedError(formatApiError(e, '示例数据创建失败，请稍后重试'));
    },
  });

  const s = stats.data;
  const hasAny = !!s && (s.characters > 0 || s.outlines > 0 || s.chapters > 0);
  const book = bookQuery.data;
  const cf = book ? charterFilled(book) : 0;
  const charterPct = Math.round((cf / CHARTER_KEYS.length) * 100);

  const stepStats: StepStats | undefined = s
    ? { ...s, charterFilled: cf, charterTotal: CHARTER_KEYS.length }
    : undefined;
  const nextStep = getNextStep(stepStats);

  return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-pixel text-pixel-lg mb-1">
              {book?.title ?? '故事工作台'}
            </h1>
            <p className="font-ui text-sm text-ink-soft">
              {hasAny
                ? `${s?.characters} 角色 · ${s?.outlines} 大纲节点 · ${s?.chapters} 章节`
                : '从空白作品到第一章定稿，先把设定、大纲和草稿串起来'}
            </p>
          </div>
          {nextStep && (
            <Link
              to={`/books/${bookId}/${nextStep.to}`}
              className={`shrink-0 font-pixel text-pixel-sm px-3 py-1.5 rounded-sm border-2 ${
                nextStep.urgency === 'warning'
                  ? 'border-warning text-warning bg-warning/10'
                  : nextStep.urgency === 'action'
                    ? 'border-primary text-primary bg-primary-soft'
                    : 'border-outline-soft text-ink-soft'
              }`}
            >
              → {nextStep.label}
            </Link>
          )}
        </div>
      </header>

      {/* Charter banner for low completion */}
      <CharterBanner bookId={bookId} filled={cf} total={CHARTER_KEYS.length} />

      {/* Book overview card */}
      <section className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-pixel text-pixel-md mb-1">作品概览</h2>
            <p className="font-ui text-sm text-ink-soft">
              {book?.title ?? '未命名作品'}
              {book?.status ? ` · ${({ planning: '构思中', writing: '连载中', completed: '已完结', hiatus: '搁置中' } as const)[book.status]}` : ''}
            </p>
          </div>
          {stats.isSuccess && (
            <div className="flex gap-4 font-ui text-sm">
              <span>
                <span className="font-pixel text-pixel-sm">{s?.characters}</span> 角色
              </span>
              <span>
                <span className="font-pixel text-pixel-sm">{s?.outlines}</span> 大纲节点
              </span>
              <span>
                <span className="font-pixel text-pixel-sm">{s?.chapters}</span> 章节
              </span>
              <span>
                <span className="font-pixel text-pixel-sm text-success">{s?.finalChapters}</span>{' '}
                已定稿
              </span>
            </div>
          )}
          {showSeedButton && (
            <div className="flex gap-2">
              <PixelButton
                variant="ghost"
                disabled={seed.isPending || hasAny}
                onClick={() => seed.mutate()}
                title={hasAny ? '当前作品已有数据，避免重复创建示例内容' : '创建示例角色与大纲'}
              >
                {seed.isPending ? '创建中…' : hasAny ? '已有数据' : '创建示例'}
              </PixelButton>
            </div>
          )}
        </div>

        {/* Charter status bar */}
        <div className="mt-3 pt-3 border-t-2 border-outline flex items-center gap-3 font-ui text-sm">
          {bookQuery.isLoading && <span className="text-ink-soft">创作设定加载中…</span>}
          {bookQuery.error &&
            !(bookQuery.error instanceof ApiError && bookQuery.error.status === 404) && (
              <span className="text-danger">创作设定加载失败，请稍后重试</span>
            )}
          {bookQuery.error instanceof ApiError && bookQuery.error.status === 404 && (
            <span className="text-ink-soft">
              创作设定尚未创建 —{' '}
              <Link to={`/books/${bookId}/settings`} className="text-primary hover:underline">
                去创建
              </Link>
            </span>
          )}
          {bookQuery.data && (
            <>
              <span className="font-pixel text-pixel-sm">
                创作设定: {charterFilled(bookQuery.data)}/{CHARTER_KEYS.length}
              </span>
              <div className="flex-1 h-2 bg-surface-raised border border-outline rounded-sm overflow-hidden max-w-[160px]">
                <div
                  className="h-full bg-primary transition-[width] duration-300"
                  style={{ width: `${charterPct}%` }}
                />
              </div>
              <Link
                to={`/books/${bookId}/settings`}
                className="text-primary hover:underline ml-auto"
              >
                编辑设定
              </Link>
            </>
          )}
        </div>
        {seedError && <p className="mt-3 font-ui text-sm text-danger">示例创建失败：{seedError}</p>}
        {seed.isSuccess && (
          <p className="mt-3 font-ui text-sm text-success">
            ✓ 已创建示例角色、四层大纲和一个空章节。
          </p>
        )}
      </section>

      {/* Data-state: progress仪表 */}
      {hasAny && s && <MiniStats stats={s} />}

      {/* Onboarding / progress steps */}
      <section className="space-y-3">
        <h2 className="font-pixel text-pixel-md mb-2">
          {hasAny ? '创作进度' : '开始创作'}
        </h2>
        <StepCard
          step={1}
          done={!!s && s.characters > 0}
          title="建立设定库"
          body={<>至少创建一个角色。AI 写作时会参考你的设定，角色不会跑偏。</>}
          to={`/books/${bookId}/bible`}
          cta={!!s && s.characters > 0 ? '管理角色' : '+ 创建第一个角色'}
        />
        <StepCard
          step={2}
          done={!!s && s.outlines >= 4}
          title="搭建大纲（总纲 → 卷 → 章 → 场景）"
          body={
            <>
              至少铺到章和场景两层。
              <br />
              手工拖卡片，<strong>或</strong>用页面右上「AI 生成大纲」从一句点子起步。
            </>
          }
          to={`/books/${bookId}/outline`}
          cta={!!s && s.outlines > 0 ? '编辑大纲' : '+ 新建总纲'}
        />
        <StepCard
          step={3}
          done={!!s && s.chapters > 0}
          title="写第一章（AI 起草 + 人审）"
          body={
            <>
              在写作页创建章节，点「AI 生成首稿」描述场景。 生成后你可以继续修改，再保存为新版本。
            </>
          }
          to={`/books/${bookId}/writing`}
          cta={!!s && s.chapters > 0 ? '继续写作' : '+ 新建章节'}
        />
        <StepCard
          step={4}
          done={!!s && s.finalChapters > 0}
          title="章节定稿"
          body={<>写完后把章节送审，再确认定稿。 提交后章节进入定稿状态。</>}
          to={`/books/${bookId}/writing`}
          cta="去定稿"
        />
      </section>
    </div>
  );
}
