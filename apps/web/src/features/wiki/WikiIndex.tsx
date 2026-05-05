import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchWikiPages } from './api';
import { WIKI_CATEGORIES, type WikiPageMeta } from './types';

export interface WikiIndexProps {
  bookId: string;
  activePath: string | null;
  onSelect: (path: string) => void;
  filter: string;
}

interface CategoryGroup {
  key: string;
  label: string;
  pages: WikiPageMeta[];
}

const TRACKING_PATHS = [
  'tracking/timeline.md',
  'tracking/foreshadowing.md',
  'tracking/loose-threads.md',
  'tracking/divergences-pending.md',
  'tracking/redirects.md',
];

export function WikiIndex({ bookId, activePath, onSelect, filter }: WikiIndexProps) {
  const query = useQuery({
    queryKey: ['wiki', 'pages', bookId],
    queryFn: () => fetchWikiPages(bookId),
    staleTime: 30_000,
  });

  const groups = useMemo<CategoryGroup[]>(() => {
    const all = query.data?.pages ?? [];
    const visible = filterPages(all, filter);

    const result: CategoryGroup[] = WIKI_CATEGORIES.map((cat) => {
      const dirPrefix = `${cat.dir}/`;
      const pages = visible
        .filter(
          (page) =>
            page.path.startsWith(dirPrefix) &&
            !page.path.startsWith('.staging/') &&
            !page.path.startsWith('.bak/'),
        )
        .sort(sortByTitleOrPath);
      return { key: cat.key, label: cat.label, pages };
    });

    const tracking = visible
      .filter((page) => TRACKING_PATHS.includes(page.path))
      .sort(sortByTitleOrPath);
    if (tracking.length > 0) {
      result.push({ key: 'tracking', label: '追踪', pages: tracking });
    }

    return result.filter((g) => g.pages.length > 0);
  }, [query.data, filter]);

  if (query.isLoading) {
    return <div className="font-ui text-sm text-ink-soft p-3">加载中…</div>;
  }
  if (query.isError) {
    return <div className="font-ui text-sm text-danger p-3">加载失败</div>;
  }
  if (groups.length === 0) {
    return (
      <div className="font-ui text-sm text-ink-soft p-3">
        {filter ? '没有匹配的页面。' : '还没有任何 wiki 页面。'}
      </div>
    );
  }

  return (
    <nav className="space-y-3">
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="font-pixel text-pixel-sm text-ink-mute uppercase tracking-wider mb-1.5 px-2">
            {group.label}
            <span className="ml-1 text-ink-mute/70">({group.pages.length})</span>
          </h3>
          <ul className="space-y-0.5">
            {group.pages.map((page) => {
              const active = page.path === activePath;
              return (
                <li key={page.path}>
                  <button
                    type="button"
                    onClick={() => onSelect(page.path)}
                    className={`w-full text-left px-2 py-1 rounded-sm border-2 transition-colors ${
                      active
                        ? 'bg-primary text-on-primary border-outline shadow-pixel-1'
                        : 'border-transparent hover:bg-surface-raised text-ink'
                    }`}
                  >
                    <span className="font-ui text-sm block truncate">
                      {page.title ?? page.path.split('/').pop()}
                    </span>
                    <span
                      className={`font-mono text-[10px] block truncate ${
                        active ? 'text-on-primary/80' : 'text-ink-mute'
                      }`}
                    >
                      {page.path}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function filterPages(pages: WikiPageMeta[], filter: string): WikiPageMeta[] {
  if (!filter) return pages;
  const needle = filter.toLowerCase();
  return pages.filter(
    (page) =>
      (page.title ?? '').toLowerCase().includes(needle) ||
      page.path.toLowerCase().includes(needle) ||
      (page.slug ?? '').toLowerCase().includes(needle),
  );
}

function sortByTitleOrPath(a: WikiPageMeta, b: WikiPageMeta): number {
  // Chapter pages: sort by chapter_number ascending if both have it.
  if (a.chapter_number != null && b.chapter_number != null) {
    return a.chapter_number - b.chapter_number;
  }
  return (a.title ?? a.path).localeCompare(b.title ?? b.path, 'zh-Hans');
}
