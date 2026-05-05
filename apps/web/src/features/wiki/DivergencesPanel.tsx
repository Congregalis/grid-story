import type { WikiDivergence } from '@grid-story/schema';
import { PixelButton } from '@grid-story/pixel-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchDivergences, resolveDivergence } from './api';
import { toast } from '../../lib/toast';
import { formatApiError } from '../../lib/api';

export interface DivergencesPanelProps {
  bookId: string;
  onOpenPage?: (path: string) => void;
}

const DECISIONS: { key: string; label: string; tone: 'primary' | 'ghost' | 'danger' }[] = [
  { key: 'accept-new', label: '采纳新观察', tone: 'primary' },
  { key: 'keep-bible', label: '保留 Bible', tone: 'ghost' },
  { key: 'patch-prose', label: '需在正文修补', tone: 'danger' },
];

export function DivergencesPanel({ bookId, onOpenPage }: DivergencesPanelProps) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['wiki', 'divergences', bookId],
    queryFn: () => fetchDivergences(bookId),
    staleTime: 15_000,
  });

  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (input: { id: string; decision: string; note?: string }) =>
      resolveDivergence(bookId, input.id, input.decision, input.note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wiki', 'divergences', bookId] });
      toast.success('分歧已处理');
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '处理失败')),
  });

  if (query.isLoading) {
    return <div className="font-ui text-sm text-ink-soft">加载中…</div>;
  }
  if (query.isError) {
    return <div className="font-ui text-sm text-danger">加载失败</div>;
  }
  const divergences = query.data?.divergences ?? [];

  if (divergences.length === 0) {
    return (
      <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-6 text-center">
        <div className="font-pixel text-pixel-md text-ink-soft">没有待处理分歧</div>
        <p className="font-ui text-xs text-ink-mute mt-1">
          Ingest 时检测到的 Bible / Wiki 矛盾会出现在这里
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {divergences.map((d, idx) => {
        const id = d.id ?? `${d.page_path}-${idx}`;
        const note = noteDrafts[id] ?? '';
        return (
          <li
            key={id}
            className="bg-surface-raised border-2 border-outline rounded-md shadow-pixel-1 p-4"
          >
            <header className="flex items-start gap-2 mb-2">
              <DivergenceKindBadge kind={d.kind} />
              {onOpenPage ? (
                <button
                  type="button"
                  onClick={() => onOpenPage(d.page_path)}
                  className="font-mono text-xs text-primary hover:text-primary-hover underline truncate"
                >
                  {d.page_path}
                </button>
              ) : (
                <span className="font-mono text-xs text-ink-soft truncate">{d.page_path}</span>
              )}
            </header>

            <DivergenceBody d={d} />

            <div className="mt-3">
              <label
                htmlFor={`note-${id}`}
                className="font-pixel text-pixel-sm text-ink-mute mb-1 block"
              >
                决策备注（可选）
              </label>
              <textarea
                id={`note-${id}`}
                value={note}
                onChange={(e) =>
                  setNoteDrafts((prev) => ({ ...prev, [id]: e.target.value }))
                }
                rows={2}
                className="w-full border-2 border-outline rounded-sm bg-surface px-2 py-1 font-ui text-sm text-ink resize-none focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {DECISIONS.map((decision) => (
                <PixelButton
                  key={decision.key}
                  variant={decision.tone}
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({
                      id,
                      decision: decision.key,
                      note: note.trim() || undefined,
                    })
                  }
                >
                  {decision.label}
                </PixelButton>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DivergenceKindBadge({ kind }: { kind: WikiDivergence['kind'] }) {
  const map: Record<WikiDivergence['kind'], { label: string; cls: string }> = {
    bible_conflict: { label: 'Bible 冲突', cls: 'bg-danger/15 text-danger border-danger/40' },
    wiki_conflict: { label: 'Wiki 冲突', cls: 'bg-warning/15 text-warning border-warning/40' },
    new_observation: {
      label: '新观察',
      cls: 'bg-primary-soft text-primary border-primary/40',
    },
  };
  const meta = map[kind];
  return (
    <span
      className={`font-pixel text-pixel-sm px-1.5 py-px border rounded-sm ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

function DivergenceBody({ d }: { d: WikiDivergence }) {
  return (
    <div className="space-y-1.5 font-ui text-sm">
      {d.bible_value && (
        <div>
          <span className="font-pixel text-pixel-sm text-primary mr-1">Bible:</span>
          <span className="text-ink">{d.bible_value}</span>
        </div>
      )}
      {d.old_observation && (
        <div>
          <span className="font-pixel text-pixel-sm text-ink-mute mr-1">旧观察:</span>
          <span className="text-ink-soft">{d.old_observation}</span>
        </div>
      )}
      <div>
        <span className="font-pixel text-pixel-sm text-secondary mr-1">新观察:</span>
        <span className="text-ink">{d.new_observation}</span>
      </div>
      {d.evidence && (
        <div className="text-ink-soft text-xs italic">证据：{d.evidence}</div>
      )}
      {d.suggestion && (
        <div className="text-ink-soft text-xs">建议：{d.suggestion}</div>
      )}
    </div>
  );
}
