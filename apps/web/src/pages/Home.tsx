import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PixelButton } from '@grid-story/pixel-kit';
import { useBookId } from '../lib/book';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { seedDemoData } from '../lib/seed';
import type { Book, Character, Chapter, Outline } from '@grid-story/schema';

interface BookStats {
  characters: number;
  outlines: number;
  chapters: number;
  finalChapters: number;
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
      className={
        'border-2 border-outline rounded-md p-4 flex gap-3 items-start ' +
        (done ? 'bg-success/10' : 'bg-surface') +
        ' shadow-pixel-1'
      }
    >
      <div
        className={
          'shrink-0 w-8 h-8 flex items-center justify-center font-pixel text-pixel-md ' +
          (done ? 'bg-success text-on-primary' : 'bg-primary text-on-primary')
        }
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

export default function Home() {
  const [bookId] = useBookId();
  const qc = useQueryClient();
  const [seedError, setSeedError] = useState<string | null>(null);

  const stats = useQuery<BookStats>({
    queryKey: ['stats', bookId],
    queryFn: async () => {
      const [chars, outlines, chaps] = await Promise.all([
        api.get<Character[]>(`/bible/characters?bookId=${encodeURIComponent(bookId)}`),
        api.get<Outline[]>(`/bible/outlines?bookId=${encodeURIComponent(bookId)}`),
        api.get<Chapter[]>(`/bible/chapters?bookId=${encodeURIComponent(bookId)}`),
      ]);
      const finalChapters = new Set(
        chaps.filter((c) => c.status === 'final' || c.status === 'published').map((c) => c.chapterRootId),
      ).size;
      return {
        characters: chars.length,
        outlines: outlines.length,
        chapters: new Set(chaps.map((c) => c.chapterRootId)).size,
        finalChapters,
      };
    },
  });

  const CHARTER_KEYS = ['worldview', 'era', 'themes', 'hook', 'pov', 'tone', 'rules', 'avoid'] as const;

  const bookQuery = useQuery<Book>({
    queryKey: ['book', bookId],
    queryFn: () => api.get<Book>(`/book/${encodeURIComponent(bookId)}`),
    retry: false,
  });

  function charterFilled(b: Book): number {
    return CHARTER_KEYS.filter((k) => {
      const v = b[k as keyof Book];
      if (Array.isArray(v)) return v.length > 0;
      return v != null && v !== '';
    }).length;
  }

  const seed = useMutation({
    mutationFn: () => seedDemoData(bookId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stats', bookId] });
      setSeedError(null);
      toast.success('已灌入示例数据');
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError ? `后端 ${e.status}: ${JSON.stringify(e.body)}` : (e as Error)?.message;
      setSeedError(msg ?? '未知错误');
    },
  });

  const s = stats.data;
  const hasAny = !!s && (s.characters > 0 || s.outlines > 0 || s.chapters > 0);

  return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <header className="mb-8">
        <h1 className="font-pixel text-pixel-lg mb-2">grid-story · MVP 流程</h1>
        <p className="font-ui text-sm text-ink-soft">
          像素二次元风的人机共创小说工具。从空仓库到第一章定稿，按下面四步走。
          所有数据按当前 bookId（右上角可切换）聚合。
        </p>
      </header>

      <section className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-pixel text-pixel-md mb-1">当前 book</h2>
            <code className="font-mono text-sm">{bookId}</code>
          </div>
          {stats.isSuccess && (
            <div className="flex gap-4 font-ui text-sm">
              <span><span className="font-pixel text-pixel-sm">{s!.characters}</span> 角色</span>
              <span><span className="font-pixel text-pixel-sm">{s!.outlines}</span> 大纲节点</span>
              <span><span className="font-pixel text-pixel-sm">{s!.chapters}</span> 章节</span>
              <span><span className="font-pixel text-pixel-sm text-success">{s!.finalChapters}</span> 已定稿</span>
            </div>
          )}
          <div className="flex gap-2">
            <PixelButton
              variant="ghost"
              disabled={seed.isPending || hasAny}
              onClick={() => seed.mutate()}
              title={hasAny ? '当前 book 已有数据，避免重复 seed' : '一键灌入示例角色与大纲'}
            >
              {seed.isPending ? 'seeding…' : hasAny ? '已有数据' : 'Seed demo'}
            </PixelButton>
          </div>
        </div>
        {/* Charter status */}
        <div className="mt-3 pt-3 border-t-2 border-outline flex items-center gap-3 font-ui text-sm">
          {bookQuery.isLoading && (
            <span className="text-ink-soft">Charter 加载中…</span>
          )}
          {bookQuery.error && !(bookQuery.error instanceof ApiError && bookQuery.error.status === 404) && (
            <span className="text-danger">Charter 加载失败</span>
          )}
          {(bookQuery.error instanceof ApiError && bookQuery.error.status === 404) && (
            <span className="text-ink-soft">
              Charter 尚未创建 —{' '}
              <Link to="/settings" className="text-primary hover:underline">去创建</Link>
            </span>
          )}
          {bookQuery.data && (
            <>
              <span className="font-pixel text-pixel-sm">
                Charter: {charterFilled(bookQuery.data)}/{CHARTER_KEYS.length}
              </span>
              <div className="flex-1 h-2 bg-surface-raised border border-outline rounded-sm overflow-hidden max-w-[160px]">
                <div
                  className="h-full bg-primary transition-[width] duration-300"
                  style={{ width: `${(charterFilled(bookQuery.data) / CHARTER_KEYS.length) * 100}%` }}
                />
              </div>
              <Link to="/settings" className="text-primary hover:underline ml-auto">
                编辑设定
              </Link>
            </>
          )}
        </div>
        {seedError && (
          <p className="mt-3 font-ui text-sm text-danger">seed 失败：{seedError}</p>
        )}
        {seed.isSuccess && (
          <p className="mt-3 font-ui text-sm text-success">
            ✓ 已创建：1 角色 + arc/volume/chapter/scene 四层大纲 + 1 空章节。
          </p>
        )}
      </section>

      <section className="space-y-3">
        <StepCard
          step={1}
          done={!!s && s.characters > 0}
          title="建立设定库"
          body={
            <>
              至少创建一个角色 —— 后续 AI 写作时 ContextComposer 会自动把
              Bible 切片注入 prompt，保证人设不漂。
            </>
          }
          to="/bible"
          cta={!!s && s.characters > 0 ? '管理角色' : '+ 创建第一个角色'}
        />
        <StepCard
          step={2}
          done={!!s && s.outlines >= 4}
          title="搭建大纲（arc → volume → chapter → scene）"
          body={
            <>
              至少铺到 chapter / scene 两层 —— WritingAgent 会读取作上下文。
              <br />
              手工拖卡片，<strong>或</strong>用页面右上「AI 生成大纲」一句话 idea 一键铺四层。
            </>
          }
          to="/outline"
          cta={!!s && s.outlines > 0 ? '编辑大纲' : '+ 新建总纲'}
        />
        <StepCard
          step={3}
          done={!!s && s.chapters > 0}
          title="写第一章（AI 起草 + 人审）"
          body={
            <>
              在 Writing Desk 创建章节，点「AI 生成首稿」描述场景 brief，
              模型会按当前 Bible + 大纲产出草稿，人审后保存为新版本。
            </>
          }
          to="/writing"
          cta={!!s && s.chapters > 0 ? '继续写作' : '+ 新建章节'}
        />
        <StepCard
          step={4}
          done={!!s && s.finalChapters > 0}
          title="转 final（章节定稿）"
          body={
            <>
              在 Writing Desk 底部把状态从 draft → review → final。
              触发后续摘要 / 检索由 T3 任务接管（目前是空操作）。
            </>
          }
          to="/writing"
          cta="去定稿"
        />
      </section>

      <p className="mt-8 font-ui text-xs text-ink-mute">
        视觉规范见 <code className="font-mono">apps/web/DESIGN.md</code>，模块拆解见根目录{' '}
        <code className="font-mono">DESIGN.md</code>，TaskID 与依赖见{' '}
        <code className="font-mono">TASKS.md</code>。
      </p>
    </div>
  );
}
