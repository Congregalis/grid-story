import { PixelButton, PixelDialog } from '@grid-story/pixel-kit';
import type { Book } from '@grid-story/schema';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatApiError } from '../../../lib/api';
import { toast } from '../../../lib/toast';
import {
  CharacterStep,
  DriveStep,
  ProfileStep,
  RelationshipStep,
  WorldStep,
} from '../../story-engine/OnboardingWizard';
import { OUTLINE_STAGE, SETUP_STAGE } from '../definitions';
import type { StageContext } from '../types';

interface SetupStageProps {
  ctx: StageContext;
  bookId: string;
}

type SubstepId = 'character' | 'profile' | 'drive' | 'relationship' | 'world';

interface SubstepDef {
  id: SubstepId;
  title: string;
  hint: string;
  /** 是否硬门槛（影响"下一步"按钮是否可点） */
  required: (isSimulation: boolean) => boolean;
}

const SUBSTEPS: SubstepDef[] = [
  {
    id: 'character',
    title: 'A · 主角',
    hint: '至少 1 位主角，且要勾选 isProtagonist。',
    required: () => true,
  },
  {
    id: 'profile',
    title: 'B · 决策画像',
    hint: '触发器→反应表，决定 AI 推演时怎么"演"主角。套用模板最快。',
    required: (sim) => sim,
  },
  {
    id: 'drive',
    title: 'C · 主角 Drive',
    hint: '主角的欲望/目标——剧情的驱动力。',
    required: (sim) => sim,
  },
  {
    id: 'relationship',
    title: 'D · 核心关系',
    hint: '关系张力 = 剧情容器。可跳过，写到一半再补也行。',
    required: () => false,
  },
  {
    id: 'world',
    title: 'E · 世界变量',
    hint: '可拨杆调的环境状态。可跳过。',
    required: () => false,
  },
];

export function SetupStage({ ctx, bookId }: SetupStageProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isSimulation = ctx.book.engineMode === 'simulation';

  const [substepIdx, setSubstepIdx] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const protagonists = useMemo(
    () => ctx.characters.filter((c) => c.isProtagonist),
    [ctx.characters],
  );
  const protagonist = protagonists[0];

  // 初始落到首个未完成的子步骤
  useEffect(() => {
    const firstUnfinished = computeFirstUnfinishedIndex(ctx);
    if (firstUnfinished >= 0) setSubstepIdx(firstUnfinished);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const stageProgress = SETUP_STAGE.computeProgress(ctx);

  const confirmTeam = useMutation({
    mutationFn: () =>
      api.put<Book>(`/book/${encodeURIComponent(bookId)}`, {
        protagonistTeam: protagonists.map((p) => p.id),
        protagonistTeamConfirmedAt: new Date().toISOString(),
      } as never),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['book', bookId] });
      toast.success('主角团已确认');
      navigate(`/books/${bookId}/stages/${OUTLINE_STAGE.route}`);
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '确认失败')),
  });

  const handleAdvance = () => {
    if (!stageProgress.done) {
      toast.info(`还差：${stageProgress.blockers[0]}`);
      return;
    }
    setConfirmOpen(true);
  };

  const current = SUBSTEPS[substepIdx];

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
      <header>
        <h1 className="font-pixel text-pixel-lg mb-1">🎭 设定</h1>
        <p className="font-ui text-sm text-ink-soft">
          {isSimulation
            ? '把骨架填血肉：主角是谁、他怎么决策、他想要什么。AI 推演就靠这些。'
            : '至少建一个主角即可开始写。其他细节随时可以在专家模式补。'}
        </p>
      </header>

      {/* Sub-stepper */}
      <ol className="flex flex-wrap items-stretch gap-2">
        {SUBSTEPS.map((step, idx) => {
          const status = computeSubstepStatus(step, ctx, isSimulation);
          const isCurrent = idx === substepIdx;
          const cls = isCurrent
            ? 'border-primary bg-primary-soft text-primary'
            : status === 'done'
              ? 'border-success text-success bg-surface'
              : status === 'skipped'
                ? 'border-warning text-warning bg-surface'
                : 'border-outline-soft text-ink-mute bg-surface';
          return (
            <li key={step.id}>
              <button
                type="button"
                className={`min-w-[140px] text-left rounded-sm border-2 px-3 py-2 ${cls}`}
                onClick={() => setSubstepIdx(idx)}
              >
                <div className="font-pixel text-pixel-sm">
                  {status === 'done' ? '✓' : status === 'skipped' ? '⚠' : ''} {step.title}
                </div>
                <div className="font-ui text-[10px] text-ink-mute mt-0.5 truncate">
                  {step.required(isSimulation) ? '必填' : '可选'}
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Current substep card */}
      <section className="border-2 border-outline rounded-md bg-surface p-4 shadow-pixel-1 space-y-3">
        <header>
          <h2 className="font-pixel text-pixel-md">{current.title}</h2>
          <p className="font-ui text-xs text-ink-soft">{current.hint}</p>
        </header>

        <div className="border-t-2 border-outline pt-3">
          {current.id === 'character' && (
            <CharacterStep
              bookId={bookId}
              alreadyHas={ctx.characters.length > 0}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['bible', 'characters', bookId] });
                setSubstepIdx(Math.min(SUBSTEPS.length - 1, substepIdx + 1));
              }}
            />
          )}
          {current.id === 'profile' && (
            <ProfileStep
              bookId={bookId}
              protagonist={protagonist}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['story-engine', 'decision-profiles', bookId] });
                setSubstepIdx(Math.min(SUBSTEPS.length - 1, substepIdx + 1));
              }}
            />
          )}
          {current.id === 'drive' && (
            <DriveStep
              bookId={bookId}
              protagonist={protagonist}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['story-engine', 'drives', bookId] });
                setSubstepIdx(Math.min(SUBSTEPS.length - 1, substepIdx + 1));
              }}
            />
          )}
          {current.id === 'relationship' && (
            <RelationshipStep
              bookId={bookId}
              characters={ctx.characters}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['story-engine', 'relationships', bookId] });
                setSubstepIdx(Math.min(SUBSTEPS.length - 1, substepIdx + 1));
              }}
            />
          )}
          {current.id === 'world' && (
            <WorldStep
              bookId={bookId}
              onDone={() => {
                qc.invalidateQueries({ queryKey: ['story-engine', 'world-variables', bookId] });
              }}
            />
          )}
        </div>
      </section>

      {/* Footer：Substep 跳过 / 阶段下一步 */}
      <footer className="flex flex-wrap items-center gap-3">
        {substepIdx < SUBSTEPS.length - 1 && (
          <PixelButton
            variant="ghost"
            onClick={() => setSubstepIdx(Math.min(SUBSTEPS.length - 1, substepIdx + 1))}
          >
            跳过本步 →
          </PixelButton>
        )}
        <PixelButton
          disabled={!stageProgress.done || confirmTeam.isPending}
          onClick={handleAdvance}
        >
          {stageProgress.done
            ? '下一步：建大纲 ③ →'
            : `还差：${stageProgress.blockers[0]}`}
        </PixelButton>
        <span className="ml-auto font-ui text-xs text-ink-mute">
          完成度：{Math.round(stageProgress.ratio * 100)}%
        </span>
      </footer>

      <ProtagonistTeamConfirmDialog
        open={confirmOpen}
        protagonists={protagonists}
        pending={confirmTeam.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => confirmTeam.mutate()}
      />
    </div>
  );
}

