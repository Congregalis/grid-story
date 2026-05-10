import { PixelButton, PixelDialog, PixelInput, PixelTextArea } from '@grid-story/pixel-kit';
import type {
  Character,
  CreateDriveInput,
  CreateRelationshipInput,
  CreateWorldVariableInput,
  WorldVariableType,
} from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api, formatApiError } from '../../lib/api';
import { toast } from '../../lib/toast';
import { storyEngineApi } from './api';
import { ARCHETYPE_PRESETS, type ArchetypePreset } from './archetype-presets';

type StepId = 'character' | 'profile' | 'drive' | 'relationship' | 'world';

const STEPS: { id: StepId; title: string; hint: string }[] = [
  { id: 'character', title: '① 创建主角', hint: '至少一个 tier1 主角，用于 OffscreenTicker 详细推演' },
  {
    id: 'profile',
    title: '② 主角的决策画像',
    hint: '触发器→反应表，决定 AI 推演时怎么演这个角色（套用模板最快）',
  },
  { id: 'drive', title: '③ 主角的核心 Drive', hint: '欲望/目标，剧情的驱动力' },
  { id: 'relationship', title: '④ 一对核心关系', hint: '关系张力 = 剧情容器（先两个角色对子）' },
  { id: 'world', title: '⑤ 一个世界变量', hint: '可调的环境状态，作者用它当压力旋钮' },
];

interface OnboardingWizardProps {
  bookId: string;
  open: boolean;
  onClose: (completed: boolean) => void;
}

interface ProgressState {
  completed: boolean;
  lastStepIndex: number;
  skipped: StepId[];
}

const STORAGE_PREFIX = 'gs:onboarding:';

function readProgress(bookId: string): ProgressState {
  if (typeof window === 'undefined') return { completed: false, lastStepIndex: 0, skipped: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + bookId);
    if (!raw) return { completed: false, lastStepIndex: 0, skipped: [] };
    return JSON.parse(raw);
  } catch {
    return { completed: false, lastStepIndex: 0, skipped: [] };
  }
}

function writeProgress(bookId: string, state: ProgressState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_PREFIX + bookId, JSON.stringify(state));
}

export function isOnboardingDone(bookId: string): boolean {
  return readProgress(bookId).completed;
}

