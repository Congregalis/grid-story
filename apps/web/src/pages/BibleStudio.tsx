import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PixelButton, PixelList, PixelListItem, PixelScrollArea } from '@grid-story/pixel-kit';
import { useSearchParams } from 'react-router-dom';
import { useBookId } from '../lib/book';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { BibleEntityEditor } from '../features/bible/BibleEntityEditor';
import { RelationshipGraph } from '../features/bible/RelationshipGraph';
import type { CharacterRow } from '../features/bible/types';
import {
  entityConfigList,
  entityConfigs,
  getEntitySubtitle,
  getEntityTitle,
  isBibleEntityType,
  type BibleEntityRow,
  type EntityFormValues,
} from '../features/bible/entity-config';

export default function BibleStudio() {
  const [bookId] = useBookId();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const typeParam = searchParams.get('type');
  const activeType = isBibleEntityType(typeParam) ? typeParam : 'character';
  const config = entityConfigs[activeType];
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);

  useEffect(() => {
    if (typeParam !== activeType) {
      setSearchParams({ type: activeType }, { replace: true });
    }
  }, [activeType, setSearchParams, typeParam]);

  useEffect(() => {
    setSelectedId(null);
  }, [activeType, bookId]);

  const entityQuery = useQuery({
    queryKey: ['bible', config.path, bookId],
    queryFn: () =>
      api.get<BibleEntityRow[]>(`/bible/${config.path}?bookId=${encodeURIComponent(bookId)}`),
  });

  const rows = entityQuery.data ?? [];
  const selectedEntity = useMemo(
    () => (selectedId && selectedId !== 'new' ? rows.find((row) => row.id === selectedId) ?? null : null),
    [rows, selectedId],
  );

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['bible', config.path, bookId] });

  const createMutation = useMutation({
    mutationFn: (input: EntityFormValues) =>
      api.post<BibleEntityRow>(`/bible/${config.path}`, input),
    onSuccess: (created) => {
      invalidate();
      setSelectedId(created.id);
      toast.success(`已创建：${getEntityTitle(config, created)}`);
    },
    onError: (e: unknown) => toast.error(`创建失败：${(e as Error)?.message ?? '未知错误'}`),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: EntityFormValues) => {
      const { id, createdAt: _ca, updatedAt: _ua, ...rest } = payload;
      void _ca;
      void _ua;
      return api.put<BibleEntityRow>(`/bible/${config.path}/${id}`, rest);
    },
    onSuccess: (updated) => {
      invalidate();
      toast.success(`已保存：${getEntityTitle(config, updated)}`);
    },
    onError: (e: unknown) => toast.error(`保存失败：${(e as Error)?.message ?? '未知错误'}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/bible/${config.path}/${id}`),
    onSuccess: () => {
      invalidate();
      setSelectedId(null);
      toast.success('已删除');
    },
    onError: (e: unknown) => toast.error(`删除失败：${(e as Error)?.message ?? '未知错误'}`),
  });

  const handleSave = (payload: EntityFormValues) => {
    if ('id' in payload && payload.id) {
      updateMutation.mutate(payload);
    } else {
      const { id: _omit, ...rest } = payload;
      void _omit;
      createMutation.mutate(rest as EntityFormValues);
    }
  };

  const characters = activeType === 'character' ? (rows as CharacterRow[]) : [];

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto">
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="font-pixel text-pixel-lg">Bible Studio</h1>
        <span className="font-ui text-sm text-ink-soft">
          T2.3 · 设定库可视化 CRUD
        </span>
      </header>

      <nav className="flex gap-2 mb-4">
        {entityConfigList.map((tab) => {
          const active = tab.type === activeType;
          return (
            <button
              type="button"
              key={tab.type}
              onClick={() => setSearchParams({ type: tab.type })}
              className={
                'font-pixel text-pixel-sm px-3 py-1 border-2 border-outline rounded-sm ' +
                (active
                  ? 'bg-primary text-on-primary shadow-pixel-1'
                  : 'bg-surface text-ink hover:bg-surface-raised')
              }
            >
              {tab.pluralLabel}
            </button>
          );
        })}
      </nav>

      <div className="grid grid-cols-[280px_1fr] gap-4 items-start">
        <aside className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-3">
          <PixelButton
            variant="ghost"
            className="w-full mb-3"
            onClick={() => setSelectedId('new')}
          >
            + 新建{config.label}
          </PixelButton>
          <PixelScrollArea maxHeight={520}>
            {entityQuery.isLoading && (
              <div className="font-ui text-sm text-ink-soft p-2">加载中…</div>
            )}
            {entityQuery.isError && (
              <div className="font-ui text-sm text-danger p-2">
                加载失败：{String((entityQuery.error as Error)?.message ?? '')}
                <br />
                确认后端 ({"http://localhost:8432"}) 在跑。
              </div>
            )}
            {entityQuery.isSuccess && rows.length === 0 && (
              <div className="font-ui text-sm text-ink-soft p-2">
                book <code className="font-mono">{bookId}</code> 还没有{config.label}。
              </div>
            )}
            {rows.length > 0 && (
              <PixelList>
                {rows.map((row) => {
                  const subtitle = getEntitySubtitle(config, row);
                  const trailing = config.listTrailing(row);
                  return (
                    <PixelListItem
                      key={row.id}
                      active={row.id === selectedId}
                      onClick={() => setSelectedId(row.id)}
                      leading={
                        <span
                          className={`inline-block w-2 h-2 ${config.tagClassName}`}
                          aria-hidden
                        />
                      }
                      trailing={
                        <span className="font-pixel text-pixel-sm">
                          {trailing}
                        </span>
                      }
                    >
                      <span className="block min-w-0 whitespace-normal">
                        <span className="block truncate">{getEntityTitle(config, row)}</span>
                        {subtitle && (
                          <span className="block truncate text-xs text-ink-soft">{subtitle}</span>
                        )}
                      </span>
                    </PixelListItem>
                  );
                })}
              </PixelList>
            )}
          </PixelScrollArea>
        </aside>

        <main className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-6">
          {selectedId === null ? (
            <div className="font-ui text-sm text-ink-soft text-center py-12">
              在左侧选一个{config.label}，或点击「+ 新建{config.label}」开始。
            </div>
          ) : (
            <BibleEntityEditor
              bookId={bookId}
              config={config}
              draft={selectedId === 'new' ? null : selectedEntity}
              onSave={handleSave}
              onDelete={(id) => deleteMutation.mutate(id)}
              saving={createMutation.isPending || updateMutation.isPending}
              deleting={deleteMutation.isPending}
            />
          )}
        </main>
      </div>

      {activeType === 'character' && (
        <section className="mt-6">
          <RelationshipGraph
            characters={characters}
            selectedId={selectedId !== 'new' ? selectedId : null}
            onSelect={(id) => setSelectedId(id)}
          />
        </section>
      )}
    </div>
  );
}
