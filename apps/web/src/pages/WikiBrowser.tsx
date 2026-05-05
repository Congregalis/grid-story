import { PixelButton, PixelScrollArea } from '@grid-story/pixel-kit';
import { useCallback, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  DivergencesPanel,
  WikiGraph,
  WikiHistoryPanel,
  WikiIndex,
  WikiLintPanel,
  WikiPageView,
  WikiSearch,
} from '../features/wiki';

type RightTab = 'tools' | 'divergences' | 'lint' | 'history' | 'graph';

const RIGHT_TABS: { key: RightTab; label: string }[] = [
  { key: 'tools', label: '工具' },
  { key: 'divergences', label: '分歧' },
  { key: 'lint', label: 'Lint' },
  { key: 'history', label: '历史' },
  { key: 'graph', label: '图谱' },
];

const DEFAULT_PAGE = 'index/_root.md';

export default function WikiBrowser() {
  const { bookId = '' } = useParams<{ bookId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const activePath = searchParams.get('p') ?? DEFAULT_PAGE;
  const rightTab = (searchParams.get('tab') as RightTab | null) ?? 'tools';
  const [filter, setFilter] = useState('');

  const setActivePath = useCallback(
    (path: string) => {
      const next = new URLSearchParams(searchParams);
      next.set('p', path);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const setRightTab = useCallback(
    (tab: RightTab) => {
      const next = new URLSearchParams(searchParams);
      next.set('tab', tab);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleNavigate = useCallback(
    (target: string) => {
      // Wikilink target: e.g. "characters/zhang-san" or "entities/characters/zhang-san"
      const candidates = candidatesForLink(target);
      // We pick the first candidate; backend will redirect/resolve as needed.
      setActivePath(candidates[0]);
    },
    [setActivePath],
  );

  const heading = useMemo(() => prettifyPath(activePath), [activePath]);

  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto">
      <header className="mb-4 flex items-baseline gap-3 flex-wrap">
        <h1 className="font-pixel text-pixel-lg">Wiki</h1>
        <span className="font-ui text-sm text-ink-soft">
          LLM 增量构建的小说知识库 · {heading}
        </span>
        <div className="ml-auto flex gap-2">
          <PixelButton
            variant="ghost"
            size="sm"
            onClick={() => setActivePath(DEFAULT_PAGE)}
          >
            ⌂ 总目录
          </PixelButton>
        </div>
      </header>

      <div className="grid grid-cols-[260px_minmax(0,1fr)_320px] gap-4 items-start">
        {/* Left: index + filter */}
        <aside className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-3 sticky top-4">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="过滤页面…"
            className="w-full mb-3 border-2 border-outline rounded-sm bg-surface-raised px-2 py-1 font-ui text-sm focus:outline-none focus:border-primary"
            aria-label="按名称过滤"
          />
          <PixelScrollArea maxHeight="calc(100vh - 220px)">
            <WikiIndex
              bookId={bookId}
              activePath={activePath}
              onSelect={setActivePath}
              filter={filter}
            />
          </PixelScrollArea>
        </aside>

        {/* Center: page view */}
        <main className="min-w-0">
          <WikiPageView
            bookId={bookId}
            pagePath={activePath}
            onNavigate={handleNavigate}
          />
        </main>

        {/* Right: tabs (search + tools / divergences / lint / history / graph) */}
        <aside className="space-y-3 sticky top-4">
          <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-3">
            <h3 className="font-pixel text-pixel-md mb-2">搜索</h3>
            <WikiSearch bookId={bookId} onSelect={setActivePath} />
          </div>

          <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1">
            <nav className="flex flex-wrap border-b-2 border-outline">
              {RIGHT_TABS.map((tab) => {
                const active = tab.key === rightTab;
                return (
                  <button
                    type="button"
                    key={tab.key}
                    onClick={() => setRightTab(tab.key)}
                    className={`flex-1 min-w-[60px] font-pixel text-pixel-sm px-2 py-2 border-r-2 border-outline last:border-r-0 ${
                      active
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface text-ink hover:bg-surface-raised'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
            <div className="p-3 max-h-[60vh] overflow-y-auto pixel-scrollbar">
              {rightTab === 'tools' && <ToolsTab bookId={bookId} setActivePath={setActivePath} />}
              {rightTab === 'divergences' && (
                <DivergencesPanel bookId={bookId} onOpenPage={setActivePath} />
              )}
              {rightTab === 'lint' && (
                <WikiLintPanel bookId={bookId} onOpenReport={setActivePath} />
              )}
              {rightTab === 'history' && <WikiHistoryPanel bookId={bookId} />}
              {rightTab === 'graph' && (
                <div className="-m-3">
                  <WikiGraph
                    bookId={bookId}
                    selectedPath={activePath}
                    onSelect={setActivePath}
                  />
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ToolsTab({
  bookId,
  setActivePath,
}: {
  bookId: string;
  setActivePath: (path: string) => void;
}) {
  void bookId;
  const shortcuts = [
    { label: '总目录', path: 'index/_root.md' },
    { label: '全书状态', path: 'chapters/global.md' },
    { label: '时间线', path: 'tracking/timeline.md' },
    { label: '伏笔追踪', path: 'tracking/foreshadowing.md' },
    { label: '遗留线索', path: 'tracking/loose-threads.md' },
    { label: '待处理分歧', path: 'tracking/divergences-pending.md' },
    { label: '活动日志', path: 'log.md' },
  ];
  return (
    <div className="space-y-1.5">
      <h4 className="font-pixel text-pixel-sm text-ink-mute uppercase mb-1">快速跳转</h4>
      {shortcuts.map((s) => (
        <button
          type="button"
          key={s.path}
          onClick={() => setActivePath(s.path)}
          className="w-full text-left bg-surface-raised border-2 border-outline-soft hover:border-outline rounded-sm px-2 py-1 font-ui text-sm text-ink"
        >
          {s.label}
          <span className="ml-2 font-mono text-[10px] text-ink-mute">{s.path}</span>
        </button>
      ))}
    </div>
  );
}

function candidatesForLink(target: string): string[] {
  const clean = target.replace(/^\/+/, '').replace(/\.md$/, '');
  const candidates: string[] = [];
  candidates.push(`${clean}.md`);
  if (clean.startsWith('characters/')) candidates.push(`entities/${clean}.md`);
  if (clean.startsWith('locations/')) candidates.push(`entities/${clean}.md`);
  if (clean.startsWith('organizations/')) candidates.push(`entities/${clean}.md`);
  if (clean.startsWith('items/')) candidates.push(`entities/${clean}.md`);
  if (!clean.includes('/')) {
    candidates.push(
      `entities/characters/${clean}.md`,
      `entities/locations/${clean}.md`,
      `entities/organizations/${clean}.md`,
      `entities/items/${clean}.md`,
      `concepts/${clean}.md`,
    );
  }
  return candidates;
}

function prettifyPath(path: string): string {
  if (!path) return '';
  return path.replace(/\.md$/, '');
}