export function OnboardingWizard({ bookId, open, onClose }: OnboardingWizardProps) {
  const qc = useQueryClient();
  const [stepIndex, setStepIndex] = useState(0);
  const [skipped, setSkipped] = useState<StepId[]>([]);

  useEffect(() => {
    if (!open) return;
    const saved = readProgress(bookId);
    setStepIndex(Math.min(saved.lastStepIndex, STEPS.length - 1));
    setSkipped(saved.skipped);
  }, [bookId, open]);

  const charactersQuery = useQuery<Character[]>({
    queryKey: ['bible', 'characters', bookId],
    queryFn: () => api.get<Character[]>(`/bible/characters?bookId=${encodeURIComponent(bookId)}`),
    enabled: open,
  });
  const characters = charactersQuery.data ?? [];
  const protagonist = useMemo(
    () => characters.find((c) => c.isProtagonist) ?? characters[0],
    [characters],
  );

  const advance = (skipCurrent = false) => {
    const current = STEPS[stepIndex];
    const newSkipped = skipCurrent && current ? [...new Set([...skipped, current.id])] : skipped;
    if (skipCurrent) setSkipped(newSkipped);
    if (stepIndex >= STEPS.length - 1) {
      writeProgress(bookId, { completed: true, lastStepIndex: stepIndex, skipped: newSkipped });
      onClose(true);
      toast.success('引导完成 · 可以打开"故事引擎 ✨"开始模拟了');
      return;
    }
    const next = stepIndex + 1;
    setStepIndex(next);
    writeProgress(bookId, { completed: false, lastStepIndex: next, skipped: newSkipped });
  };

  const handleClose = () => {
    writeProgress(bookId, { completed: false, lastStepIndex: stepIndex, skipped });
    onClose(false);
  };

  const current = STEPS[stepIndex];

  return (
    <PixelDialog
      open={open}
      onClose={handleClose}
      title={`故事引擎 · 引导 (${stepIndex + 1}/${STEPS.length})`}
      footer={
        <>
          <PixelButton variant="ghost" onClick={handleClose}>
            稍后再说
          </PixelButton>
          <PixelButton variant="ghost" onClick={() => advance(true)}>
            跳过本步
          </PixelButton>
        </>
      }
    >
      <div className="space-y-3">
        <header>
          <h3 className="font-pixel text-pixel-md">{current.title}</h3>
          <p className="font-ui text-xs text-ink-soft">{current.hint}</p>
        </header>

        <ol className="flex flex-wrap gap-1 font-ui text-[10px]">
          {STEPS.map((step, idx) => {
            const cls =
              idx === stepIndex
                ? 'border-primary bg-primary-soft text-primary'
                : skipped.includes(step.id)
                  ? 'border-warning text-warning'
                  : idx < stepIndex
                    ? 'border-success text-success'
                    : 'border-outline-soft text-ink-mute';
            return (
              <span key={step.id} className={`rounded-sm border px-1 ${cls}`}>
                {idx + 1}{skipped.includes(step.id) ? ' ⚠' : idx < stepIndex ? ' ✓' : ''}
              </span>
            );
          })}
        </ol>

        <div className="border-t-2 border-outline pt-3">
          {current.id === 'character' && (
            <CharacterStep
              bookId={bookId}
              alreadyHas={characters.length > 0}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['bible', 'characters', bookId] });
                advance();
              }}
            />
          )}
          {current.id === 'profile' && (
            <ProfileStep
              bookId={bookId}
              protagonist={protagonist}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['story-engine', 'decision-profiles', bookId] });
                advance();
              }}
            />
          )}
          {current.id === 'drive' && (
            <DriveStep
              bookId={bookId}
              protagonist={protagonist}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['story-engine', 'drives', bookId] });
                advance();
              }}
            />
          )}
          {current.id === 'relationship' && (
            <RelationshipStep
              bookId={bookId}
              characters={characters}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['story-engine', 'relationships', bookId] });
                advance();
              }}
            />
          )}
          {current.id === 'world' && (
            <WorldStep
              bookId={bookId}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['story-engine', 'world-variables', bookId] });
                advance();
              }}
            />
          )}
        </div>
      </div>
    </PixelDialog>
  );
}

