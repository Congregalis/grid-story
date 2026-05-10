import { PixelButton, PixelInput, PixelTextArea } from '@grid-story/pixel-kit';
import type { DecisionProfile, DecisionResponse, DecisionTriggerType } from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { formatApiError } from '../../lib/api';
import { toast } from '../../lib/toast';
import { storyEngineApi } from './api';
import { ARCHETYPE_PRESETS } from './archetype-presets';

const TRIGGERS: { value: DecisionTriggerType; label: string }[] = [
  { value: 'humiliation', label: '羞辱' },
  { value: 'betrayal', label: '背叛' },
  { value: 'opportunity', label: '机会' },
  { value: 'threat', label: '威胁' },
  { value: 'temptation', label: '诱惑' },
  { value: 'request_for_help', label: '求助' },
  { value: 'authority', label: '权威' },
  { value: 'weak_target', label: '弱者' },
  { value: 'unknown_info', label: '未知信息' },
  { value: 'public_eye', label: '公众视线' },
];

interface DecisionProfileEditorProps {
  bookId: string;
  characterId: string;
  characterName: string;
}

type ResponseDraft = DecisionResponse & { localId: string };

function blankResponse(): ResponseDraft {
  return {
    localId: crypto.randomUUID(),
    triggerType: 'threat',
    defaultReaction: '',
    rationale: '',
    intensity: 5,
    exceptions: [],
  };
}

function responseDraft(value: DecisionResponse): ResponseDraft {
  return { ...value, localId: crypto.randomUUID() };
}

function listText(value: string[]): string {
  return value.join('\n');
}

