import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PixelButton,
  PixelInput,
  PixelList,
  PixelListItem,
  PixelScrollArea,
} from '@grid-story/pixel-kit';
import type { Chapter } from '@grid-story/schema';
import { useBookId } from '../lib/book';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { ProseEditor } from '../features/writing/Editor';
import { AiDraftDialog, type DraftRequest } from '../features/writing/AiDraftDialog';

type ChapterRow = Chapter;

interface ChapterHead {
  rootId: string;
  latest: ChapterRow;
  versionCount: number;
}

function groupByRoot(rows: ChapterRow[]): ChapterHead[] {
  const map = new Map<string, ChapterRow[]>();
  for (const r of rows) {
    const list = map.get(r.chapterRootId) ?? [];
    list.push(r);
    map.set(r.chapterRootId, list);
  }
  const heads: ChapterHead[] = [];
  for (const [rootId, list] of map) {
    list.sort((a, b) => b.version - a.version);
    heads.push({ rootId, latest: list[0], versionCount: list.length });
  }
  heads.sort((a, b) => a.latest.order - b.latest.order);
  return heads;
}

export default function WritingDesk() {
  const [bookId] = useBookId();
  const qc = useQueryClient();

  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const chaptersQuery = useQuery({
    queryKey: ['chapters', bookId],
    queryFn: () => api.get<ChapterRow[]>(`/bible/chapters?bookId=${encodeURIComponent(bookId)}`),
  });

  const heads = useMemo(() => groupByRoot(chaptersQuery.data ?? []), [chaptersQuery.data]);
  const current = useMemo(
    () => heads.find((h) => h.rootId === selectedRoot) ?? null,
    [heads, selectedRoot],
  );

  // 切章 → 把 latest 内容灌入编辑态
  useEffect(() => {
    if (current) {
      setTitle(current.latest.title);
      setContent(current.latest.content);
    } else if (selectedRoot === '__new__') {
      setTitle('');
      setContent('');
    }
  }, [current, selectedRoot]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['chapters', bookId] });

  const createChapter = useMutation({
    mutationFn: async () => {
      const rootId = `chap_${crypto.randomUUID().slice(0, 8)}`;
      const order = heads.length;
      const body = {
        bookId,
        chapterRootId: rootId,
        title: title.trim() || `第 ${order + 1} 章`,
        content,
        version: 1,
        parentVersionId: null,
        status: 'draft' as const,
        wordCount: content.length,
        order,
        notes: null,
      };
      const created = await api.post<ChapterRow>('/bible/chapters', body);
      return created;
    },
    onSuccess: (created) => {
      invalidate();
      setSelectedRoot(created.chapterRootId);
      toast.success(`已创建：${created.title}`);
    },
    onError: (e: unknown) => toast.error(`创建失败：${(e as Error)?.message ?? '未知错误'}`),
  });

  const newVersion = useMutation({
    mutationFn: async (rootId: string) => {
      return api.post<ChapterRow>(`/chapter/${rootId}/new-version`, {
        title: title.trim() || undefined,
        content,
      });
    },
    onSuccess: (created) => {
      invalidate();
      toast.success(`已保存 v${created.version}`);
    },
    onError: (e: unknown) => toast.error(`保存失败：${(e as Error)?.message ?? '未知错误'}`),
  });

  const transition = useMutation({
    mutationFn: async ({ rootId, status }: { rootId: string; status: ChapterRow['status'] }) =>
      api.post(`/chapter/${rootId}/transition`, { status }),
    onSuccess: (_data, vars) => {
      invalidate();
      toast.success(`状态 → ${vars.status}`);
    },
    onError: (e: unknown) => toast.error(`流转失败：${(e as Error)?.message ?? '未知错误'}`),
  });

  const aiDraft = useMutation({
    mutationFn: async (req: DraftRequest) =>
      api.post<{ ok: boolean; wordCount: number; content: string }>(
        '/agent/writing/first-draft',
        { bookId, ...req },
      ),
    onSuccess: (resp) => {
      setContent(resp.content);
      setAiOpen(false);
      setAiError(null);
      toast.success(`AI 首稿已写入（${resp.wordCount} 字）`);
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof ApiError
          ? `后端 ${e.status}: ${JSON.stringify(e.body)}`
          : (e as Error)?.message ?? '调用失败';
      setAiError(msg);
    },
  });

  const dirty =
    !!current &&
    (title !== current.latest.title || content !== current.latest.content);

  const newDraftDirty =
    selectedRoot === '__new__' && (title.trim() !== '' || content.trim() !== '');

  /**
   * 切章前的 dirty guard —— 防止内测用户误点列表丢失未保存修改。
   */
  const guardedSelect = (next: string | null) => {
    if ((dirty || newDraftDirty) && next !== selectedRoot) {
      const ok = confirm('当前章节有未保存的修改。继续切换会丢失它们 —— 确认吗？');
      if (!ok) return;
    }
    setSelectedRoot(next);
  };

  // 浏览器关 / 刷新前的兜底
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (dirty || newDraftDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [dirty, newDraftDirty]);

  const handleSave = () => {
    if (selectedRoot === '__new__' || !current) {
      createChapter.mutate();
    } else {
      newVersion.mutate(current.rootId);
    }
  };

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto">
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="font-pixel text-pixel-lg">Writing Desk</h1>
        <span className="font-ui text-sm text-ink-soft">
          T2.4 · TipTap 编辑器 + AI 首稿触发
        </span>
      </header>

      <div className="grid grid-cols-[280px_1fr] gap-4 items-start">
        <aside className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-3">
          <PixelButton
            className="w-full mb-3"
            onClick={() => guardedSelect('__new__')}
          >
            + 新建章节
          </PixelButton>
          <PixelScrollArea maxHeight={520}>
            {chaptersQuery.isLoading && (
              <div className="font-ui text-sm text-ink-soft p-2">加载中…</div>
            )}
            {chaptersQuery.isError && (
              <div className="font-ui text-sm text-danger p-2">
                加载失败 — 后端可能未启动。
              </div>
            )}
            {chaptersQuery.isSuccess && heads.length === 0 && (
              <div className="font-ui text-sm text-ink-soft p-2">
                book <code className="font-mono">{bookId}</code> 还没有章节。
              </div>
            )}
            {heads.length > 0 && (
              <PixelList>
                {heads.map((h) => (
                  <PixelListItem
                    key={h.rootId}
                    active={h.rootId === selectedRoot}
                    onClick={() => guardedSelect(h.rootId)}
                    leading={
                      <span
                        className={
                          'inline-block w-2 h-2 ' +
                          (h.latest.status === 'final'
                            ? 'bg-success'
                            : h.latest.status === 'review'
                              ? 'bg-warning'
                              : 'bg-secondary')
                        }
                      />
                    }
                    trailing={
                      <span className="font-pixel text-pixel-sm">
                        v{h.latest.version}
                      </span>
                    }
                  >
                    {h.latest.title}
                  </PixelListItem>
                ))}
              </PixelList>
            )}
          </PixelScrollArea>
        </aside>

        <main className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-6 min-h-[600px]">
          {selectedRoot === null ? (
            <div className="font-ui text-sm text-ink-soft text-center py-12">
              选一个章节，或点击「+ 新建章节」开始。
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <PixelInput
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="章节标题"
                  className="flex-1"
                />
                <PixelButton
                  variant="ghost"
                  onClick={() => {
                    setAiError(null);
                    setAiOpen(true);
                  }}
                >
                  AI 生成首稿
                </PixelButton>
                <PixelButton
                  disabled={
                    !dirty && selectedRoot !== '__new__' ||
                    createChapter.isPending ||
                    newVersion.isPending
                  }
                  onClick={handleSave}
                >
                  {createChapter.isPending || newVersion.isPending
                    ? '保存中…'
                    : selectedRoot === '__new__'
                      ? '创建章节'
                      : '保存为新版本'}
                </PixelButton>
              </div>

              <div className="bg-surface-raised border-2 border-outline-soft rounded-sm p-6 min-h-[420px]">
                <ProseEditor
                  content={content}
                  onChange={setContent}
                  editable={!aiDraft.isPending}
                />
              </div>

              <footer className="mt-3 flex items-center gap-4 font-ui text-sm text-ink-soft">
                <span>字数 {content.length}</span>
                {current && (
                  <>
                    <span>·</span>
                    <span>v{current.latest.version}（共 {current.versionCount}）</span>
                    <span>·</span>
                    <span>状态 {current.latest.status}</span>
                    <div className="ml-auto flex gap-2">
                      {current.latest.status === 'draft' && (
                        <PixelButton
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            transition.mutate({ rootId: current.rootId, status: 'review' })
                          }
                        >
                          → review
                        </PixelButton>
                      )}
                      {current.latest.status === 'review' && (
                        <>
                          <PixelButton
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              transition.mutate({ rootId: current.rootId, status: 'revised' })
                            }
                          >
                            → revised
                          </PixelButton>
                          <PixelButton
                            size="sm"
                            onClick={() =>
                              transition.mutate({ rootId: current.rootId, status: 'final' })
                            }
                          >
                            → final
                          </PixelButton>
                        </>
                      )}
                    </div>
                  </>
                )}
              </footer>

              {aiDraft.isPending && (
                <p className="mt-3 font-ui text-sm text-primary">
                  正在生成首稿，根据字数与模型，通常 30s–2min…
                </p>
              )}
            </>
          )}
        </main>
      </div>

      <AiDraftDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onSubmit={(req) => aiDraft.mutate(req)}
        pending={aiDraft.isPending}
        error={aiError}
        defaultPreviousEnding={current?.latest.content.slice(-300)}
      />
    </div>
  );
}
