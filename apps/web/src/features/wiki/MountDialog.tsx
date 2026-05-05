import { PixelButton, PixelDialog, PixelInput, PixelList, PixelListItem, PixelScrollArea } from '@grid-story/pixel-kit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { createAndMountWikiPage, fetchBibleCandidates, mountWikiPage } from './api';
import type { BibleCandidate } from './api';

// ── entity type labels ─────────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = {
  characters: '角色',
  locations: '地点',
  organizations: '组织',
  items: '物品',
  concepts: '概念',
};

// ── page_type → entity type ────────────────────────────────────────────

const PAGE_TYPE_ENTITY: Record<string, string> = {
  character: 'characters',
  location: 'locations',
  organization: 'organizations',
  item: 'items',
  concept: 'concepts',
};

export interface MountDialogProps {
  open: boolean;
  onClose: () => void;
  bookId: string;
  pagePath: string;
  pageType: string;
}

export function MountDialog({ open, onClose, bookId, pagePath, pageType }: MountDialogProps) {
  const entityType = PAGE_TYPE_ENTITY[pageType] ?? 'characters';
  const entityLabel = ENTITY_LABELS[entityType] ?? entityType;
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'existing' | 'create'>('existing');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const candidatesQuery = useQuery({
    queryKey: ['wiki', 'mount-candidates', bookId, pagePath],
    queryFn: () => fetchBibleCandidates(bookId, pagePath),
    enabled: open && tab === 'existing',
    staleTime: 10_000,
  });

  const mountMut = useMutation({
    mutationFn: () => mountWikiPage(bookId, pagePath, entityType, selectedId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wiki', 'page', bookId, pagePath] });
      queryClient.invalidateQueries({ queryKey: ['wiki', 'mount-candidates'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const createMut = useMutation({
    mutationFn: () => createAndMountWikiPage(bookId, pagePath, entityType, newName.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wiki', 'page', bookId, pagePath] });
      queryClient.invalidateQueries({ queryKey: ['wiki', 'mount-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['bible'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const candidates: BibleCandidate[] = candidatesQuery.data?.candidates ?? [];
  const filtered = search
    ? candidates.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : candidates;

  const available = filtered.filter((c) => !c.alreadyMounted);
  const alreadyMounted = filtered.filter((c) => c.alreadyMounted);

  return (
    <PixelDialog
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="font-pixel text-pixel-md">挂载 Wiki 页到 Bible</span>
          <span className="font-pixel text-pixel-sm bg-primary-soft text-primary border border-primary/40 rounded-sm px-1.5 py-px">
            {entityLabel}
          </span>
        </div>
      }
      footer={
        <div className="flex gap-2 justify-end">
          <PixelButton variant="ghost" size="sm" onClick={onClose}>
            取消
          </PixelButton>
          {tab === 'existing' && (
            <PixelButton
              variant="primary"
              size="sm"
              disabled={!selectedId || mountMut.isPending}
              onClick={() => mountMut.mutate()}
            >
              {mountMut.isPending ? '挂载中…' : '挂载'}
            </PixelButton>
          )}
          {tab === 'create' && (
            <PixelButton
              variant="primary"
              size="sm"
              disabled={!newName.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? '创建中…' : '创建并挂载'}
            </PixelButton>
          )}
        </div>
      }
    >
      <div className="space-y-3 min-h-[240px]">
        {/* tab bar */}
        <div className="flex border-b-2 border-outline">
          <button
            type="button"
            onClick={() => { setTab('existing'); setError(null); }}
            className={`flex-1 font-pixel text-pixel-sm py-2 ${
              tab === 'existing'
                ? 'bg-primary text-on-primary'
                : 'bg-surface text-ink hover:bg-surface-raised'
            }`}
          >
            挂载已有
          </button>
          <button
            type="button"
            onClick={() => { setTab('create'); setError(null); }}
            className={`flex-1 font-pixel text-pixel-sm py-2 ${
              tab === 'create'
                ? 'bg-primary text-on-primary'
                : 'bg-surface text-ink hover:bg-surface-raised'
            }`}
          >
            创建并挂载
          </button>
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger text-danger font-ui text-sm px-3 py-2 rounded-sm">
            {error}
          </div>
        )}

        {tab === 'existing' && (
          <div className="space-y-2">
            <PixelInput
              type="search"
              value={search}
              onChange={(e) => setSearch((e.target as HTMLInputElement).value)}
              placeholder={`搜索已有${entityLabel}…`}
              className="w-full"
            />
            {candidatesQuery.isLoading && (
              <div className="font-ui text-sm text-ink-soft py-4 text-center">加载中…</div>
            )}
            {!candidatesQuery.isLoading && available.length === 0 && (
              <div className="font-ui text-sm text-ink-soft py-4 text-center">
                没有可挂载的{entityLabel}
              </div>
            )}
            {available.length > 0 && (
              <PixelScrollArea maxHeight={300}>
                <PixelList>
                  {available.map((c) => (
                    <PixelListItem
                      key={c.id}
                      active={selectedId === c.id}
                      onClick={() => setSelectedId(c.id)}
                    >
                      {c.name}
                    </PixelListItem>
                  ))}
                </PixelList>
              </PixelScrollArea>
            )}
            {alreadyMounted.length > 0 && (
              <details className="mt-2">
                <summary className="font-pixel text-pixel-sm text-ink-mute cursor-pointer">
                  已挂载 ({alreadyMounted.length})
                </summary>
                <div className="mt-1 space-y-0.5">
                  {alreadyMounted.map((c) => (
                    <div key={c.id} className="font-ui text-xs text-ink-mute px-2 py-1 bg-surface-raised rounded-sm flex justify-between">
                      <span>{c.name}</span>
                      <span className="font-mono text-[10px]">{c.mountedPagePath}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {tab === 'create' && (
          <div className="space-y-3">
            <p className="font-ui text-sm text-ink-soft">
              从当前 Wiki 观察创建新的 Bible {entityLabel}，创建后自动挂载。
            </p>
            <PixelInput
              type="text"
              value={newName}
              onChange={(e) => setNewName((e.target as HTMLInputElement).value)}
              placeholder={`新${entityLabel}名称`}
              className="w-full"
              autoFocus
            />
          </div>
        )}
      </div>
    </PixelDialog>
  );
}