function textList(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function DecisionProfileEditor({
  bookId,
  characterId,
  characterName,
}: DecisionProfileEditorProps) {
  const inputId = useId();
  const qc = useQueryClient();
  const [archetype, setArchetype] = useState('');
  const [hardConstraints, setHardConstraints] = useState('');
  const [blindSpots, setBlindSpots] = useState('');
  const [growthArcHints, setGrowthArcHints] = useState('');
  const [responses, setResponses] = useState<ResponseDraft[]>([blankResponse()]);

  const profilesQuery = useQuery({
    queryKey: ['story-engine', 'decision-profiles', bookId],
    queryFn: () => storyEngineApi.listDecisionProfiles(bookId),
    staleTime: 60_000,
  });

  const profile = useMemo(
    () => profilesQuery.data?.find((item) => item.characterId === characterId) ?? null,
    [characterId, profilesQuery.data],
  );

  useEffect(() => {
    setArchetype(profile?.archetype ?? '');
    setHardConstraints(listText(profile?.hardConstraints ?? []));
    setBlindSpots(listText(profile?.blindSpots ?? []));
    setGrowthArcHints(profile?.growthArcHints ?? '');
    setResponses(
      profile && profile.responses.length > 0
        ? profile.responses.map(responseDraft)
        : [blankResponse()],
    );
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: () =>
      storyEngineApi.upsertDecisionProfile(bookId, characterId, {
        archetype: archetype.trim() || null,
        responses: responses
          .filter((item) => item.defaultReaction.trim() && item.rationale.trim())
          .map(({ localId: _localId, ...item }) => item),
        hardConstraints: textList(hardConstraints),
        blindSpots: textList(blindSpots),
        growthArcHints: growthArcHints.trim() || null,
        notes: profile?.notes ?? null,
      } satisfies Omit<
        DecisionProfile,
        'id' | 'bookId' | 'characterId' | 'createdAt' | 'updatedAt'
      >),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['story-engine', 'decision-profiles', bookId] });
      toast.success('决策画像已保存');
    },
    onError: (error: unknown) => toast.error(formatApiError(error, '决策画像保存失败')),
  });

  const suggestMutation = useMutation({
    mutationFn: () => storyEngineApi.suggestDecisionProfile(bookId, characterId),
    onSuccess: ({ suggestion }) => {
      if (!archetype && suggestion.archetype) setArchetype(suggestion.archetype);
      if (!hardConstraints && suggestion.hardConstraints?.length)
        setHardConstraints(suggestion.hardConstraints.join('\n'));
      if (!blindSpots && suggestion.blindSpots?.length)
        setBlindSpots(suggestion.blindSpots.join('\n'));
      if (!growthArcHints && suggestion.growthArcHints)
        setGrowthArcHints(suggestion.growthArcHints);
      if (suggestion.responses?.length) {
        setResponses((prev) => {
          const trimmed = prev.filter(
            (item) => item.defaultReaction.trim() || item.rationale.trim(),
          );
          const incoming = suggestion.responses.map((item) => ({
            ...blankResponse(),
            triggerType: item.triggerType as DecisionTriggerType,
            defaultReaction: item.defaultReaction,
            rationale: item.rationale,
            intensity: item.intensity,
            exceptions: item.exceptions ?? [],
          }));
          return trimmed.length === 0 ? incoming : [...trimmed, ...incoming];
        });
      }
      toast.success('已合并 AI 建议（仅填充空字段）');
    },
    onError: (error: unknown) => toast.error(formatApiError(error, 'AI 建议失败')),
  });

  const applyArchetype = (presetIndex: number) => {
    const preset = ARCHETYPE_PRESETS[presetIndex];
    if (!preset) return;
    if (!archetype) setArchetype(preset.archetype);
    if (!hardConstraints) setHardConstraints(preset.hardConstraints.join('\n'));
    if (!blindSpots) setBlindSpots(preset.blindSpots.join('\n'));
    if (!growthArcHints && preset.growthArcHints) setGrowthArcHints(preset.growthArcHints);
    setResponses((prev) => {
      const trimmed = prev.filter((item) => item.defaultReaction.trim() || item.rationale.trim());
      const incoming = preset.responses.map((item) => ({ ...item, localId: crypto.randomUUID() }));
      return trimmed.length === 0 ? incoming : [...trimmed, ...incoming];
    });
    toast.success(`已套用模板：${preset.archetype}`);
  };

  const updateResponse = (localId: string, patch: Partial<DecisionResponse>) => {
    setResponses((prev) =>
      prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    );
  };

  if (profilesQuery.isLoading) {
    return (
      <div className="border-2 border-outline-soft rounded-sm p-3 font-ui text-sm text-ink-soft">
        加载决策画像…
      </div>
    );
  }

  return (
    <section className="mt-6 border-t-2 border-outline-soft pt-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-pixel text-pixel-md">决策画像 · {characterName}</h3>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-8 rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value !== '') {
                applyArchetype(Number(event.target.value));
                event.target.value = '';
              }
            }}
            title="套用 archetype 模板（仅填充空字段）"
          >
            <option value="">套用模板…</option>
            {ARCHETYPE_PRESETS.map((preset, idx) => (
              <option key={preset.archetype} value={idx}>
                {preset.archetype}
              </option>
            ))}
          </select>
          <PixelButton
            size="sm"
            variant="ghost"
            disabled={suggestMutation.isPending}
            onClick={() => suggestMutation.mutate()}
            title="基于已写章节抽取建议（仅填充空字段）"
          >
            {suggestMutation.isPending ? '建议中…' : 'AI 建议'}
          </PixelButton>
          <PixelButton
            size="sm"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? '保存中…' : '保存画像'}
          </PixelButton>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <label className="block" htmlFor={`${inputId}-archetype`}>
          <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">原型</span>
          <PixelInput
            id={`${inputId}-archetype`}
            value={archetype}
            onChange={(event) => setArchetype(event.target.value)}
          />
        </label>
        <label className="block" htmlFor={`${inputId}-growth`}>
          <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">成长提示</span>
          <PixelInput
            id={`${inputId}-growth`}
            value={growthArcHints}
            onChange={(event) => setGrowthArcHints(event.target.value)}
          />
        </label>
        <label className="block" htmlFor={`${inputId}-constraints`}>
          <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">硬约束</span>
          <PixelTextArea
            id={`${inputId}-constraints`}
            rows={4}
            value={hardConstraints}
            onChange={(event) => setHardConstraints(event.target.value)}
          />
        </label>
        <label className="block" htmlFor={`${inputId}-blind-spots`}>
          <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">盲点</span>
          <PixelTextArea
            id={`${inputId}-blind-spots`}
            rows={4}
            value={blindSpots}
            onChange={(event) => setBlindSpots(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-pixel text-pixel-sm text-ink-soft">触发反应</span>
          <PixelButton
            size="sm"
            variant="ghost"
            onClick={() => setResponses((prev) => [...prev, blankResponse()])}
          >
            + 反应
          </PixelButton>
        </div>

        {responses.map((response) => (
          <div key={response.localId} className="border-2 border-outline-soft rounded-sm p-3">
            <div className="mb-2 grid grid-cols-[1fr_96px_auto] gap-2">
              <select
                className="h-8 rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
                value={response.triggerType}
                onChange={(event) =>
                  updateResponse(response.localId, {
                    triggerType: event.target.value as DecisionTriggerType,
                  })
                }
              >
                {TRIGGERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <PixelInput
                type="number"
                min={1}
                max={10}
                value={response.intensity}
                onChange={(event) =>
                  updateResponse(response.localId, {
                    intensity: Math.max(1, Math.min(10, Number(event.target.value) || 1)),
                  })
                }
              />
              <PixelButton
                size="sm"
                variant="ghost"
                disabled={responses.length === 1}
                onClick={() =>
                  setResponses((prev) => prev.filter((item) => item.localId !== response.localId))
                }
              >
                删除
              </PixelButton>
            </div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <PixelTextArea
                rows={3}
                value={response.defaultReaction}
                onChange={(event) =>
                  updateResponse(response.localId, { defaultReaction: event.target.value })
                }
                placeholder="默认反应"
              />
              <PixelTextArea
                rows={3}
                value={response.rationale}
                onChange={(event) =>
                  updateResponse(response.localId, { rationale: event.target.value })
                }
                placeholder="理由"
              />
            </div>
            <PixelInput
              className="mt-2"
              value={response.exceptions.join(', ')}
              onChange={(event) =>
                updateResponse(response.localId, {
                  exceptions: event.target.value
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
              placeholder="例外情况，用逗号分隔"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
