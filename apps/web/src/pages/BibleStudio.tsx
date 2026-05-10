import { PixelButton, PixelList, PixelListItem, PixelScrollArea } from '@grid-story/pixel-kit';
import type { Book, Character, Item, Location, Organization } from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BibleEntityEditor } from '../features/bible/BibleEntityEditor';
import { BibleGraph } from '../features/bible/BibleGraph';
import {
  type BibleEntityRow,
  type EntityFormValues,
  entityConfigList,
  entityConfigs,
  getEntitySubtitle,
  getEntityTitle,
  isBibleEntityType,
} from '../features/bible/entity-config';
import { RelationshipGraph } from '../features/bible/RelationshipGraph';
import { ChekhovHookBoard } from '../features/story-engine/ChekhovHookBoard';
import { DriveBoard } from '../features/story-engine/DriveBoard';
import { RelationshipMatrix } from '../features/story-engine/RelationshipMatrix';
import { WorldVariablePanel } from '../features/story-engine/WorldVariablePanel';
import { api, formatApiError } from '../lib/api';
import { useBookId } from '../lib/book';
import { toast } from '../lib/toast';

const ENGINE_TAB_HINT: Record<string, string> = {
  drives:
    'Drive = 角色的欲望/目标（短/中/长期）。AI 推演时角色按 Drive 优先级主动选择行为。例：「找到母亲的下落」、「报杀父之仇」。',
  relationships:
    '关系 = 剧情张力的容器。三轴矢量（阶级 / 信息 / 情感）独立演化。例：A→B class=-3 info=+2 emotion=-5 表示 A 比 B 地位低、知道更多、恨意深。',
  world:
    'WorldVariable = 可变环境状态（经济 / 政治 / 季节 / 舆论 ...）。作者拨杆调整后，所有角色 Drives 优先级会自动重排。例：「京都经济=饥荒 3 级」。',
  hooks:
    'ChekhovHook = 待兑现的伏笔/钩子，带 urgency 和 preferredPayoffWindow。SimulationEngine 跑场景时自动挑相关钩子作为剧情燃料；PacingCritic 也会催收即将超期的钩子。',
};

