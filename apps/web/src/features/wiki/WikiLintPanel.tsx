import { PixelButton } from '@grid-story/pixel-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLintReports, runLint } from './api';
import { toast } from '../../lib/toast';
import { formatApiError } from '../../lib/api';

export interface WikiLintPanelProps {
  bookId: string;
  onOpenReport?: (reportPath: string) => void;
}

export function WikiLintPanel({ bookId, onOpenReport }: WikiLintPanelProps) {
  const qc = useQueryClient();
  const reports = useQuery({
    queryKey: ['wiki', 'lint-reports', bookId],
    queryFn: () => fetchLintReports(bookId),
    staleTime: 30_000,
  });

  const lintMutation = useMutation({
    mutationFn: (force: boolean) => runLint(bookId, force),
    onSuccess: (result) => {
      if (result.skipped) {
        toast.info(result.reason ?? 'Lint 已跳过（无新 ingest）');
      } else {
        const total = result.counts.critical + result.counts.warning + result.counts.info;
        toast.success(
          `Lint 完成：${total} 项（C${result.counts.critical} W${result.counts.warning} I${result.counts.info}）`,
        );
      }
      qc.invalidateQueries({ queryKey: ['wiki', 'lint-reports', bookId] });
    },
    onError: (e: unknown) => toast.error(formatApiError(e, 'Lint 执行失败')),
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <PixelButton
          variant="primary"
          size="sm"
          disabled={lintMutation.isPending}
          onClick={() => lintMutation.mutate(false)}
        >
          {lintMutation.isPending ? '运行中…' : '运行 Lint'}
        </PixelButton>
        <PixelButton
          variant="ghost"
          size="sm"
          disabled={lintMutation.isPending}
          onClick={() => lintMutation.mutate(true)}
        >
          强制运行
        </PixelButton>
      </div>

      {reports.isLoading && (
        <div className="font-ui text-sm text-ink-soft">加载报告…</div>
      )}
      {reports.isError && (
        <div className="font-ui text-sm text-danger">加载报告失败</div>
      )}
      {reports.data && reports.data.reports.length === 0 && (
        <div className="font-ui text-sm text-ink-soft">还没有 lint 报告。</div>
      )}
      {reports.data && reports.data.reports.length > 0 && (
        <ul className="space-y-1.5">
          {reports.data.reports.map((report) => (
            <li
              key={report.path}
              className="bg-surface border-2 border-outline-soft rounded-sm px-3 py-2"
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => onOpenReport?.(report.path)}
                  className="font-ui text-sm text-primary hover:text-primary-hover underline truncate"
                >
                  {report.title}
                </button>
                <span className="font-mono text-[10px] text-ink-mute">
                  {report.generatedAt
                    ? new Date(report.generatedAt).toISOString().slice(0, 16).replace('T', ' ')
                    : ''}
                </span>
              </div>
              <div className="font-pixel text-pixel-sm mt-1 flex gap-2">
                <CountBadge tone="danger" label="C" value={report.critical} />
                <CountBadge tone="warning" label="W" value={report.warning} />
                <CountBadge tone="ink-mute" label="I" value={report.info} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CountBadge({
  tone,
  label,
  value,
}: {
  tone: 'danger' | 'warning' | 'ink-mute';
  label: string;
  value: number;
}) {
  const cls =
    tone === 'danger'
      ? 'bg-danger/15 text-danger border-danger/40'
      : tone === 'warning'
        ? 'bg-warning/15 text-warning border-warning/40'
        : 'bg-surface-raised text-ink-mute border-outline-soft';
  return (
    <span className={`px-1.5 py-px border rounded-sm ${cls}`}>
      {label}:{value}
    </span>
  );
}
