import { PixelButton, PixelInput, PixelTextArea } from '@grid-story/pixel-kit';
import type { WorldVariable, WorldVariableType } from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { formatApiError } from '../../lib/api';
import { toast } from '../../lib/toast';
import { storyEngineApi } from './api';

const TYPE_LABEL: Record<WorldVariableType, string> = {
  economy: '经济',
  politics: '政治',
  season: '季节',
  public_opinion: '舆论',
  natural: '自然',
  tech_level: '技术',
  custom: '自定义',
};

interface WorldVariablePanelProps {
  bookId: string;
}

interface VariableDraft {
  name: string;
  type: WorldVariableType;
  currentValue: string;
  scale: string;
  affects: string;
}

function parseScale(text: string): WorldVariable['scale'] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, severityText] = line.split(':');
      return {
        label: label.trim(),
        severity: Number(severityText) || 0,
      };
    })
    .filter((point) => point.label);
}

function parseCsv(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function WorldVariablePanel({ bookId }: WorldVariablePanelProps) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<VariableDraft>({
    name: '',
    type: 'public_opinion',
    currentValue: '',
    scale: '',
    affects: '',
  });

  const variablesQuery = useQuery({
    queryKey: ['story-engine', 'world-variables', bookId],
    queryFn: () => storyEngineApi.listWorldVariables(bookId),
    staleTime: 30_000,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['story-engine', 'world-variables', bookId] });

  const createMutation = useMutation({
    mutationFn: () =>
      storyEngineApi.createWorldVariable(bookId, {
        name: draft.name.trim(),
        type: draft.type,
        scope: { type: 'global', locationId: null },
        currentValue: draft.currentValue.trim(),
        scale: parseScale(draft.scale),
        affects: parseCsv(draft.affects),
        history: [],
        notes: null,
      }),
    onSuccess: () => {
      invalidate();
      setDraft({ name: '', type: 'public_opinion', currentValue: '', scale: '', affects: '' });
      toast.success('世界变量已创建');
    },
    onError: (error: unknown) => toast.error(formatApiError(error, '世界变量创建失败')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, currentValue }: { id: string; currentValue: string }) =>
      storyEngineApi.updateWorldVariable(bookId, id, { currentValue }),
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(formatApiError(error, '世界变量更新失败')),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await storyEngineApi.suggestWorldVariables(bookId);
      const wvs = res.suggestion.worldVariables ?? [];
      let created = 0;
      for (const w of wvs) {
        try {
          await storyEngineApi.createWorldVariable(bookId, {
            name: w.name,
            type: w.type,
            scope: { type: 'global', locationId: null },
            currentValue: w.currentValue,
            scale: w.scale,
            affects: w.affects ?? [],
            history: [],
            notes: w.rationale ?? null,
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
      toast.success(`已生成 ${created} 个世界变量${evidence ? ` · ${evidence.slice(0, 60)}` : ''}`);
    },
    onError: (error: unknown) => toast.error(formatApiError(error, 'AI 生成失败')),
  });

  const byType = useMemo(() => {
    const map = new Map<WorldVariableType, WorldVariable[]>();
    for (const variable of variablesQuery.data ?? []) {
      const rows = map.get(variable.type) ?? [];
      rows.push(variable);
      map.set(variable.type, rows);
    }
    return map;
  }, [variablesQuery.data]);

  const canCreate = draft.name.trim() && draft.currentValue.trim() && !createMutation.isPending;

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-pixel text-pixel-md">世界变量</h2>
        <PixelButton
          size="sm"
          variant="ghost"
          disabled={generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
          title="基于本书 worldview / themes / 章纲生成世界变量草案"
        >
          {generateMutation.isPending ? '生成中…' : '✨ AI 一键生成'}
        </PixelButton>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr]">
        <div className="border-2 border-outline rounded-md bg-surface p-3 shadow-pixel-1">
          <div className="mb-2 font-pixel text-pixel-sm text-ink-soft">新变量</div>
          <div className="space-y-2">
            <PixelInput
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="变量名"
            />
            <select
              className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
              value={draft.type}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, type: event.target.value as WorldVariableType }))
              }
            >
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <PixelInput
              value={draft.currentValue}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, currentValue: event.target.value }))
              }
              placeholder="当前值"
            />
            <PixelTextArea
              rows={4}
              value={draft.scale}
              onChange={(event) => setDraft((prev) => ({ ...prev, scale: event.target.value }))}
              placeholder="轻微:1&#10;戒备:5&#10;失控:10"
            />
            <PixelInput
              value={draft.affects}
              onChange={(event) => setDraft((prev) => ({ ...prev, affects: event.target.value }))}
              placeholder="影响对象，用逗号分隔"
            />
            <PixelButton
              className="w-full"
              disabled={!canCreate}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? '创建中…' : '创建变量'}
            </PixelButton>
          </div>
        </div>

        <div className="space-y-3">
          {variablesQuery.isLoading && (
            <div className="border-2 border-outline rounded-md bg-surface p-4 font-ui text-sm text-ink-soft shadow-pixel-1">
              加载世界变量…
            </div>
          )}
          {variablesQuery.data?.length === 0 && (
            <div className="border-2 border-outline rounded-md bg-surface p-4 font-ui text-sm text-ink-soft shadow-pixel-1">
              暂无世界变量。
            </div>
          )}
          {[...byType.entries()].map(([type, rows]) => (
            <div
              key={type}
              className="border-2 border-outline rounded-md bg-surface shadow-pixel-1"
            >
              <div className="border-b-2 border-outline-soft bg-surface-raised px-3 py-2 font-pixel text-pixel-sm text-ink-soft">
                {TYPE_LABEL[type]}
              </div>
              <div className="divide-y divide-outline-soft">
                {rows.map((variable) => {
                  const currentIndex = Math.max(
                    0,
                    variable.scale.findIndex((point) => point.label === variable.currentValue),
                  );
                  return (
                    <article key={variable.id} className="p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-pixel text-pixel-sm">{variable.name}</div>
                          <div className="mt-1 font-ui text-xs text-ink-mute">
                            {variable.currentValue}
                          </div>
                        </div>
                        <span className="font-mono text-pixel-sm text-ink-soft">
                          {variable.history.length} hist
                        </span>
                      </div>
                      {variable.scale.length > 0 ? (
                        <input
                          type="range"
                          min={0}
                          max={variable.scale.length - 1}
                          value={currentIndex}
                          className="w-full accent-primary"
                          onChange={(event) => {
                            const point = variable.scale[Number(event.target.value)];
                            if (point) {
                              updateMutation.mutate({
                                id: variable.id,
                                currentValue: point.label,
                              });
                            }
                          }}
                        />
                      ) : (
                        <PixelInput
                          value={variable.currentValue}
                          onChange={(event) =>
                            updateMutation.mutate({
                              id: variable.id,
                              currentValue: event.target.value,
                            })
                          }
                        />
                      )}
                      {variable.history.length > 0 && (
                        <div className="mt-3 flex h-8 items-end gap-1 border-t border-outline-soft pt-2">
                          {variable.history.slice(-16).map((point) => (
                            <span
                              key={`${point.chapter}-${point.fromValue}-${point.toValue}-${point.cause}`}
                              title={`第${point.chapter}章 · ${point.cause}`}
                              className="h-4 w-3 border border-primary bg-primary-soft"
                            />
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