export default function BibleStudio() {
  const [bookId] = useBookId();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const bookQuery = useQuery<Book>({
    queryKey: ['book', bookId],
    queryFn: () => api.get<Book>(`/book/${encodeURIComponent(bookId)}`),
    staleTime: 300_000,
    enabled: Boolean(bookId),
  });
  const isSimulation = bookQuery.data?.engineMode === 'simulation';

  const engineParam = searchParams.get('engine');
  const activeEngineTab =
    isSimulation &&
    (engineParam === 'drives' ||
      engineParam === 'relationships' ||
      engineParam === 'world' ||
      engineParam === 'hooks')
      ? engineParam
      : null;
  const typeParam = searchParams.get('type');
  const activeType = !activeEngineTab && isBibleEntityType(typeParam) ? typeParam : 'character';
  const config = entityConfigs[activeType];
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);

  useEffect(() => {
    if (!activeEngineTab && typeParam !== activeType) {
      setSearchParams({ type: activeType }, { replace: true });
    }
  }, [activeEngineTab, activeType, setSearchParams, typeParam]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 切换实体类型或作品时必须清空旧选中项。
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
    () =>
      selectedId && selectedId !== 'new'
        ? (rows.find((row) => row.id === selectedId) ?? null)
        : null,
    [rows, selectedId],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ['bible', config.path, bookId] });

  const createMutation = useMutation({
    mutationFn: (input: EntityFormValues) =>
      api.post<BibleEntityRow>(`/bible/${config.path}`, input),
    onSuccess: (created) => {
      invalidate();
      setSelectedId(created.id);
      toast.success(`已创建：${getEntityTitle(config, created)}`);
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '创建失败，请稍后重试')),
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
    onError: (e: unknown) => toast.error(formatApiError(e, '保存失败，请稍后重试')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/bible/${config.path}/${id}`),
    onSuccess: () => {
      invalidate();
      setSelectedId(null);
      toast.success('已删除');
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '删除失败，请稍后重试')),
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

  // Graph tab state
  const [graphTab, setGraphTab] = useState<'character' | 'panorama'>('character');

  // Panorama data — shares cache keys with entity editor query
  const graphChars = useQuery({
    queryKey: ['bible', 'characters', bookId],
    queryFn: () => api.get<Character[]>(`/bible/characters?bookId=${encodeURIComponent(bookId)}`),
    staleTime: 120_000,
  });
  const graphLocations = useQuery({
    queryKey: ['bible', 'locations', bookId],
    queryFn: () => api.get<Location[]>(`/bible/locations?bookId=${encodeURIComponent(bookId)}`),
    enabled: graphTab === 'panorama',
    staleTime: 120_000,
  });
  const graphOrgs = useQuery({
    queryKey: ['bible', 'organizations', bookId],
    queryFn: () =>
      api.get<Organization[]>(`/bible/organizations?bookId=${encodeURIComponent(bookId)}`),
    enabled: graphTab === 'panorama',
    staleTime: 120_000,
  });
  const graphItems = useQuery({
    queryKey: ['bible', 'items', bookId],
    queryFn: () => api.get<Item[]>(`/bible/items?bookId=${encodeURIComponent(bookId)}`),
    enabled: graphTab === 'panorama',
    staleTime: 120_000,
  });

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto">
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="font-pixel text-pixel-lg">设定库</h1>
        <span className="font-ui text-sm text-ink-soft">
          {isSimulation
            ? '传统设定 + 故事引擎 ✨ 专属字段（Drive / 关系 / 世界变量 / 钩子）'
            : '角色、地点、组织、物品、时间线和概念'}
        </span>
      </header>

      <nav className="mb-4 space-y-2">
        <div>
          <span className="block mb-1 font-pixel text-[10px] text-ink-mute">传统设定</span>
          <div className="flex flex-wrap gap-2">
            {entityConfigList.map((tab) => {
              const active = !activeEngineTab && tab.type === activeType;
              return (
                <button
                  type="button"
                  key={tab.type}
                  onClick={() => setSearchParams({ type: tab.type })}
                  className={`font-pixel text-pixel-sm px-3 py-1 border-2 border-outline rounded-sm ${
                    active
                      ? 'bg-primary text-on-primary shadow-pixel-1'
                      : 'bg-surface text-ink hover:bg-surface-raised'
                  }`}
                >
                  {tab.pluralLabel}
                </button>
              );
            })}
          </div>
        </div>

        {isSimulation && (
          <div>
            <span className="block mb-1 font-pixel text-[10px] text-primary">
              故事引擎 ✨ <span className="text-ink-mute font-normal">simulation 模式专属</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'drives', label: 'Drive' },
                { key: 'relationships', label: '关系矩阵' },
                { key: 'world', label: '世界变量' },
                { key: 'hooks', label: '钩子池' },
              ].map((tab) => {
                const active = activeEngineTab === tab.key;
                return (
                  <button
                    type="button"
                    key={tab.key}
                    onClick={() => setSearchParams({ engine: tab.key })}
                    className={`font-pixel text-pixel-sm px-3 py-1 border-2 rounded-sm ${
                      active
                        ? 'bg-primary text-on-primary shadow-pixel-1 border-primary'
                        : 'bg-surface text-ink border-outline hover:bg-surface-raised'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {activeEngineTab ? (
        <main className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-6">
          <div className="mb-3 border-l-4 border-primary bg-primary-soft/20 px-3 py-2 font-ui text-xs text-ink-soft">
            {ENGINE_TAB_HINT[activeEngineTab]}
          </div>
          {activeEngineTab === 'drives' && (
            <DriveBoard bookId={bookId} characters={graphChars.data ?? []} />
          )}
          {activeEngineTab === 'relationships' && (
            <RelationshipMatrix bookId={bookId} characters={graphChars.data ?? []} />
          )}
          {activeEngineTab === 'world' && <WorldVariablePanel bookId={bookId} />}
          {activeEngineTab === 'hooks' && <ChekhovHookBoard bookId={bookId} />}
        </main>
      ) : (
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
                <div className="font-ui text-sm text-danger p-2">加载失败，请稍后重试。</div>
              )}
              {entityQuery.isSuccess && rows.length === 0 && (
                <div className="font-ui text-sm text-ink-soft p-2">
                  当前作品还没有{config.label}。
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
                        trailing={<span className="font-pixel text-pixel-sm">{trailing}</span>}
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
      )}

      {/* ── Relationship graph section ── */}
      {!activeEngineTab && (
        <section className="mt-6">
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setGraphTab('character')}
              className={`font-pixel text-pixel-sm px-3 py-1 border-2 border-outline rounded-sm ${
                graphTab === 'character'
                  ? 'bg-primary text-on-primary shadow-pixel-1'
                  : 'bg-surface text-ink hover:bg-surface-raised'
              }`}
            >
              角色关系
            </button>
            <button
              type="button"
              onClick={() => setGraphTab('panorama')}
              className={`font-pixel text-pixel-sm px-3 py-1 border-2 border-outline rounded-sm ${
                graphTab === 'panorama'
                  ? 'bg-primary text-on-primary shadow-pixel-1'
                  : 'bg-surface text-ink hover:bg-surface-raised'
              }`}
            >
              全景
            </button>
          </div>

          {graphTab === 'character' ? (
            <RelationshipGraph
              characters={graphChars.data ?? []}
              selectedId={selectedId !== 'new' ? selectedId : null}
              onSelect={(id) => setSelectedId(id)}
            />
          ) : (
            <BibleGraph
              characters={graphChars.data ?? []}
              locations={graphLocations.data ?? []}
              organizations={graphOrgs.data ?? []}
              items={graphItems.data ?? []}
              selectedId={selectedId !== 'new' ? selectedId : null}
              onSelect={(type, id) => {
                setSearchParams({ type });
                setSelectedId(id);
              }}
            />
          )}
        </section>
      )}
    </div>
  );
}
