import { PixelButton, PixelInput } from '@grid-story/pixel-kit';
import type {
  Character,
  Relationship,
  TensionAxis,
  TensionVector,
  UpdateRelationshipInput,
} from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { formatApiError } from '../../lib/api';
import { toast } from '../../lib/toast';
import { storyEngineApi } from './api';

const AXES: { key: TensionAxis; label: string }[] = [
  { key: 'class', label: '阶层' },
  { key: 'info', label: '信息' },
  { key: 'emotion', label: '情感' },
];

interface RelationshipMatrixProps {
  bookId: string;
  characters: Character[];
}

function blankTension(): TensionVector {
  return { class: 0, info: 0, emotion: 0 };
}

export function RelationshipMatrix({ bookId, characters }: RelationshipMatrixProps) {
  const qc = useQueryClient();
  const [fromCharacterId, setFromCharacterId] = useState('');
  const [toCharacterId, setToCharacterId] = useState('');
  const [relationLabel, setRelationLabel] = useState('');
  const [currentTension, setCurrentTension] = useState<TensionVector>(() => blankTension());

  const relationshipsQuery = useQuery({
    queryKey: ['story-engine', 'relationships', bookId],
    queryFn: () => storyEngineApi.listRelationships(bookId),
    staleTime: 30_000,
  });

  const characterName = useMemo(() => {
    const map = new Map(characters.map((character) => [character.id, character.name]));
    return (id: string) => map.get(id) ?? id;
  }, [characters]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['story-engine', 'relationships', bookId] });

  const createMutation = useMutation({
    mutationFn: () =>
      storyEngineApi.createRelationship(bookId, {
        fromCharacterId,
        toCharacterId,
        relationLabel: relationLabel.trim(),
        currentTension,
        targetTrajectory: null,
        history: [],
        isPublicKnowledge: false,
        notes: null,
      }),
    onSuccess: () => {
      invalidate();
      setRelationLabel('');
      setCurrentTension(blankTension());
      toast.success('关系已创建');
    },
    onError: (error: unknown) => toast.error(formatApiError(error, '关系创建失败')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRelationshipInput }) =>
      storyEngineApi.updateRelationship(bookId, id, input),
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(formatApiError(error, '关系更新失败')),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await storyEngineApi.suggestRelationships(bookId);
      const rels = res.suggestion.relationships ?? [];
      let created = 0;
      for (const r of rels) {
        try {
          await storyEngineApi.createRelationship(bookId, {
            fromCharacterId: r.fromCharacterId,
            toCharacterId: r.toCharacterId,
            relationLabel: r.relationLabel,
            currentTension: r.currentTension,
            targetTrajectory: null,
            history: [],
            isPublicKnowledge: r.isPublicKnowledge ?? false,
            notes: r.rationale ?? null,
          });
          created += 1;
        } catch {
          // 跳过单条失败
        }
      }
      return { created, evidence: res.suggestion.evidence };
    },
    onSuccess: ({ created, evidence }) => {
      invalidate();
      toast.success(`已生成 ${created} 对关系${evidence ? ` · ${evidence.slice(0, 60)}` : ''}`);
    },
    onError: (error: unknown) => toast.error(formatApiError(error, 'AI 生成失败')),
  });

  const updateAxis = (relationship: Relationship, axis: TensionAxis, value: number) => {
    updateMutation.mutate({
      id: relationship.id,
      input: {
        currentTension: {
          ...relationship.currentTension,
          [axis]: value,
        },
      },
    });
  };

  const canCreate =
    Boolean(fromCharacterId && toCharacterId && fromCharacterId !== toCharacterId) &&
    Boolean(relationLabel.trim()) &&
    !createMutation.isPending;

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-pixel text-pixel-md">关系矩阵</h2>
        <PixelButton
          size="sm"
          variant="ghost"
          disabled={generateMutation.isPending || characters.length < 2}
          onClick={() => generateMutation.mutate()}
          title="基于全角色 + 章纲生成关系草案，直接落库"
        >
          {generateMutation.isPending ? '生成中…' : '✨ AI 一键生成'}
        </PixelButton>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr]">
        <div className="border-2 border-outline rounded-md bg-surface p-3 shadow-pixel-1">
          <div className="mb-2 font-pixel text-pixel-sm text-ink-soft">新关系</div>
          <div className="space-y-2">
            <select
              className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
              value={fromCharacterId}
              onChange={(event) => setFromCharacterId(event.target.value)}
            >
              <option value="">起点角色</option>
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
            <select
              className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
              value={toCharacterId}
              onChange={(event) => setToCharacterId(event.target.value)}
            >
              <option value="">终点角色</option>
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
            <PixelInput
              value={relationLabel}
              onChange={(event) => setRelationLabel(event.target.value)}
              placeholder="关系标签"
            />
            {AXES.map((axis) => (
              <label key={axis.key} className="block">
                <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">
                  {axis.label} {currentTension[axis.key]}
                </span>
                <input
                  type="range"
                  min={-10}
                  max={10}
                  value={currentTension[axis.key]}
                  className="w-full accent-primary"
                  onChange={(event) =>
                    setCurrentTension((prev) => ({
                      ...prev,
                      [axis.key]: Number(event.target.value),
                    }))
                  }
                />
              </label>
            ))}
            <PixelButton
              className="w-full"
              disabled={!canCreate}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? '创建中…' : '创建关系'}
            </PixelButton>
          </div>
        </div>

        <div className="border-2 border-outline rounded-md bg-surface shadow-pixel-1 overflow-hidden">
          <div className="grid grid-cols-[180px_1fr] border-b-2 border-outline-soft bg-surface-raised px-3 py-2 font-pixel text-pixel-sm text-ink-soft">
            <span>关系</span>
            <span>三轴张力</span>
          </div>
          {relationshipsQuery.isLoading && (
            <div className="p-4 font-ui text-sm text-ink-soft">加载关系…</div>
          )}
          {relationshipsQuery.data?.length === 0 && (
            <div className="p-4 font-ui text-sm text-ink-soft">暂无 StoryEngine 关系。</div>
          )}
          {relationshipsQuery.data?.map((relationship) => (
            <div
              key={relationship.id}
              className="grid grid-cols-1 gap-3 border-b border-outline-soft px-3 py-3 last:border-b-0 md:grid-cols-[180px_1fr]"
            >
              <div className="min-w-0">
                <div className="font-ui text-sm text-ink">
                  {characterName(relationship.fromCharacterId)} →{' '}
                  {characterName(relationship.toCharacterId)}
                </div>
                <div className="mt-1 font-ui text-xs text-ink-mute">
                  {relationship.relationLabel}
                </div>
              </div>
              <div className="space-y-2">
                {AXES.map((axis) => (
                  <label
                    key={axis.key}
                    className="grid grid-cols-[48px_1fr_36px] items-center gap-2"
                  >
                    <span className="font-pixel text-pixel-sm text-ink-soft">{axis.label}</span>
                    <input
                      type="range"
                      min={-10}
                      max={10}
                      value={relationship.currentTension[axis.key]}
                      className="w-full accent-primary"
                      onChange={(event) =>
                        updateAxis(relationship, axis.key, Number(event.target.value))
                      }
                    />
                    <span className="font-mono text-pixel-sm text-ink-soft">
                      {relationship.currentTension[axis.key]}
                    </span>
                  </label>
                ))}
                {relationship.history.length > 0 && (
                  <div className="flex h-6 items-end gap-1 border-t border-outline-soft pt-1">
                    {relationship.history.slice(-12).map((point) => (
                      <span
                        key={`${point.chapter}-${point.trigger}-${point.vector.class}-${point.vector.info}-${point.vector.emotion}`}
                        title={`第${point.chapter}章 · ${point.trigger}`}
                        className="w-3 bg-primary-soft border border-primary"
                        style={{
                          height: `${Math.max(
                            4,
                            Math.abs(
                              point.vector.class + point.vector.info + point.vector.emotion,
                            ) * 1.5,
                          )}px`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
