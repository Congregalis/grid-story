import { PixelButton } from '@grid-story/pixel-kit';
import type { OffscreenAction, OffscreenTier } from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatApiError } from '../../lib/api';
import { toast } from '../../lib/toast';
import { storyEngineApi } from './api';

interface OffscreenLogViewerProps {
  bookId: string;
  chapterId?: string;
  characterNames?: Record<string, string>;
  /** 仅在 engineMode='simulation' 时显示手动触发 */
  showManualTrigger?: boolean;
}

const TIER_LABEL: Record<OffscreenTier, string> = {
  tier1: 'tier1 · 详细',
  tier2: 'tier2 · 摘要',
  tier3: 'tier3 · 跳过',
};

const TIER_BADGE: Record<OffscreenTier, string> = {
  tier1: 'border-primary bg-primary-soft text-primary',
  tier2: 'border-outline-soft bg-surface text-ink-soft',
  tier3: 'border-outline-soft bg-surface text-ink-mute',
};

function groupByChapter(actions: OffscreenAction[]): Map<string, OffscreenAction[]> {
  const map = new Map<string, OffscreenAction[]>();
  for (const action of actions) {
    const list = map.get(action.chapterId);
    if (list) list.push(action);
    else map.set(action.chapterId, [action]);
  }
  return map;
}

export function OffscreenLogViewer({
  bookId,
  chapterId,
  characterNames,
  showManualTrigger = false,
}: OffscreenLogViewerProps) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['story-engine', 'offscreen-actions', bookId, chapterId ?? null],
    queryFn: () => storyEngineApi.listOffscreenActions(bookId, chapterId),
    staleTime: 30_000,
  });

  const tick = useMutation({
    mutationFn: (force: boolean) => {
      if (!chapterId) throw new Error('需要选中章节');
      return storyEngineApi.runOffscreenTicker(bookId, chapterId, force);
    },
    onSuccess: (response) => {
      if (response.skipped) {
        toast.info(response.reason ?? '已存在幕后行动，未重复触发');
      } else {
        toast.success('已触发 OffscreenTicker');
      }
      qc.invalidateQueries({
        queryKey: ['story-engine', 'offscreen-actions', bookId, chapterId ?? null],
      });
    },
    onError: (error: unknown) => toast.error(formatApiError(error, 'OffscreenTicker 触发失败')),
  });

  const actions = query.data?.actions ?? [];
  const grouped = groupByChapter(actions);

  return (
    <section className="mb-3 border-2 border-outline rounded-md bg-surface p-3 shadow-pixel-1">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-pixel text-pixel-sm">幕后日志</h2>
        <div className="flex items-center gap-2">
          <span className="font-ui text-xs text-ink-mute">{actions.length} 条</span>
          {showManualTrigger && chapterId && (
            <>
              <PixelButton
                size="sm"
                variant="ghost"
                disabled={tick.isPending}
                onClick={() => tick.mutate(false)}
              >
                {tick.isPending ? '运行中…' : '手动触发'}
              </PixelButton>
              <PixelButton
                size="sm"
                variant="ghost"
                disabled={tick.isPending}
                onClick={() => tick.mutate(true)}
                title="忽略已有 offscreen_actions 强制重跑"
              >
                强跑
              </PixelButton>
            </>
          )}
        </div>
      </div>

      {query.isLoading ? (
        <div className="font-ui text-xs text-ink-soft">加载…</div>
      ) : actions.length === 0 ? (
        <div className="font-ui text-xs text-ink-soft">
          尚无幕后行动。章节定稿后 OffscreenTicker 会自动写入。
        </div>
      ) : (
        <div className="space-y-3">
          {[...grouped.entries()].map(([chapter, rows]) => (
            <div key={chapter}>
              <div className="mb-1 font-mono text-pixel-sm text-ink-mute">{chapter}</div>
              <ul className="space-y-1">
                {rows.map((row) => {
                  const name = characterNames?.[row.characterId] ?? row.characterId;
                  return (
                    <li
                      key={row.id}
                      className="border border-outline-soft rounded-sm bg-surface-raised px-2 py-1"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-pixel text-pixel-sm text-ink">{name}</span>
                        <span
                          className={`rounded-sm border px-1 font-ui text-[10px] ${TIER_BADGE[row.tier]}`}
                        >
                          {TIER_LABEL[row.tier]}
                        </span>
                        {row.driveDeltas.length > 0 && (
                          <span className="font-ui text-[10px] text-ink-mute">
                            Δdrive {row.driveDeltas.length}
                          </span>
                        )}
                        {row.hookIds.length > 0 && (
                          <span className="font-ui text-[10px] text-ink-mute">
                            hook {row.hookIds.length}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 font-ui text-sm text-ink-soft">{row.summary}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