export function CharacterStep({
  bookId,
  characters: charsProp,
  alreadyHas,
  onDone,
}: {
  bookId: string;
  /** 当前书的角色列表（可选：传了就显示列表 + 多主角模式；不传则走旧 wizard 逻辑） */
  characters?: Character[];
  alreadyHas: boolean;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('');
  const [motivation, setMotivation] = useState('');
  const [isProtagonist, setIsProtagonist] = useState(true);

  const create = useMutation({
    mutationFn: () =>
      api.post<Character>('/bible/characters', {
        bookId,
        name: name.trim(),
        aliases: [],
        gender: null,
        age: null,
        species: null,
        appearance: null,
        personality: personality.trim() || null,
        background: null,
        motivation: motivation.trim() || null,
        abilities: [],
        relationships: [],
        locationId: null,
        organizationIds: [],
        isProtagonist,
        importance: isProtagonist ? 'tier1' : 'tier2',
        notes: null,
      } as never),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['bible', 'characters', bookId] });
      toast.success(`已创建：${created.name}`);
      setName('');
      setPersonality('');
      setMotivation('');
      setIsProtagonist(true);
      // 多主角模式：不自动 advance，让用户决定继续加还是走下一步
      if (!charsProp) onDone();
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '创建角色失败')),
  });

  // 旧 wizard 模式：已有角色直接 onDone
  if (charsProp === undefined && alreadyHas) {
    return (
      <div className="space-y-2">
        <p className="font-ui text-sm text-ink-soft">已经有角色了，可以直接进入下一步。</p>
        <PixelButton onClick={onDone}>下一步</PixelButton>
      </div>
    );
  }

  const protagonists = (charsProp ?? []).filter((c) => c.isProtagonist);
  const supporting = (charsProp ?? []).filter((c) => !c.isProtagonist);

  return (
    <div className="space-y-3">
      {charsProp !== undefined && charsProp.length > 0 && (
        <div className="space-y-1">
          <div className="font-pixel text-pixel-sm text-ink-soft">
            已创建（{protagonists.length} 主角 / {supporting.length} 配角）
          </div>
          <ul className="space-y-1 max-h-40 overflow-auto pr-1">
            {[...protagonists, ...supporting].map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-2 border border-outline-soft rounded-sm bg-surface-raised px-2 py-1 font-ui text-sm"
              >
                <span
                  className={`font-pixel text-[10px] px-1 rounded-sm border ${
                    c.isProtagonist
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-outline-soft text-ink-mute'
                  }`}
                >
                  {c.isProtagonist ? '主角' : '配角'}
                </span>
                <span className="font-pixel text-pixel-sm">{c.name}</span>
                {c.personality && (
                  <span className="font-ui text-[11px] text-ink-mute truncate">
                    · {c.personality}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-2 border-outline-soft rounded-sm bg-surface-raised p-2 space-y-2">
        <div className="font-pixel text-pixel-sm text-ink-soft">
          {charsProp !== undefined && charsProp.length > 0 ? '再加一位角色' : '创建角色'}
        </div>
        <PixelInput placeholder="名字" value={name} onChange={(e) => setName(e.target.value)} />
        <PixelInput
          placeholder="性格简述（可选）"
          value={personality}
          onChange={(e) => setPersonality(e.target.value)}
        />
        <PixelInput
          placeholder="主要动机（可选）"
          value={motivation}
          onChange={(e) => setMotivation(e.target.value)}
        />
        <label className="flex items-center gap-2 font-ui text-sm">
          <input
            type="checkbox"
            checked={isProtagonist}
            onChange={(e) => setIsProtagonist(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <span>勾为主角（受 AI 详细推演 / 主角团确认 影响）</span>
        </label>
        <PixelButton
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? '创建中…' : '+ 创建'}
        </PixelButton>
      </div>

      {charsProp !== undefined && protagonists.length > 0 && (
        <PixelButton variant="ghost" onClick={onDone}>
          ✓ 主角加够了 · 下一步 →
        </PixelButton>
      )}
    </div>
  );
}

export function ProfileStep({
  bookId,
  protagonist,
  protagonists: protagonistsProp,
  onDone,
}: {
  bookId: string;
  /** 兼容旧 wizard：单主角 */
  protagonist: Character | undefined;
  /** 多主角模式：传了就显示主角下拉选择 */
  protagonists?: Character[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const protagonists = protagonistsProp ?? (protagonist ? [protagonist] : []);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    protagonist?.id ?? protagonists[0]?.id,
  );
  const target = protagonists.find((p) => p.id === selectedId) ?? protagonists[0];

  const profilesQuery = useQuery({
    queryKey: ['story-engine', 'decision-profiles', bookId],
    queryFn: () => storyEngineApi.listDecisionProfiles(bookId),
    staleTime: 30_000,
  });
  const profiledIds = useMemo(
    () => new Set((profilesQuery.data ?? []).map((p) => p.characterId)),
    [profilesQuery.data],
  );

  const apply = useMutation({
    mutationFn: (preset: ArchetypePreset) => {
      if (!target) throw new Error('需要先创建主角');
      return storyEngineApi.upsertDecisionProfile(bookId, target.id, {
        archetype: preset.archetype,
        responses: preset.responses,
        hardConstraints: preset.hardConstraints,
        blindSpots: preset.blindSpots,
        growthArcHints: preset.growthArcHints,
        notes: null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['story-engine', 'decision-profiles', bookId] });
      toast.success(`已为「${target?.name}」套用决策画像`);
      // 多主角模式下：套完一个不自动 advance，让用户继续给下一位
      if (protagonistsProp === undefined) onDone();
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '套用失败')),
  });

  const aiSuggest = useMutation({
    mutationFn: () => {
      if (!target) throw new Error('需要先选主角');
      return storyEngineApi.suggestDecisionProfile(bookId, target.id);
    },
    onSuccess: async ({ suggestion }) => {
      if (!target) return;
      await storyEngineApi.upsertDecisionProfile(bookId, target.id, {
        archetype: suggestion.archetype,
        responses: suggestion.responses.map((r) => ({
          ...r,
          triggerType: r.triggerType as never,
        })),
        hardConstraints: suggestion.hardConstraints,
        blindSpots: suggestion.blindSpots,
        growthArcHints: suggestion.growthArcHints,
        notes: null,
      });
      qc.invalidateQueries({ queryKey: ['story-engine', 'decision-profiles', bookId] });
      toast.success(`AI 已为「${target.name}」生成决策画像`);
      if (protagonistsProp === undefined) onDone();
    },
    onError: (e: unknown) => toast.error(formatApiError(e, 'AI 生成失败')),
  });

  if (!target) {
    return <p className="font-ui text-sm text-warning">先创建主角（回退到上一步）</p>;
  }

  const allDone = protagonists.length > 0 && protagonists.every((p) => profiledIds.has(p.id));

  return (
    <div className="space-y-3">
      {protagonistsProp !== undefined && protagonists.length > 1 && (
        <div className="space-y-1">
          <div className="font-pixel text-pixel-sm text-ink-soft">选择主角</div>
          <div className="flex flex-wrap gap-1">
            {protagonists.map((p) => {
              const done = profiledIds.has(p.id);
              const active = p.id === target.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`font-pixel text-pixel-sm border-2 rounded-sm px-2 py-1 ${
                    active
                      ? 'border-primary bg-primary-soft text-primary'
                      : done
                        ? 'border-success text-success bg-surface'
                        : 'border-outline-soft bg-surface text-ink'
                  }`}
                  onClick={() => setSelectedId(p.id)}
                >
                  {done ? '✓ ' : ''}
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="font-ui text-sm text-ink-soft">
        给「{target.name}」选一个 archetype，或让 AI 基于设定 + 已写章节抽取，或自己精细编辑：
      </p>
      <div className="grid grid-cols-2 gap-2">
        {ARCHETYPE_PRESETS.map((preset) => (
          <button
            key={preset.archetype}
            type="button"
            disabled={apply.isPending}
            onClick={() => apply.mutate(preset)}
            className="border-2 border-outline-soft rounded-sm bg-surface-raised p-2 text-left hover:border-primary"
          >
            <div className="font-pixel text-pixel-sm text-ink">{preset.archetype}</div>
            <div className="font-ui text-[10px] text-ink-mute">
              {preset.hardConstraints.slice(0, 2).join(' / ')}
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <PixelButton
          variant="ghost"
          disabled={aiSuggest.isPending}
          onClick={() => aiSuggest.mutate()}
        >
          {aiSuggest.isPending ? '生成中…' : '✨ AI 生成'}
        </PixelButton>
        <a
          href={`/books/${bookId}/expert/bible?type=character`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-pixel text-pixel-sm border-2 border-outline-soft rounded-sm px-2 py-1 hover:bg-primary-soft text-ink-soft"
          title="在专家模式下精细编辑触发器、反应、硬约束、盲点"
        >
          ✏ 自定义编辑（专家模式）
        </a>
        {protagonistsProp !== undefined && (
          <PixelButton
            className="ml-auto"
            disabled={!allDone}
            onClick={onDone}
            title={!allDone ? '还有主角没设画像' : ''}
          >
            {allDone ? '✓ 全部完成 · 下一步 →' : `还差 ${protagonists.length - profiledIds.size} 位`}
          </PixelButton>
        )}
      </div>
    </div>
  );
}

export function DriveStep({
  bookId,
  protagonist,
  protagonists: protagonistsProp,
  onDone,
}: {
  bookId: string;
  protagonist: Character | undefined;
  /** 多主角模式：传了就支持切换主角，且每位主角至少 1 条 Drive 才允许 advance */
  protagonists?: Character[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const protagonists = protagonistsProp ?? (protagonist ? [protagonist] : []);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    protagonist?.id ?? protagonists[0]?.id,
  );
  const target = protagonists.find((p) => p.id === selectedId) ?? protagonists[0];

  const drivesQuery = useQuery({
    queryKey: ['story-engine', 'drives', bookId],
    queryFn: () => storyEngineApi.listDrives(bookId),
    staleTime: 30_000,
  });
  const allDrives = drivesQuery.data ?? [];
  const targetDrives = useMemo(
    () => allDrives.filter((d) => d.characterId === target?.id),
    [allDrives, target?.id],
  );
  const driveCountByChar = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of allDrives) map.set(d.characterId, (map.get(d.characterId) ?? 0) + 1);
    return map;
  }, [allDrives]);

  const [description, setDescription] = useState('');
  const [goalState, setGoalState] = useState('');
  const [horizon, setHorizon] = useState<'short' | 'medium' | 'long'>('medium');

  const create = useMutation({
    mutationFn: () => {
      if (!target) throw new Error('需要先选主角');
      const input: Omit<CreateDriveInput, 'bookId'> = {
        characterId: target.id,
        horizon,
        description: description.trim(),
        goalState: goalState.trim() || description.trim(),
        motivation: '主线驱动',
        priority: 8,
        progress: 0,
        status: 'active',
        blockers: [],
        evolvedFrom: null,
        createdChapter: null,
        resolvedChapter: null,
        notes: null,
      };
      return storyEngineApi.createDrive(bookId, input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['story-engine', 'drives', bookId] });
      toast.success(`已为「${target?.name}」添加 Drive`);
      setDescription('');
      setGoalState('');
      // 多主角模式：不自动 advance，让用户继续给下一位
      if (protagonistsProp === undefined) onDone();
    },
    onError: (e: unknown) => toast.error(formatApiError(e, 'Drive 创建失败')),
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error('需要先选主角');
      const res = await storyEngineApi.suggestDrives(bookId, target.id);
      const drives = res.suggestion.drives ?? [];
      let created = 0;
      for (const d of drives) {
        try {
          await storyEngineApi.createDrive(bookId, {
            characterId: target.id,
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
        } catch {}
      }
      return created;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['story-engine', 'drives', bookId] });
      toast.success(`AI 已为「${target?.name}」生成 ${created} 条 Drive`);
      if (protagonistsProp === undefined) onDone();
    },
    onError: (e: unknown) => toast.error(formatApiError(e, 'AI 生成失败')),
  });

  const deleteDrive = useMutation({
    mutationFn: (driveId: string) => api.del(`/books/${encodeURIComponent(bookId)}/drives/${encodeURIComponent(driveId)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['story-engine', 'drives', bookId] });
      toast.success('已删除');
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '删除失败')),
  });

  if (!target) {
    return <p className="font-ui text-sm text-warning">先创建主角（回退到第 1 步）</p>;
  }

  const allHaveDrive = protagonists.length > 0 && protagonists.every((p) => (driveCountByChar.get(p.id) ?? 0) > 0);

  return (
    <div className="space-y-3">
      {protagonistsProp !== undefined && protagonists.length > 1 && (
        <div className="space-y-1">
          <div className="font-pixel text-pixel-sm text-ink-soft">选择主角</div>
          <div className="flex flex-wrap gap-1">
            {protagonists.map((p) => {
              const count = driveCountByChar.get(p.id) ?? 0;
              const active = p.id === target.id;
              const done = count > 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`font-pixel text-pixel-sm border-2 rounded-sm px-2 py-1 ${
                    active
                      ? 'border-primary bg-primary-soft text-primary'
                      : done
                        ? 'border-success text-success bg-surface'
                        : 'border-outline-soft bg-surface text-ink'
                  }`}
                  onClick={() => setSelectedId(p.id)}
                >
                  {done ? '✓ ' : ''}
                  {p.name}
                  {count > 0 && <span className="ml-1 text-[10px]">×{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 已有 Drive 列表 */}
      {targetDrives.length > 0 && (
        <div className="space-y-1">
          <div className="font-pixel text-pixel-sm text-ink-soft">
            「{target.name}」已有 {targetDrives.length} 条
          </div>
          <ul className="space-y-1 max-h-32 overflow-auto pr-1">
            {targetDrives.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-2 border border-outline-soft rounded-sm bg-surface-raised px-2 py-1 font-ui text-xs"
              >
                <span
                  className={`font-pixel text-[10px] px-1 rounded-sm border-2 ${
                    d.horizon === 'short'
                      ? 'border-success text-success'
                      : d.horizon === 'medium'
                        ? 'border-secondary text-secondary'
                        : 'border-primary text-primary'
                  }`}
                >
                  {d.horizon === 'short' ? '短' : d.horizon === 'medium' ? '中' : '长'}
                </span>
                <span className="truncate flex-1">{d.description}</span>
                <span className="font-mono text-[10px] text-ink-mute">P{d.priority}</span>
                <button
                  type="button"
                  className="font-pixel text-[10px] text-danger hover:underline"
                  disabled={deleteDrive.isPending}
                  onClick={() => {
                    if (window.confirm(`删除 Drive：${d.description}？`)) {
                      deleteDrive.mutate(d.id);
                    }
                  }}
                >
                  删
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-2 border-outline-soft rounded-sm bg-surface-raised p-2 space-y-2">
        <div className="font-pixel text-pixel-sm text-ink-soft">给「{target.name}」加一条核心欲望</div>
        <PixelInput
          placeholder='例：找到母亲的下落'
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <PixelInput
          placeholder="目标态（可选）"
          value={goalState}
          onChange={(e) => setGoalState(e.target.value)}
        />
        <select
          className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
          value={horizon}
          onChange={(e) => setHorizon(e.target.value as 'short' | 'medium' | 'long')}
        >
          <option value="short">短期</option>
          <option value="medium">中期</option>
          <option value="long">长期</option>
        </select>
        <div className="flex gap-2">
          <PixelButton
            disabled={!description.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? '创建中…' : '添加 Drive'}
          </PixelButton>
          <PixelButton
            variant="ghost"
            disabled={generate.isPending}
            onClick={() => generate.mutate()}
            title={`基于「${target.name}」+ Bible 上下文，AI 自决数量`}
          >
            {generate.isPending ? '生成中…' : '✨ AI 生成'}
          </PixelButton>
        </div>
      </div>

      {protagonistsProp !== undefined && (
        <PixelButton
          disabled={!allHaveDrive}
          onClick={onDone}
          title={!allHaveDrive ? '还有主角没设 Drive' : ''}
        >
          {allHaveDrive
            ? '✓ 全部完成 · 下一步 →'
            : `还差 ${protagonists.length - [...driveCountByChar.entries()].filter(([id, n]) => protagonists.some((p) => p.id === id) && n > 0).length} 位`}
        </PixelButton>
      )}
    </div>
  );
}

export function RelationshipStep({
  bookId,
  characters,
  onDone,
}: {
  bookId: string;
  characters: Character[];
  onDone: () => void;
}) {
  const [fromId, setFromId] = useState(characters[0]?.id ?? '');
  const [toId, setToId] = useState(characters[1]?.id ?? '');
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!fromId && characters[0]) setFromId(characters[0].id);
    if (!toId && characters[1]) setToId(characters[1].id);
  }, [characters, fromId, toId]);

  const create = useMutation({
    mutationFn: () => {
      const input: Omit<CreateRelationshipInput, 'bookId'> = {
        fromCharacterId: fromId,
        toCharacterId: toId,
        relationLabel: label.trim() || '主线对子',
        currentTension: { class: 0, info: 0, emotion: 0 },
        targetTrajectory: null,
        history: [],
        isPublicKnowledge: false,
        notes: null,
      };
      return storyEngineApi.createRelationship(bookId, input);
    },
    onSuccess: () => {
      toast.success('已建立关系');
      onDone();
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '关系创建失败')),
  });

  const generate = useMutation({
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
        } catch {}
      }
      return created;
    },
    onSuccess: (created) => {
      toast.success(`AI 已生成 ${created} 对关系`);
      onDone();
    },
    onError: (e: unknown) => toast.error(formatApiError(e, 'AI 生成失败')),
  });

  if (characters.length < 2) {
    return (
      <div className="space-y-2">
        <p className="font-ui text-sm text-warning">至少需要 2 个角色才能建立关系。</p>
        <p className="font-ui text-xs text-ink-soft">
          可以先跳过本步，去 BibleStudio 加另一个角色后回来补。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="font-ui text-sm text-ink-soft">先建立一对关系，作为剧情张力的容器：</p>
      <div className="grid grid-cols-2 gap-2">
        <select
          className="h-8 rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm"
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
        >
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm"
          value={toId}
          onChange={(e) => setToId(e.target.value)}
        >
          {characters
            .filter((c) => c.id !== fromId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </div>
      <PixelInput
        placeholder="关系标签（如 '师徒 / 婚约 / 杀父仇人 / 暧昧'）"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <p className="font-ui text-[10px] text-ink-mute">
        三轴张力（阶级/信息/情感）默认 0，模拟时可在 RelationshipMatrix 调。
      </p>
      <div className="flex gap-2">
        <PixelButton
          disabled={!fromId || !toId || fromId === toId || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? '创建中…' : '建立关系'}
        </PixelButton>
        <PixelButton
          variant="ghost"
          disabled={generate.isPending || characters.length < 2}
          onClick={() => generate.mutate()}
          title="基于全角色 + 章纲，AI 自决数量"
        >
          {generate.isPending ? '生成中…' : '✨ AI 生成'}
        </PixelButton>
      </div>
    </div>
  );
}

export function WorldStep({ bookId, onDone }: { bookId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<WorldVariableType>('economy');
  const [currentValue, setCurrentValue] = useState('');
  const [affects, setAffects] = useState('');

  const create = useMutation({
    mutationFn: () => {
      const input: Omit<CreateWorldVariableInput, 'bookId'> = {
        name: name.trim(),
        type,
        scope: { type: 'global', locationId: null },
        currentValue: currentValue.trim() || '普通',
        scale: [
          { label: '低', severity: 1 },
          { label: '普通', severity: 2 },
          { label: '高', severity: 3 },
        ],
        affects: affects
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        history: [],
        notes: null,
      };
      return storyEngineApi.createWorldVariable(bookId, input);
    },
    onSuccess: () => {
      toast.success('已添加世界变量');
      onDone();
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '世界变量创建失败')),
  });

  const generate = useMutation({
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
        } catch {}
      }
      return created;
    },
    onSuccess: (created) => {
      toast.success(`AI 已生成 ${created} 个世界变量`);
      onDone();
    },
    onError: (e: unknown) => toast.error(formatApiError(e, 'AI 生成失败')),
  });

  return (
    <div className="space-y-2">
      <PixelInput
        placeholder='例：京都经济'
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select
        className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm"
        value={type}
        onChange={(e) => setType(e.target.value as WorldVariableType)}
      >
        <option value="economy">经济</option>
        <option value="politics">政治</option>
        <option value="season">季节</option>
        <option value="public_opinion">舆论</option>
        <option value="natural">天灾</option>
        <option value="tech_level">科技</option>
        <option value="custom">自定义</option>
      </select>
      <PixelInput
        placeholder='当前值（如 "饥荒 3 级" / "战乱"）'
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
      />
      <PixelTextArea
        placeholder='这个变量影响什么？每行一条（可选，给 AI 看的软约束）'
        rows={2}
        value={affects}
        onChange={(e) => setAffects(e.target.value)}
      />
      <div className="flex gap-2">
        <PixelButton
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? '创建中…' : '添加 · 完成'}
        </PixelButton>
        <PixelButton
          variant="ghost"
          disabled={generate.isPending}
          onClick={() => generate.mutate()}
          title="基于本书 worldview / themes / 章纲，AI 自决数量"
        >
          {generate.isPending ? '生成中…' : '✨ AI 生成 · 完成'}
        </PixelButton>
      </div>
    </div>
  );
}
