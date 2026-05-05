import { PixelInput } from '@grid-story/pixel-kit';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { searchWiki } from './api';

export interface WikiSearchProps {
  bookId: string;
  onSelect: (path: string) => void;
}

export function WikiSearch({ bookId, onSelect }: WikiSearchProps) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setQuery(draft.trim()), 250);
    return () => clearTimeout(id);
  }, [draft]);

  const result = useQuery({
    queryKey: ['wiki', 'search', bookId, query],
    queryFn: () => searchWiki(bookId, query),
    enabled: query.length > 0,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-2">
      <PixelInput
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="搜索 wiki 内容…"
        aria-label="搜索 wiki"
      />
      {query && (
        <div className="font-ui text-xs text-ink-soft">
          {result.isLoading ? (
            <span>搜索中…</span>
          ) : result.isError ? (
            <span className="text-danger">搜索失败</span>
          ) : (
            <span>
              找到 <strong className="text-ink">{result.data?.hits.length ?? 0}</strong> 个结果
            </span>
          )}
        </div>
      )}
      {result.data && result.data.hits.length > 0 && (
        <ul className="space-y-1.5 max-h-[40vh] overflow-y-auto pixel-scrollbar pr-1">
          {result.data.hits.map((hit) => (
            <li key={hit.path}>
              <button
                type="button"
                onClick={() => onSelect(hit.path)}
                className="w-full text-left bg-surface border-2 border-outline-soft hover:border-outline rounded-sm px-2 py-1.5"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-ui text-sm text-ink truncate">{hit.title}</span>
                  {hit.page_type && (
                    <span className="font-pixel text-pixel-sm text-ink-mute">
                      {hit.page_type}
                    </span>
                  )}
                </div>
                <div className="font-mono text-[10px] text-ink-mute truncate">
                  {hit.path}
                </div>
                {hit.matches[0] && (
                  <div className="font-ui text-xs text-ink-soft mt-1 line-clamp-2">
                    L{hit.matches[0].line}: {hit.matches[0].text}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
