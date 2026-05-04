import type { BookStats } from '../pages/Home';

const STATUS_COLORS: Record<string, string> = {
  draft: '#5468ff',
  review: '#f0a000',
  final: '#2da44e',
  published: '#8250df',
};

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  review: '待审',
  final: '已定稿',
  published: '已发布',
};

interface MiniStatsProps {
  stats: BookStats;
}

function fmt(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString('zh-CN');
}

/** Pixel-style donut chart showing chapter status distribution */
function StatusDonut({ stats }: { stats: BookStats }) {
  const segments = [
    { label: 'draft', count: stats.draftCount, pct: stats.chapters > 0 ? (stats.draftCount / stats.chapters) * 100 : 0 },
    { label: 'review', count: stats.reviewCount, pct: stats.chapters > 0 ? (stats.reviewCount / stats.chapters) * 100 : 0 },
    { label: 'final', count: stats.finalCount, pct: stats.chapters > 0 ? (stats.finalCount / stats.chapters) * 100 : 0 },
    { label: 'published', count: stats.publishedCount, pct: stats.chapters > 0 ? (stats.publishedCount / stats.chapters) * 100 : 0 },
  ];

  const r = 32;
  const strokeW = 10;
  const circumference = 2 * Math.PI * r;
  const size = (r + strokeW) * 2;

  let cumulativePct = 0;
  const arcs = segments
    .filter((s) => s.count > 0)
    .map((s) => {
      const dashLen = (s.pct / 100) * circumference;
      const offset = -(cumulativePct / 100) * circumference;
      cumulativePct += s.pct;
      return { ...s, dashLen, offset };
    });

  // If no chapters at all, show an empty ring
  const allZero = segments.every((s) => s.count === 0);

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="shrink-0" viewBox={`0 0 ${size} ${size}`}>
        {allZero ? (
          <circle
            r={r}
            cx={size / 2}
            cy={size / 2}
            fill="none"
            stroke="#d0d7de"
            strokeWidth={strokeW}
          />
        ) : (
          arcs.map((s) => (
            <circle
              key={s.label}
              r={r}
              cx={size / 2}
              cy={size / 2}
              fill="none"
              stroke={STATUS_COLORS[s.label] ?? '#888'}
              strokeWidth={strokeW}
              strokeDasharray={`${Math.max(s.dashLen, 0.5)} ${circumference}`}
              strokeDashoffset={s.offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              className="transition-all duration-300"
            />
          ))
        )}
      </svg>
      <div className="flex flex-col gap-1 font-ui text-xs">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5"
              style={{ backgroundColor: STATUS_COLORS[s.label] ?? '#888' }}
            />
            <span className="text-ink-soft min-w-[3em]">{STATUS_LABEL[s.label]}</span>
            <span className="font-pixel text-pixel-sm tabular-nums">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MiniStats({ stats }: MiniStatsProps) {
  if (stats.chapters === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="font-pixel text-pixel-md mb-3">进度仪表</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total words card */}
        <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4">
          <p className="font-ui text-xs text-ink-mute mb-1">定稿总字数</p>
          <p className="font-pixel text-pixel-lg tabular-nums">{fmt(stats.totalWords)}</p>
          <p className="font-ui text-xs text-ink-mute mt-1">final + published 章节</p>
        </div>

        {/* Chapter status donut */}
        <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4">
          <p className="font-ui text-xs text-ink-mute mb-2">章节状态</p>
          <StatusDonut stats={stats} />
        </div>

        {/* This week card */}
        <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4">
          <p className="font-ui text-xs text-ink-mute mb-1">近期活跃字数</p>
          <p className="font-pixel text-pixel-lg tabular-nums">{fmt(stats.wordsThisWeek)}</p>
          <p className="font-ui text-xs text-ink-mute mt-1">7 天内更新的章节</p>
        </div>
      </div>
    </section>
  );
}
