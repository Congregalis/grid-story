import { PixelButton, PixelInput, PixelTextArea } from '@grid-story/pixel-kit';
import type { Character, Drive, DriveHorizon, DriveStatus } from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { formatApiError } from '../../lib/api';
import { toast } from '../../lib/toast';
import { storyEngineApi } from './api';

const HORIZON_LABEL: Record<DriveHorizon, string> = {
  short: '短',
  medium: '中',
  long: '长',
};

const STATUS_LABEL: Record<DriveStatus, string> = {
  active: '进行',
  achieved: '完成',
  abandoned: '放弃',
  frustrated: '受阻',
};

interface DriveBoardProps {
  bookId: string;
  characters: Character[];
}

interface DriveDraft {
  characterId: string;
  horizon: DriveHorizon;
  description: string;
  goalState: string;
  motivation: string;
  priority: number;
}

function initialDraft(characterId: string): DriveDraft {
  return {
    characterId,
    horizon: 'short',
    description: '',
    goalState: '',
    motivation: '',
    priority: 5,
  };
}

export function DriveBoard({ bookId, characters }: DriveBoardProps) {
  const qc = useQueryClient();
  const firstCharacterId = characters[0]?.id ?? '';
  const [draft, setDraft] = useState<DriveDraft>(() => initialDraft(firstCharacterId));

  const drivesQuery = useQuery({
    queryKey: ['story-engine', 'drives', bookId],
    queryFn: () => storyEngineApi.listDrives(bookId),
    staleTime: 30_000,
  });

  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  );
  const grouped = useMemo(() => {
    const map = new Map<string, Drive[]>();
    for (const character of characters) map.set(character.id, []);
    for (const drive of drivesQuery.data ?? []) {
      const rows = map.get(drive.characterId) ?? [];
      rows.push(drive);
      map.set(drive.characterId, rows);
    }
    for (const rows of map.values()) {
      rows.sort((a, b) => b.priority - a.priority || b.progress - a.progress);
    }
    return map;
  }, [characters, drivesQuery.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['story-engine', 'drives', bookId] });

  const createMutation = useMutation({
    mutationFn: () =>
      storyEngineApi.createDrive(bookId, {
        characterId: draft.characterId || firstCharacterId,
        horizon: draft.horizon,
        description: draft.description.trim(),
        goalState: draft.goalState.trim(),
        motivation: draft.motivation.trim(),
        priority: draft.priority,
        progress: 0,
        status: 'active',
        blockers: [],
        evolvedFrom: null,
        createdChapter: null,
        resolvedChapter: null,
        notes: null,
      }),
    onSuccess: () => {
      invalidate();
      setDraft(initialDraft(draft.characterId || firstCharacterId));
      toast.success('Drive 已创建');
    },
    onError: (error: unknown) => toast.error(formatApiError(error, 'Drive 创建失败')),
  });

  const generateMutation = useMutation({
    mutationFn: async (characterId: string) => {
      const res = await storyEngineApi.suggestDrives(bookId, characterId);
      const drives = res.suggestion.drives ?? [];
      let created = 0;
      for (const d of drives) {
        try {
          await storyEngineApi.createDrive(bookId, {
            characterId,
            horizon: d.horizon,
            description: d.description,
            goalState: d.goalState,
            motivation: d.motivation,
            priority: d.priority,
            progress: d.progress ?? 0,
            status: 'active',
            blockers: d.blockers ?? [],
            evolvedFrom: null,
            createdChapter: null,
            resolvedChapter: null,
            notes: null,
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
      toast.success(`已生成 ${created} 条 Drive${evidence ? ` · ${evidence.slice(0, 60)}` : ''}`);
    },
    onError: (error: unknown) => toast.error(formatApiError(error, 'AI 生成失败')),
  });

  const suggestEvolutionMutation = useMutation({
    mutationFn: (driveId: string) => storyEngineApi.suggestDriveEvolution(bookId, driveId),
    onSuccess: ({ suggestion }, driveId) => {
      const evidence = suggestion.evidence ?? '';
      if (suggestion.recommendation === 'no_change') {
        toast.info(`AI 建议保持不动${evidence ? `：${evidence}` : ''}`);
        return;
      }
      if (suggestion.recommendation === 'update_status' && suggestion.currentDriveUpdate) {
        const u = suggestion.currentDriveUpdate;
        const ok = window.confirm(
          `AI 建议调整 Drive：\n${u.rationale}\n\n应用？(status: ${u.newStatus ?? '不变'})`,
        );
        if (!ok) return;
        const patch: { status?: DriveStatus; blockers?: string[] } = {};
        if (u.newStatus) patch.status = u.newStatus;
        if (u.newBlockers) patch.blockers = u.newBlockers;
        updateMutation.mutate({ id: driveId, input: patch });
        return;
      }
      if (suggestion.recommendation === 'spawn_new_drive' && suggestion.spawnedNewDrive) {
        const s = suggestion.spawnedNewDrive;
        const ok = window.confirm(
          `AI 建议演化新 Drive：\n${s.description}\n目标：${s.goalState}\n动机：${s.motivation}\n\n创建？`,
        );
        if (!ok) return;
        const drive = (drivesQuery.data ?? []).find((row) => row.id === driveId);
        if (!drive) return;
        storyEngineApi
          .createDrive(bookId, {
            characterId: drive.characterId,
            horizon: s.horizon,
            description: s.description,
            goalState: s.goalState,
            motivation: s.motivation,
            priority: s.priority,
            progress: s.progress,
            status: 'active',
            blockers: [],
            evolvedFrom: s.evolvedFrom,
            createdChapter: null,
            resolvedChapter: null,
            notes: s.rationale,
          })
          .then(() => {
            invalidate();
            toast.success('已创建演化 Drive');
          })
          .catch((error: unknown) => toast.error(formatApiError(error, '创建演化 Drive 失败')));
      }
    },
    onError: (error: unknown) => toast.error(formatApiError(error, 'AI 演化建议失败')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Drive> }) =>
      storyEngineApi.updateDrive(bookId, id, input),
    onSuccess: invalidate,
    onError: (error: unknown) => toast.error(formatApiError(error, 'Drive 更新失败')),
  });

  const canCreate =
    Boolean((draft.characterId || firstCharacterId) && draft.description.trim()) &&
    Boolean(draft.goalState.trim() && draft.motivation.trim()) &&
    !createMutation.isPending;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="font-pixel text-pixel-md">Drive 看板</h2>
      </header>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_1fr]">
        <div className="border-2 border-outline rounded-md bg-surface p-3 shadow-pixel-1">
          <div className="mb-2 font-pixel text-pixel-sm text-ink-soft">新 Drive</div>
          <div className="space-y-2">
            <select
              className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
              value={draft.characterId || firstCharacterId}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, characterId: event.target.value }))
              }
            >
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
            <select
              className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
              value={draft.horizon}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, horizon: event.target.value as DriveHorizon }))
              }
            >
              {Object.entries(HORIZON_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}期
                </option>
              ))}
            </select>
            <PixelInput
              value={draft.description}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Drive"
            />
            <PixelInput
              value={draft.goalState}
              onChange={(event) => setDraft((prev) => ({ ...prev, goalState: event.target.value }))}
              placeholder="目标状态"
            />
            <PixelTextArea
              rows={3}
              value={draft.motivation}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, motivation: event.target.value }))
              }
              placeholder="动机"
            />
            <label className="block">
              <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">
                优先级 {draft.priority}
              </span>
              <input
                type="range"
                min={1}
                max={10}
                value={draft.priority}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, priority: Number(event.target.value) }))
                }
                className="w-full accent-primary"
              />
            </label>
            <PixelButton
              className="w-full"
              disabled={!canCreate}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? '创建中…' : '创建 Drive'}
            </PixelButton>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {characters.map((character) => {
            const rows = grouped.get(character.id) ?? [];
            return (
              <div
                key={character.id}
                className="min-h-[240px] border-2 border-outline rounded-md bg-surface p-3 shadow-pixel-1"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="font-pixel text-pixel-sm">{character.name}</span>
                  <div className="flex items-center gap-2">
                    <PixelButton
                      size="sm"
                      variant="ghost"
                      disabled={
                        generateMutation.isPending &&
                        generateMutation.variables === character.id
                      }
                      onClick={() => generateMutation.mutate(character.id)}
                      title="基于角色 + Bible 上下文生成多条 Drive"
                    >
                      {generateMutation.isPending &&
                      generateMutation.variables === character.id
                        ? '生成中…'
                        : '✨ AI'}
                    </PixelButton>
                    <span className="font-mono text-pixel-sm text-ink-mute">{rows.length}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {rows.length === 0 && (
                    <div className="font-ui text-xs text-ink-mute">暂无 Drive</div>
                  )}
                  {rows.map((drive) => (
                    <article key={drive.id} className="border-2 border-outline-soft rounded-sm p-2">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-ui text-sm text-ink leading-relaxed">
                            {drive.description}
                          </div>
                          <div className="mt-1 font-ui text-xs text-ink-mute">
                            {HORIZON_LABEL[drive.horizon]}期 · {STATUS_LABEL[drive.status]}
                          </div>
                        </div>
                        <span className="font-mono text-pixel-sm text-primary">
                          P{drive.priority}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-[1fr_48px] items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={drive.progress}
                          className="w-full accent-primary"
                          onChange={(event) =>
                            updateMutation.mutate({
                              id: drive.id,
                              input: { progress: Number(event.target.value) },
                            })
                          }
                        />
                        <span className="font-mono text-pixel-sm text-ink-soft">
                          {drive.progress}%
                        </span>
                      </div>
                      <div className="mt-2 flex gap-1">
                        <select
                          className="h-7 flex-1 rounded-sm border border-outline bg-surface-raised px-1 font-ui text-xs text-ink"
                          value={drive.status}
                          onChange={(event) =>
                            updateMutation.mutate({
                              id: drive.id,
                              input: { status: event.target.value as DriveStatus },
                            })
                          }
                        >
                          {Object.entries(STATUS_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <PixelButton
                          size="sm"
                          variant="ghost"
                          disabled={drive.priority >= 10}
                          onClick={() =>
                            updateMutation.mutate({
                              id: drive.id,
                              input: { priority: Math.min(10, drive.priority + 1) },
                            })
                          }
                        >
                          ↑
                        </PixelButton>
                        <PixelButton
                          size="sm"
                          variant="ghost"
                          disabled={drive.priority <= 1}
                          onClick={() =>
                            updateMutation.mutate({
                              id: drive.id,
                              input: { priority: Math.max(1, drive.priority - 1) },
                            })
                          }
                        >
                          ↓
                        </PixelButton>
                        <PixelButton
                          size="sm"
                          variant="ghost"
                          disabled={suggestEvolutionMutation.isPending}
                          onClick={() => suggestEvolutionMutation.mutate(drive.id)}
                          title="AI 建议是否演化新 Drive"
                        >
                          {suggestEvolutionMutation.isPending &&
                          suggestEvolutionMutation.variables === drive.id
                            ? '建议中…'
                            : 'AI 演化'}
                        </PixelButton>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
          {characters.length === 0 && (
            <div className="border-2 border-outline rounded-md bg-surface p-6 text-center font-ui text-sm text-ink-soft shadow-pixel-1">
              先创建角色。
            </div>
          )}
          {drivesQuery.data
            ?.filter((drive) => !characterById.has(drive.characterId))
            .map((drive) => (
              <div
                key={drive.id}
                className="border-2 border-outline rounded-md bg-surface p-3 shadow-pixel-1"
              >
                <div className="font-pixel text-pixel-sm text-ink-soft">未匹配角色</div>
                <div className="mt-2 font-ui text-sm">{drive.description}</div>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
