import { PixelButton, PixelInput } from '@grid-story/pixel-kit';
import type { Chapter, Location } from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProseEditor } from '../../writing/Editor';
import { SceneEngineDrawer } from '../../story-engine/SceneEngineDrawer';
import { api, formatApiError } from '../../../lib/api';
import { toast } from '../../../lib/toast';
import { PUBLISH_STAGE, SETUP_STAGE, WRITING_STAGE } from '../definitions';
import type { StageContext } from '../types';

interface WritingStageProps {
  ctx: StageContext;
  bookId: string;
}

const STATUS_LABEL: Record<Chapter['status'], string> = {
  draft: '草稿',
  review: '审稿',
  revised: '修订',
  final: '终稿',
  published: '已发',
};
const STATUS_FLOW: Chapter['status'][] = ['draft', 'review', 'revised', 'final'];

export function WritingStage({ ctx, bookId }: WritingStageProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Group chapters by chapterRootId, take latest version per root
  const grouped = useMemo(() => groupLatestPerRoot(ctx.chapters), [ctx.chapters]);
  const locationsQuery = useQuery<Location[]>({
    queryKey: ['bible', 'locations', bookId],
    queryFn: () =>
      api.get<Location[]>(`/bible/locations?bookId=${encodeURIComponent(bookId)}`),
    staleTime: 60_000,
  });
  const [selectedRootId, setSelectedRootId] = useState<string | null>(
    grouped[0]?.chapterRootId ?? null,
  );
  useEffect(() => {
    if (!selectedRootId && grouped[0]) setSelectedRootId(grouped[0].chapterRootId);
  }, [grouped, selectedRootId]);

  const current = useMemo(
    () => grouped.find((c) => c.chapterRootId === selectedRootId) ?? null,
    [grouped, selectedRootId],
  );

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);
  const lastLoadedRoot = useRef<string | null>(null);

  // Sync chapter → editor when selection changes
  useEffect(() => {
    if (!current) {
      setTitle('');
      setContent('');
      lastLoadedRoot.current = null;
      return;
    }
    if (lastLoadedRoot.current !== current.chapterRootId) {
      setTitle(current.title);
      setContent(current.content);
      setDirty(false);
      lastLoadedRoot.current = current.chapterRootId;
    }
  }, [current]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['chapters', bookId] });
  };

  const createChapter = useMutation({
    mutationFn: async (input?: { title?: string; outlineSceneId?: string | null }) => {
      const order = grouped.length + 1;
      const rootId = `chap_${crypto.randomUUID().slice(0, 8)}`;
      const created = await api.post<Chapter>('/bible/chapters', {
        bookId,
        chapterRootId: rootId,
        title: input?.title?.trim() || `第 ${order} 章`,
        content: '',
        version: 1,
        parentVersionId: null,
        status: 'draft' as const,
        wordCount: 0,
        order,
        outlineSceneId: input?.outlineSceneId ?? null,
        notes: null,
      });
      return created;
    },
    onSuccess: (created) => {
      invalidate();
      setSelectedRootId(created.chapterRootId);
      toast.success(`已创建：${created.title}`);
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '创建失败')),
  });

  // 一键从大纲 chapter 节点批量创建章节
  const importFromOutline = useMutation({
    mutationFn: async () => {
      const outlineChapters = ctx.outlines
        .filter((o) => o.type === 'chapter')
        .sort((a, b) => a.order - b.order);
      // 已有同 outline 节点的 chapter 不重复建
      const existing = new Set(
        ctx.chapters
          .map((c) => c.outlineSceneId)
          .filter((x): x is string => Boolean(x)),
      );
      let created = 0;
      let baseOrder = grouped.length;
      for (const node of outlineChapters) {
        if (existing.has(node.id)) continue;
        baseOrder += 1;
        const rootId = `chap_${crypto.randomUUID().slice(0, 8)}`;
        await api.post<Chapter>('/bible/chapters', {
          bookId,
          chapterRootId: rootId,
          title: node.title,
          content: '',
          version: 1,
          parentVersionId: null,
          status: 'draft' as const,
          wordCount: 0,
          order: baseOrder,
          outlineSceneId: node.id,
          notes: node.summary,
        });
        created += 1;
      }
      return created;
    },
    onSuccess: (created) => {
      invalidate();
      toast.success(`已从大纲导入 ${created} 章`);
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '导入失败')),
  });

  const saveDraft = useMutation({
    mutationFn: async (rootId: string) => {
      return api.put<{ ok: boolean; chapter: Chapter }>(`/chapter/${rootId}/draft`, {
        title: title.trim() || undefined,
        content,
      });
    },
    onSuccess: () => {
      invalidate();
      setDirty(false);
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '保存失败')),
  });

  const transition = useMutation({
    mutationFn: async ({ rootId, status }: { rootId: string; status: Chapter['status'] }) =>
      api.post(`/chapter/${rootId}/transition`, { status }),
    onSuccess: (_data, vars) => {
      invalidate();
      toast.success(`状态已切换：${STATUS_LABEL[vars.status]}`);
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '状态切换失败')),
  });

  // Auto-save with debounce
  useEffect(() => {
    if (!dirty || !current) return;
    const timer = setTimeout(() => {
      saveDraft.mutate(current.chapterRootId);
    }, 1500);
    return () => clearTimeout(timer);
  }, [dirty, current, saveDraft]);

  // 主角团变化检测
  const teamChanged = useMemo(() => {
    const snapshot = [...(ctx.book.protagonistTeam ?? [])].sort();
    const live = ctx.characters
      .filter((c) => c.isProtagonist)
      .map((c) => c.id)
      .sort();
    if (snapshot.length === 0 && live.length === 0) return false;
    return JSON.stringify(snapshot) !== JSON.stringify(live);
  }, [ctx.book.protagonistTeam, ctx.characters]);

  const stageProgress = WRITING_STAGE.computeProgress(ctx);
  const finalCount = ctx.chapters.filter((c) => c.status === 'final').length;
  const nextStatus = current ? nextStatusOf(current.status) : null;
  const outlineChapterCount = useMemo(
    () => ctx.outlines.filter((o) => o.type === 'chapter').length,
    [ctx.outlines],
  );

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      {/* 主角团变化提示 */}
      {teamChanged && (
        <div className="border-b-2 border-warning bg-warning/10 px-6 py-2 flex items-center justify-between gap-3 flex-shrink-0">
          <p className="font-ui text-xs text-ink-soft">
            ⚠ 主角团已变化（自上次确认后改动了 isProtagonist）。建议返回 ② 重新确认主角团。
          </p>
          <PixelButton
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/books/${bookId}/stages/${SETUP_STAGE.route}`)}
          >
            回到 ② 重新确认
          </PixelButton>
        </div>
      )}

      <div className="grid grid-cols-[240px_1fr] gap-4 flex-1 overflow-hidden p-4">
        {/* 章节列表 */}
        <aside className="border-2 border-outline rounded-md bg-surface shadow-pixel-1 overflow-hidden flex flex-col">
          <header className="border-b-2 border-outline px-3 py-2 flex items-center justify-between gap-2 flex-shrink-0">
            <span className="font-pixel text-pixel-sm">章节</span>
            <PixelButton
              size="sm"
              disabled={createChapter.isPending}
              onClick={() => createChapter.mutate(undefined)}
            >
              +
            </PixelButton>
          </header>
          {grouped.length === 0 && outlineChapterCount > 0 && (
            <div className="border-b-2 border-outline-soft p-2 space-y-1">
              <p className="font-ui text-[11px] text-ink-soft">
                大纲里有 {outlineChapterCount} 章，要不要一键导入？
              </p>
              <PixelButton
                size="sm"
                disabled={importFromOutline.isPending}
                onClick={() => importFromOutline.mutate()}
              >
                {importFromOutline.isPending ? '导入中…' : '从大纲导入'}
              </PixelButton>
            </div>
          )}
          <ul className="overflow-auto flex-1">
            {grouped.length === 0 && (
              <li className="font-ui text-xs text-ink-mute p-3">
                {outlineChapterCount > 0 ? '或点 + 单独建一章' : '点 + 创建第一章'}
              </li>
            )}
            {grouped.map((ch) => (
              <li key={ch.chapterRootId}>
                <button
                  type="button"
                  className={`w-full text-left px-3 py-2 border-b border-outline-soft transition-colors ${
                    ch.chapterRootId === selectedRootId
                      ? 'bg-primary-soft text-primary'
                      : 'hover:bg-surface-raised'
                  }`}
                  onClick={() => setSelectedRootId(ch.chapterRootId)}
                >
                  <div className="font-pixel text-pixel-sm truncate">{ch.title}</div>
                  <div className="font-ui text-[10px] text-ink-mute flex gap-2">
                    <span>{STATUS_LABEL[ch.status]}</span>
                    <span>· {ch.wordCount} 字</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* 编辑器 */}
        <main className="border-2 border-outline rounded-md bg-surface shadow-pixel-1 overflow-hidden flex flex-col">
          {!current ? (
            <div className="p-8 font-ui text-sm text-ink-soft text-center">
              点左侧 + 创建第一章，开始写作
            </div>
          ) : (
            <>
              {/* 顶部操作条 */}
              <header className="border-b-2 border-outline px-3 py-2 flex items-center gap-2 flex-shrink-0">
                <PixelInput
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setDirty(true);
                  }}
                  className="flex-1 min-w-0"
                />
                <span
                  className={`font-pixel text-pixel-sm px-2 py-1 border-2 rounded-sm ${
                    current.status === 'final'
                      ? 'border-success text-success'
                      : 'border-outline text-ink-soft'
                  }`}
                >
                  {STATUS_LABEL[current.status]}
                </span>
                {nextStatus && (
                  <PixelButton
                    size="sm"
                    variant="ghost"
                    disabled={transition.isPending}
                    onClick={() =>
                      transition.mutate({
                        rootId: current.chapterRootId,
                        status: nextStatus,
                      })
                    }
                    title={`推进状态：${STATUS_LABEL[current.status]} → ${STATUS_LABEL[nextStatus]}`}
                  >
                    → {STATUS_LABEL[nextStatus]}
                  </PixelButton>
                )}
                <PixelButton
                  size="sm"
                  onClick={() => setEngineOpen(true)}
                  disabled={current.status === 'final'}
                  title="打开故事引擎抽屉，进行场景模拟 / 推到章末"
                >
                  ✨ 故事引擎
                </PixelButton>
              </header>

              {/* 编辑器主体 */}
              <div className="flex-1 overflow-auto p-4">
                <ProseEditor
                  content={content}
                  onChange={(next) => {
                    setContent(next);
                    setDirty(true);
                  }}
                  editable={current.status !== 'final' && current.status !== 'published'}
                  placeholder="开始写作…或者点上方 ✨ 故事引擎，让 AI 推演场景填字。"
                />
              </div>

              {/* 底部状态条 */}
              <footer className="border-t-2 border-outline-soft px-3 py-1.5 flex items-center gap-3 flex-shrink-0">
                <span className="font-ui text-[11px] text-ink-mute">
                  {content.length} 字{dirty && <span className="ml-2 text-warning">未保存</span>}
                </span>
                <span className="ml-auto font-ui text-[11px] text-ink-mute">
                  {finalCount > 0
                    ? `已 finalize ${finalCount} 章 · 可前往 ⑤ 出版`
                    : stageProgress.nextHint}
                </span>
                {finalCount > 0 && (
                  <PixelButton
                    size="sm"
                    onClick={() => navigate(`/books/${bookId}/stages/${PUBLISH_STAGE.route}`)}
                  >
                    ⑤ 出版 →
                  </PixelButton>
                )}
              </footer>
            </>
          )}
        </main>
      </div>

      {/* 故事引擎抽屉（复用） */}
      <SceneEngineDrawer
        bookId={bookId}
        open={engineOpen}
        characters={ctx.characters}
        locations={locationsQuery.data ?? []}
        chapterId={current?.chapterRootId ?? null}
        defaultSceneIndex={0}
        onAdopted={() => {
          invalidate();
          // 抽屉里 adopt 后会更新 chapter content；这里也刷新本地 form
          if (current) {
            api
              .get<Chapter[]>(`/bible/chapters?bookId=${encodeURIComponent(bookId)}`)
              .then((rows) => {
                const rootId = current.chapterRootId;
                const refreshed = rows
                  .filter((r) => r.chapterRootId === rootId)
                  .sort((a, b) => b.version - a.version)[0];
                if (refreshed) {
                  setContent(refreshed.content);
                  setTitle(refreshed.title);
                  setDirty(false);
                }
              })
              .catch(() => null);
          }
        }}
        onClose={() => setEngineOpen(false)}
      />
    </div>
  );
}

function groupLatestPerRoot(chapters: Chapter[]): Chapter[] {
  const map = new Map<string, Chapter>();
  for (const ch of chapters) {
    const existing = map.get(ch.chapterRootId);
    if (!existing || ch.version > existing.version) {
      map.set(ch.chapterRootId, ch);
    }
  }
  return [...map.values()].sort((a, b) => a.order - b.order);
}

function nextStatusOf(status: Chapter['status']): Chapter['status'] | null {
  const idx = STATUS_FLOW.indexOf(status);
  if (idx < 0) return null;
  if (idx >= STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[idx + 1];
}
