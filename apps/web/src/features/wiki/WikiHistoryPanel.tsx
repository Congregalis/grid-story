import { PixelButton } from '@grid-story/pixel-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWikiHistory, rollbackWiki } from './api';
import { toast } from '../../lib/toast';
import { formatApiError } from '../../lib/api';

export interface WikiHistoryPanelProps {
  bookId: string;
}

export function WikiHistoryPanel({ bookId }: WikiHistoryPanelProps) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['wiki', 'history', bookId],
    queryFn: () => fetchWikiHistory(bookId),
    staleTime: 30_000,
  });

  const rollbackMutation = useMutation({
    mutationFn: (runId: string) => rollbackWiki(bookId, runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wiki', 'history', bookId] });
      qc.invalidateQueries({ queryKey: ['wiki', 'pages', bookId] });
      qc.invalidateQueries({ queryKey: ['wiki', 'page', bookId] });
      toast.success('回滚完成');
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '回滚失败')),
  });

  if (query.isLoading) {
    return <div className="font-ui text-sm text-ink-soft">加载中…</div>;
  }
  if (query.isError) {
    return <div className="font-ui text-sm text-danger">加载失败</div>;
  }
  const history = query.data?.history ?? [];

  if (history.length === 0) {
    return <div className="font-ui text-sm text-ink-soft">还没有 ingest 历史。</div>;
  }

  // Show newest first.
  const ordered = [...history].reverse();

  return (
    <ul className="space-y-2">
      {ordered.map((entry) => {
        const date = new Date(entry.ts);
        const dateStr = Number.isNaN(date.getTime())
          ? entry.ts
          : date.toISOString().slice(0, 19).replace('T', ' ');
        const canRollback =
          entry.run_type === 'ingest' && Boolean(entry.backup_dir);
        return (
          <li
            key={entry.run_id}
            className="bg-surface border-2 border-outline-soft rounded-sm px-3 py-2"
          >
            <div className="flex items-baseline gap-2 flex-wrap">
              <RunTypeBadge type={entry.run_type} />
              <span className="font-mono text-[10px] text-ink-mute">{dateStr}</span>
              <span className="font-mono text-xs text-ink-soft truncate">
                {entry.run_id}
              </span>
              {entry.chapter_id && (
                <span className="font-pixel text-pixel-sm text-ink-soft">
                  ch:{entry.chapter_id.slice(0, 6)}
                </span>
              )}
              {entry.rollback_of && (
                <span className="font-pixel text-pixel-sm text-ink-soft">
                  ↺ {entry.rollback_of}
                </span>
              )}
            </div>
            <div className="font-ui text-xs text-ink-soft mt-1">
              <strong className="text-ink">{entry.files_changed.length}</strong> 个文件变更
            </div>
            {canRollback && (
              <div className="mt-2">
                <PixelButton
                  variant="ghost"
                  size="sm"
                  disabled={rollbackMutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `确认回滚到 ${entry.run_id} 提交前的状态？此操作会再追加一条 rollback 历史。`,
                      )
                    ) {
                      rollbackMutation.mutate(entry.run_id);
                    }
                  }}
                >
                  回滚到此版本
                </PixelButton>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RunTypeBadge({ type }: { type: 'ingest' | 'rollback' | 'manual' }) {
  const map = {
    ingest: { label: 'ingest', cls: 'bg-primary-soft text-primary border-primary/40' },
    rollback: { label: 'rollback', cls: 'bg-warning/15 text-warning border-warning/40' },
    manual: {
      label: 'manual',
      cls: 'bg-surface-raised text-ink-mute border-outline-soft',
    },
  } as const;
  const meta = map[type] ?? map.manual;
  return (
    <span
      className={`font-pixel text-pixel-sm px-1.5 py-px border rounded-sm ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}
