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

function CharacterStep({
  bookId,
  alreadyHas,
  onDone,
}: {
  bookId: string;
  alreadyHas: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('');
  const [motivation, setMotivation] = useState('');

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
        isProtagonist: true,
        importance: 'tier1',
        notes: null,
      } as never),
    onSuccess: () => {
      toast.success('已创建主角');
      onDone();
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '创建主角失败')),
  });

  if (alreadyHas) {
    return (
      <div className="space-y-2">
        <p className="font-ui text-sm text-ink-soft">已经有角色了，可以直接进入下一步。</p>
        <PixelButton onClick={onDone}>下一步</PixelButton>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <PixelInput placeholder="主角名" value={name} onChange={(e) => setName(e.target.value)} />
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
      <PixelButton
        disabled={!name.trim() || create.isPending}
        onClick={() => create.mutate()}
      >
        {create.isPending ? '创建中…' : '创建主角'}
      </PixelButton>
    </div>
  );
}

function ProfileStep({
  bookId,
  protagonist,
  onDone,
}: {
  bookId: string;
  protagonist: Character | undefined;
  onDone: () => void;
}) {
  const apply = useMutation({
    mutationFn: (preset: ArchetypePreset) => {
      if (!protagonist) throw new Error('需要先创建主角');
      return storyEngineApi.upsertDecisionProfile(bookId, protagonist.id, {
        archetype: preset.archetype,
        responses: preset.responses,
        hardConstraints: preset.hardConstraints,
        blindSpots: preset.blindSpots,
        growthArcHints: preset.growthArcHints,
        notes: null,
      });
    },
    onSuccess: () => {
      toast.success('已套用决策画像');
      onDone();
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '套用失败')),
  });

  if (!protagonist) {
    return <p className="font-ui text-sm text-warning">先创建主角（回退到上一步）</p>;
  }

  return (
    <div className="space-y-2">
      <p className="font-ui text-sm text-ink-soft">
        给「{protagonist.name}」选一个 archetype 模板，开局够用，之后可以改：
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
      <p className="font-ui text-[10px] text-ink-mute">
        想更精细？引导完成后，在角色卡 → 决策画像 tab 用「AI 建议」按钮基于已写章节抽取。
      </p>
    </div>
  );
}

function DriveStep({
  bookId,
  protagonist,
  onDone,
}: {
  bookId: string;
  protagonist: Character | undefined;
  onDone: () => void;
}) {
  const [description, setDescription] = useState('');
  const [goalState, setGoalState] = useState('');
  const [horizon, setHorizon] = useState<'short' | 'medium' | 'long'>('medium');

  const create = useMutation({
    mutationFn: () => {
      if (!protagonist) throw new Error('需要先创建主角');
      const input: Omit<CreateDriveInput, 'bookId'> = {
        characterId: protagonist.id,
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
      toast.success('已添加 Drive');
      onDone();
    },
    onError: (e: unknown) => toast.error(formatApiError(e, 'Drive 创建失败')),
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (!protagonist) throw new Error('需要先创建主角');
      const res = await storyEngineApi.suggestDrives(bookId, protagonist.id);
      const drives = res.suggestion.drives ?? [];
      let created = 0;
      for (const d of drives) {
        try {
          await storyEngineApi.createDrive(bookId, {
            characterId: protagonist.id,
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
      toast.success(`AI 已生成 ${created} 条 Drive`);
      onDone();
    },
    onError: (e: unknown) => toast.error(formatApiError(e, 'AI 生成失败')),
  });

  if (!protagonist) {
    return <p className="font-ui text-sm text-warning">先创建主角（回退到第 1 步）</p>;
  }

  return (
    <div className="space-y-2">
      <p className="font-ui text-sm text-ink-soft">给「{protagonist.name}」加一条核心欲望：</p>
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
          title="基于角色 + Bible 上下文，AI 自决数量"
        >
          {generate.isPending ? '生成中…' : '✨ AI 生成'}
        </PixelButton>
      </div>
    </div>
  );
}

function RelationshipStep({
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

function WorldStep({ bookId, onDone }: { bookId: string; onDone: () => void }) {
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
