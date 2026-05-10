import { PixelButton } from '@grid-story/pixel-kit';
import type { ChekhovHook, HookStatus } from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatApiError } from '../../lib/api';
import { toast } from '../../lib/toast';
import { storyEngineApi } from './api';

const STATUS_LABEL: Record<HookStatus | 'due_soon', string> = {
  planted: '已埋',
  developing: '发酵',
  due_soon: '临近',
  paid_off: '已兑现',
  discarded: '废弃',
};

const TYPE_LABEL: Record<ChekhovHook['type'], string> = {
  foreshadowing: '伏笔',
  debt: '债',
  hidden_object: '隐藏物',
  secret_knowledge: '秘密',
  unfulfilled_promise: '承诺',
  lurking_threat: '威胁',
};

interface ChekhovHookBoardProps {
  bookId: string;
  currentChapter?: number | null;
}

function isDueSoon(hook: ChekhovHook, currentChapter: number | null): boolean {
  if (hook.status !== 'planted' && hook.status !== 'developing') return false;
  if (currentChapter == null) return hook.urgency >= 8;
  return hook.preferredPayoffWindow.latestChapter <= currentChapter + 1 || hook.urgency >= 8;
}

function columns(hooks: ChekhovHook[], currentChapter: number | null) {
  const due = new Set(
    hooks.filter((hook) => isDueSoon(hook, currentChapter)).map((hook) => hook.id),
  );
  return [
    {
      key: 'planted',
      rows: hooks.filter((hook) => hook.status === 'planted' && !due.has(hook.id)),
    },
    {
      key: 'developing',
      rows: hooks.filter((hook) => hook.status === 'developing' && !due.has(hook.id)),
    },
    {
      key: 'due_soon',
      rows: hooks.filter((hook) => due.has(hook.id)),
    },
    {
      key: 'paid_off',
      rows: hooks.filter((hook) => hook.status === 'paid_off'),
    },
  ] as const;
}

export function ChekhovHookBoard({ bookId, currentChapter = null }: ChekhovHookBoardProps) {
  const qc = useQueryClient();
  const hooksQuery = useQuery({
    queryKey: ['story-engine', 'hooks', bookId],
    queryFn: () => storyEngineApi.listHooks(bookId),
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ChekhovHook> }) =>
      storyEngineApi.updateHook(bookId, id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['story-engine', 'hooks', bookId] }),
    onError: (error: unknown) => toast.error(formatApiError(error, '钩子更新失败')),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await storyEngineApi.suggestHooks(bookId, currentChapter ?? undefined);
      const hooks = res.suggestion.hooks ?? [];
      let created = 0;
      for (const h of hooks) {
        try {
          await storyEngineApi.createHook(bookId, {
            type: h.type,
            description: h.description,
            involvedCharacters: h.involvedCharacters ?? [],
            involvedEntities: h.involvedEntities ?? [],
            plantedAtChapter: h.plantedAtChapter,
            plantedScene: null,
            preferredPayoffWindow: h.preferredPayoffWindow,
            urgency: h.urgency,
            status: 'planted',
            paidOffAtChapter: null,
            payoffNotes: null,
            source: h.source,
            notes: h.rationale ?? null,
          });
          created += 1;
        } catch {
          // 跳过单条失败
        }
      }
      return { created, evidence: res.suggestion.evidence };
    },
    onSuccess: ({ created, evidence }) => {
      qc.invalidateQueries({ queryKey: ['story-engine', 'hooks', bookId] });
      toast.success(`已生成 ${created} 条钩子${evidence ? ` · ${evidence.slice(0, 60)}` : ''}`);
    },
    onError: (error: unknown) => toast.error(formatApiError(error, 'AI 生成失败')),
  });

  const board = columns(hooksQuery.data ?? [], currentChapter);

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-pixel text-pixel-md">钩子池</h2>
        <PixelButton
          size="sm"
          variant="ghost"
          disabled={generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
          title="基于已写章节 + Bible 抽取/建议待埋钩子，直接落库"
        >
          {generateMutation.isPending ? '生成中…' : '✨ AI 一键生成'}
        </PixelButton>
      </header>

      {hooksQuery.isLoading && (
        <div className="border-2 border-outline rounded-md bg-surface p-4 font-ui text-sm text-ink-soft shadow-pixel-1">
          加载钩子…
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        {board.map((column) => (
          <div
            key={column.key}
            className="min-h-[260px] border-2 border-outline rounded-md bg-surface p-3 shadow-pixel-1"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="font-pixel text-pixel-sm">{STATUS_LABEL[column.key]}</span>
              <span className="font-mono text-pixel-sm text-ink-mute">{column.rows.length}</span>
            </div>
            <div className="space-y-2">
              {column.rows.length === 0 && (
                <div className="font-ui text-xs text-ink-mute">暂无</div>
              )}
              {column.rows.map((hook) => (
                <article key={hook.id} className="border-2 border-outline-soft rounded-sm p-2">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-ui text-sm leading-relaxed text-ink">
                        {hook.description}
                      </div>
                      <div className="mt-1 font-ui text-xs text-ink-mute">
                        {TYPE_LABEL[hook.type]} · C{hook.preferredPayoffWindow.earliestChapter}-
                        {hook.preferredPayoffWindow.latestChapter}
                      </div>
                    </div>
                    <span className="font-mono text-pixel-sm text-primary">U{hook.urgency}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-[1fr_40px] items-center gap-2">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={hook.urgency}
                      className="w-full accent-primary"
                      onChange={(event) =>
                        updateMutation.mutate({
                          id: hook.id,
                          input: { urgency: Number(event.target.value) },
                        })
                      }
                    />
                    <span className="font-mono text-pixel-sm text-ink-soft">{hook.urgency}</span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {hook.status !== 'paid_off' && (
                      <PixelButton
                        size="sm"
                        variant="ghost"
                        className="flex-1"
                        onClick={() =>
                          updateMutation.mutate({
                            id: hook.id,
                            input: { status: hook.status === 'planted' ? 'developing' : 'planted' },
                          })
                        }
                      >
                        {hook.status === 'planted' ? '发酵' : '回埋'}
                      </PixelButton>
                    )}
                    {hook.status !== 'paid_off' && (
                      <PixelButton
                        size="sm"
                        variant="ghost"
                        className="flex-1"
                        onClick={() =>
                          updateMutation.mutate({
                            id: hook.id,
                            input: { status: 'paid_off', paidOffAtChapter: currentChapter ?? null },
                          })
                        }
                      >
                        兑现
                      </PixelButton>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