function ProtagonistTeamConfirmDialog({
  open,
  protagonists,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  protagonists: StageContext['characters'];
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <PixelDialog
      open={open}
      onClose={onCancel}
      title="主角团确认"
      footer={
        <>
          <PixelButton variant="ghost" onClick={onCancel}>
            返回修改
          </PixelButton>
          <PixelButton disabled={pending} onClick={onConfirm}>
            {pending ? '确认中…' : '✓ 确认进入大纲'}
          </PixelButton>
        </>
      }
    >
      <div className="space-y-2">
        <p className="font-ui text-sm text-ink-soft">本书的主角团成员：</p>
        <ul className="font-ui text-sm space-y-1 border-2 border-outline-soft rounded-sm bg-surface-raised p-2">
          {protagonists.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="font-pixel text-pixel-sm">●</span>
              <span className="font-pixel text-pixel-sm">{p.name}</span>
              {p.personality && (
                <span className="font-ui text-[11px] text-ink-mute truncate">
                  · {p.personality}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="font-ui text-xs text-ink-mute">
          确认后将进入 ③ 大纲阶段。后续 AI 模拟时，会以这份名单为主角团推演剧情。
          作者中途调整 isProtagonist 时，写作阶段会提示主角团已变化。
        </p>
      </div>
    </PixelDialog>
  );
}

function computeSubstepStatus(
  substep: SubstepDef,
  ctx: StageContext,
  isSimulation: boolean,
): 'done' | 'pending' | 'skipped' {
  switch (substep.id) {
    case 'character':
      return ctx.characters.some((c) => c.isProtagonist) ? 'done' : 'pending';
    case 'profile': {
      const protagonist = ctx.characters.find((c) => c.isProtagonist);
      if (!protagonist) return 'pending';
      return ctx.decisionProfiles.some((p) => p.characterId === protagonist.id)
        ? 'done'
        : isSimulation
          ? 'pending'
          : 'skipped';
    }
    case 'drive': {
      const protagonist = ctx.characters.find((c) => c.isProtagonist);
      if (!protagonist) return 'pending';
      return ctx.drives.some((d) => d.characterId === protagonist.id)
        ? 'done'
        : isSimulation
          ? 'pending'
          : 'skipped';
    }
    case 'relationship':
      return ctx.relationships.length > 0 ? 'done' : 'skipped';
    case 'world':
      return ctx.worldVariables.length > 0 ? 'done' : 'skipped';
  }
}

function computeFirstUnfinishedIndex(ctx: StageContext): number {
  const isSim = ctx.book.engineMode === 'simulation';
  for (let i = 0; i < SUBSTEPS.length; i++) {
    const status = computeSubstepStatus(SUBSTEPS[i], ctx, isSim);
    if (status === 'pending') return i;
  }
  return -1;
}
