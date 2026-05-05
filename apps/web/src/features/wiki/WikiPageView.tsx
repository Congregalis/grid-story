import { useQuery } from '@tanstack/react-query';
import { fetchWikiPage } from './api';
import { WikiMarkdown } from './markdown';

export interface WikiPageViewProps {
  bookId: string;
  pagePath: string;
  onNavigate: (target: string) => void;
}

export function WikiPageView({ bookId, pagePath, onNavigate }: WikiPageViewProps) {
  const query = useQuery({
    queryKey: ['wiki', 'page', bookId, pagePath],
    queryFn: () => fetchWikiPage(bookId, pagePath),
    staleTime: 30_000,
  });

  if (query.isLoading) {
    return <div className="font-ui text-sm text-ink-soft p-6">加载中…</div>;
  }
  if (query.isError) {
    return (
      <div className="font-ui text-sm text-danger p-6">
        无法加载页面：{pagePath}
      </div>
    );
  }
  if (!query.data) return null;

  const fm = query.data.frontmatter;
  const title = (fm.title as string | undefined) ?? pagePath;
  const pageType = (fm.page_type as string | undefined) ?? '';

  return (
    <article className="bg-surface-raised border-2 border-outline rounded-md shadow-pixel-1">
      <header className="px-6 pt-5 pb-3 border-b-2 border-outline-soft">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="font-prose font-semibold text-2xl text-ink">{title}</h1>
          {pageType && (
            <span className="font-pixel text-pixel-sm bg-primary-soft text-primary border border-primary/40 rounded-sm px-1.5 py-px">
              {pageType}
            </span>
          )}
          <span className="font-mono text-xs text-ink-mute ml-auto">{query.data.path}</span>
        </div>
        <FrontmatterBar fm={fm} />
      </header>
      <div className="px-6 py-5">
        <WikiMarkdown
          content={query.data.content}
          bookId={bookId}
          onNavigate={onNavigate}
        />
      </div>
    </article>
  );
}

function FrontmatterBar({ fm }: { fm: Record<string, unknown> }) {
  const entries: Array<[string, string]> = [];
  if (typeof fm.slug === 'string') entries.push(['slug', fm.slug]);
  if (typeof fm.bible_entity_id === 'string')
    entries.push(['bible', fm.bible_entity_id.slice(0, 8)]);
  if (typeof fm.first_appearance === 'number')
    entries.push(['首次出场', `ch-${fm.first_appearance}`]);
  if (typeof fm.last_appearance === 'number')
    entries.push(['最近出场', `ch-${fm.last_appearance}`]);
  if (typeof fm.last_ingest_chapter === 'number')
    entries.push(['更新于', `ch-${fm.last_ingest_chapter}`]);
  if (typeof fm.status === 'string') entries.push(['状态', fm.status]);
  if (typeof fm.chapter_number === 'number')
    entries.push(['章号', `ch-${fm.chapter_number}`]);
  if (typeof fm.word_count === 'number') entries.push(['字数', `${fm.word_count}`]);
  if (typeof fm.updated_at === 'string') {
    const date = new Date(fm.updated_at);
    if (!Number.isNaN(date.getTime())) {
      entries.push(['updated', date.toISOString().slice(0, 10)]);
    }
  }
  if (entries.length === 0) return null;

  return (
    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-ui text-xs text-ink-soft">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center gap-1">
          <dt className="font-pixel text-pixel-sm text-ink-mute uppercase">{key}</dt>
          <dd className="text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
