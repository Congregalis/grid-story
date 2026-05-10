import type { PacingEvaluation } from '@grid-story/schema';
import { useQuery } from '@tanstack/react-query';
import { storyEngineApi } from './api';

interface PacingTimelineProps {
  bookId: string;
  compact?: boolean;
}

const WARNING_COLOR: Record<string, string> = {
  info: 'border-secondary bg-secondary/20 text-ink',
  warning: 'border-warning bg-warning/20 text-ink',
  critical: 'border-danger bg-danger/20 text-danger',
};

function scoreHeight(value: number): string {
  return `${Math.max(8, Math.min(42, value * 4))}px`;
}

function latestWarning(rows: PacingEvaluation[]): PacingEvaluation['warning'] {
  return [...rows].reverse().find((row) => row.warning)?.warning ?? null;
}

export function PacingTimeline({ bookId, compact = false }: PacingTimelineProps) {
  const timelineQuery = useQuery({
    queryKey: ['story-engine', 'pacing-timeline', bookId],
    queryFn: () => storyEngineApi.listPacingTimeline(bookId),
    staleTime: 30_000,
  });

  const rows = timelineQuery.data?.evaluations ?? [];
  const warning = latestWarning(rows);
  if (compact && rows.length === 0) return null;

  return (
    <section className="mb-3 border-2 border-outline rounded-md bg-surface p-3 shadow-pixel-1">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-pixel text-pixel-sm">节奏线</h2>
        {warning && (
          <span
            className={`rounded-sm border px-2 py-0.5 font-ui text-xs ${
              WARNING_COLOR[warning.severity] ?? WARNING_COLOR.info
            }`}
          >
            {warning.message}
          </span>
        )}
      </div>

      {timelineQuery.isLoading ? (
        <div className="font-ui text-xs text-ink-soft">加载节奏…</div>
      ) : rows.length === 0 ? (
        <div className="font-ui text-xs text-ink-soft">暂无节奏记录。</div>
      ) : (
        <div className="flex h-16 items-end gap-2 overflow-x-auto pixel-scrollbar">
          {rows.map((row) => (
            <div key={row.id} className="flex min-w-12 flex-col items-center gap-1">
              <div className="flex h-11 items-end gap-0.5">
                <span
                  title={`冲突 ${row.score.conflictDensity}`}
                  className="w-2 border border-danger bg-danger/50"
                  style={{ height: scoreHeight(row.score.conflictDensity) }}
                />
                <span
                  title={`情绪 ${row.score.emotionalIntensity}`}
                  className="w-2 border border-primary bg-primary-soft"
                  style={{ height: scoreHeight(row.score.emotionalIntensity) }}
                />
                <span
                  title={`信息 ${row.score.informationDensity}`}
                  className="w-2 border border-secondary bg-secondary/40"
                  style={{ height: scoreHeight(row.score.informationDensity) }}
                />
              </div>
              <span className="font-mono text-pixel-sm text-ink-mute">C{row.chapterNumber}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
