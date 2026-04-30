import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PixelButton, PixelList, PixelListItem, PixelScrollArea } from '@grid-story/pixel-kit';
import type { Character } from '@grid-story/schema';
import { useBookId } from '../lib/book';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { CharacterEditor } from '../features/bible/CharacterEditor';
import { RelationshipGraph } from '../features/bible/RelationshipGraph';
import type { CharacterRow } from '../features/bible/types';

const ENTITY_TABS = [
  { key: 'characters', label: '角色', enabled: true },
  { key: 'locations', label: '地点', enabled: false },
  { key: 'organizations', label: '组织', enabled: false },
  { key: 'items', label: '物品', enabled: false },
  { key: 'timeline-events', label: '时间线', enabled: false },
  { key: 'concepts', label: '概念', enabled: false },
] as const;

export default function BibleStudio() {
  const [bookId] = useBookId();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);

  const charsQuery = useQuery({
    queryKey: ['bible', 'characters', bookId],
    queryFn: () => api.get<CharacterRow[]>(`/bible/characters?bookId=${encodeURIComponent(bookId)}`),
  });

  const characters = charsQuery.data ?? [];
  const selectedCharacter = useMemo(
    () => (selectedId && selectedId !== 'new' ? characters.find((c) => c.id === selectedId) ?? null : null),
    [characters, selectedId],
  );

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['bible', 'characters', bookId] });

  const createMutation = useMutation({
    mutationFn: (input: Omit<Character, 'id' | 'createdAt' | 'updatedAt'>) =>
      api.post<CharacterRow>('/bible/characters', input),
    onSuccess: (created) => {
      invalidate();
      setSelectedId(created.id);
      toast.success(`已创建：${created.name}`);
    },
    onError: (e: unknown) => toast.error(`创建失败：${(e as Error)?.message ?? '未知错误'}`),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: CharacterRow) => {
      const { id, createdAt: _ca, updatedAt: _ua, ...rest } = payload;
      void _ca;
      void _ua;
      return api.put<CharacterRow>(`/bible/characters/${id}`, rest);
    },
    onSuccess: (updated) => {
      invalidate();
      toast.success(`已保存：${updated.name}`);
    },
    onError: (e: unknown) => toast.error(`保存失败：${(e as Error)?.message ?? '未知错误'}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/bible/characters/${id}`),
    onSuccess: () => {
      invalidate();
      setSelectedId(null);
      toast.success('已删除');
    },
    onError: (e: unknown) => toast.error(`删除失败：${(e as Error)?.message ?? '未知错误'}`),
  });

  const handleSave = (
    payload: CharacterRow | (Omit<Character, 'id' | 'createdAt' | 'updatedAt'> & { id?: undefined }),
  ) => {
    if ('id' in payload && payload.id) {
      updateMutation.mutate(payload as CharacterRow);
    } else {
      const { id: _omit, ...rest } = payload;
      void _omit;
      createMutation.mutate(rest as Omit<Character, 'id' | 'createdAt' | 'updatedAt'>);
    }
  };

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto">
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="font-pixel text-pixel-lg">Bible Studio</h1>
        <span className="font-ui text-sm text-ink-soft">
          T2.3 · 设定库可视化 CRUD（MVP 仅角色）
        </span>
      </header>

      <nav className="flex gap-2 mb-4">
        {ENTITY_TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            disabled={!t.enabled}
            className={
              'font-pixel text-pixel-sm px-3 py-1 border-2 border-outline rounded-sm ' +
              (t.enabled
                ? 'bg-primary text-on-primary shadow-pixel-1'
                : 'bg-surface text-ink-mute cursor-not-allowed')
            }
            title={t.enabled ? undefined : '后续任务实现（结构同 character）'}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-[280px_1fr] gap-4 items-start">
        <aside className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-3">
          <PixelButton
            className="w-full mb-3"
            onClick={() => setSelectedId('new')}
          >
            + 新建角色
          </PixelButton>
          <PixelScrollArea maxHeight={520}>
            {charsQuery.isLoading && (
              <div className="font-ui text-sm text-ink-soft p-2">加载中…</div>
            )}
            {charsQuery.isError && (
              <div className="font-ui text-sm text-danger p-2">
                加载失败：{String((charsQuery.error as Error)?.message ?? '')}
                <br />
                确认后端 ({"http://localhost:8432"}) 在跑。
              </div>
            )}
            {charsQuery.isSuccess && characters.length === 0 && (
              <div className="font-ui text-sm text-ink-soft p-2">
                book <code className="font-mono">{bookId}</code> 还没有角色。
              </div>
            )}
            {characters.length > 0 && (
              <PixelList>
                {characters.map((c) => (
                  <PixelListItem
                    key={c.id}
                    active={c.id === selectedId}
                    onClick={() => setSelectedId(c.id)}
                    leading={
                      <span
                        className="inline-block w-2 h-2 bg-secondary"
                        aria-hidden
                      />
                    }
                    trailing={
                      <span className="font-pixel text-pixel-sm">
                        {c.relationships.length > 0 ? `${c.relationships.length} 关系` : ''}
                      </span>
                    }
                  >
                    {c.name || '（未命名）'}
                  </PixelListItem>
                ))}
              </PixelList>
            )}
          </PixelScrollArea>
        </aside>

        <main className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-6">
          {selectedId === null ? (
            <div className="font-ui text-sm text-ink-soft text-center py-12">
              在左侧选一个角色，或点击「+ 新建角色」开始。
            </div>
          ) : (
            <CharacterEditor
              bookId={bookId}
              draft={selectedId === 'new' ? null : selectedCharacter}
              allCharacters={characters}
              onSave={handleSave}
              onDelete={(id) => deleteMutation.mutate(id)}
              saving={createMutation.isPending || updateMutation.isPending}
              deleting={deleteMutation.isPending}
            />
          )}
        </main>
      </div>

      <section className="mt-6">
        <RelationshipGraph
          characters={characters}
          selectedId={selectedId !== 'new' ? selectedId : null}
          onSelect={(id) => setSelectedId(id)}
        />
      </section>
    </div>
  );
}
