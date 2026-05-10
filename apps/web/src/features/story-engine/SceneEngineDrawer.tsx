import { PixelButton } from '@grid-story/pixel-kit';
import type {
  Character,
  Location,
  ReviewIssue,
  SceneSimulationResult,
} from '@grid-story/schema';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { formatApiError } from '../../lib/api';
import { toast } from '../../lib/toast';
import { storyEngineApi, type SimulateSceneInput } from './api';
import { CausalGraphViewer } from './CausalGraphViewer';
import { SceneRunner, type SceneRunnerPrefill, type SceneRunnerSubmit } from './SceneRunner';
import { SceneStateInspector } from './SceneStateInspector';

interface SceneEngineDrawerProps {
  bookId: string;
  open: boolean;
  characters: Character[];
  locations: Location[];
  chapterId: string | null;
  defaultSceneIndex?: number;
  onAdopted?: () => void;
  onClose: () => void;
}

interface ActiveSimulation {
  simulationId: string;
  result: SceneSimulationResult;
  hijackIssues: ReviewIssue[];
  wikiWarnings: string[];
}

export function SceneEngineDrawer({
  bookId,
  open,
  characters,
  locations,
  chapterId,
  defaultSceneIndex = 0,
  onAdopted,
  onClose,
}: SceneEngineDrawerProps) {
  const qc = useQueryClient();
  const [active, setActive] = useState<ActiveSimulation | null>(null);
  const [lastInput, setLastInput] = useState<SceneRunnerSubmit | null>(null);
  const [prefill, setPrefill] = useState<SceneRunnerPrefill | null>(null);
  const [autopilot, setAutopilot] = useState(false);
  const [autopilotProgress, setAutopilotProgress] = useState(0);
  const [autopilotReasoning, setAutopilotReasoning] = useState<string | null>(null);

  const characterNames = useMemo(
    () => Object.fromEntries(characters.map((c) => [c.id, c.name])),
    [characters],
  );

  const simulate = useMutation({
    mutationFn: (input: SceneRunnerSubmit) => {
      if (!chapterId) throw new Error('当前没有章节，先创建一章');
      const payload: SimulateSceneInput = {
        chapterId,
        sceneIndex: input.sceneIndex,
        presentCharacterIds: input.presentCharacterIds,
        locationId: input.locationId,
        timeContext: input.timeContext,
        pressureSources: input.pressureSources,
        authorConstraints: input.authorConstraints,
        simulationMode: input.simulationMode,
        alternativeCount: input.alternativeCount,
      };
      return storyEngineApi.simulateScene(bookId, payload);
    },
    onSuccess: (response) => {
      setActive({
        simulationId: response.simulation.id,
        result: response.result,
        hijackIssues: response.hijackIssues ?? [],
        wikiWarnings: response.wikiWarnings ?? [],
      });
      toast.success('场景模拟完成');
    },
    onError: (error: unknown) => toast.error(formatApiError(error, '场景模拟失败')),
  });

  const suggestNext = useMutation({
    mutationFn: () => {
      if (!chapterId) throw new Error('当前没有章节');
      return storyEngineApi.suggestNextScene(bookId, chapterId);
    },
    onError: (error: unknown) => toast.error(formatApiError(error, 'AI 建议失败')),
  });

  const reroll = useMutation({
    mutationFn: (simulationId: string) => storyEngineApi.rerollScene(bookId, simulationId, {}),
    onSuccess: (response) => {
      setActive({
        simulationId: response.simulation.id,
        result: response.result,
        hijackIssues: response.hijackIssues ?? [],
        wikiWarnings: response.wikiWarnings ?? [],
      });
      toast.success('已重跑模拟（原候选已作废）');
    },
    onError: (error: unknown) => toast.error(formatApiError(error, '重跑失败')),
  });

  const adopt = useMutation({
    mutationFn: ({ simulationId, branchLabel }: { simulationId: string; branchLabel: string }) =>
      storyEngineApi.adoptScene(bookId, simulationId, { branchLabel }),
    onSuccess: async () => {
      toast.success('已写入章节');
      qc.invalidateQueries({ queryKey: ['chapters'] });
      qc.invalidateQueries({ queryKey: ['story-engine', 'drives', bookId] });
      qc.invalidateQueries({ queryKey: ['story-engine', 'relationships', bookId] });
      qc.invalidateQueries({ queryKey: ['story-engine', 'world-variables', bookId] });
      qc.invalidateQueries({ queryKey: ['story-engine', 'hooks', bookId] });
      qc.invalidateQueries({ queryKey: ['story-engine', 'causal-graph', bookId] });
      setActive(null);
      onAdopted?.();

      if (autopilot && chapterId) {
        try {
          const next = await storyEngineApi.suggestNextScene(bookId, chapterId);
          setAutopilotProgress((prev) => prev + 1);
          setAutopilotReasoning(next.reasoning);
          if (next.shouldEndChapter) {
            setAutopilot(false);
            setPrefill(null);
            toast.info(`建议收章：${next.reasoning || '本章节奏到位'}`);
            return;
          }
          const nextPrefill: SceneRunnerPrefill = {
            presentCharacterIds: next.suggestion.presentCharacterIds,
            locationId: next.suggestion.locationId,
            timeContext: next.suggestion.timeContext,
            pressureSources: next.suggestion.pressureSources,
            authorConstraints: next.suggestion.authorConstraints,
            alternativeCount: next.suggestion.alternativeCount,
          };
          setPrefill(nextPrefill);
          const nextSceneIndex = (lastInput?.sceneIndex ?? defaultSceneIndex) + 1;
          const nextInput: SceneRunnerSubmit = {
            presentCharacterIds: next.suggestion.presentCharacterIds,
            locationId: next.suggestion.locationId,
            timeContext: next.suggestion.timeContext,
            sceneIndex: nextSceneIndex,
            alternativeCount: next.suggestion.alternativeCount,
            authorConstraints: next.suggestion.authorConstraints,
            pressureSources: next.suggestion.pressureSources,
            simulationMode: 'group',
          };
          setLastInput(nextInput);
          simulate.mutate(nextInput);
        } catch (error: unknown) {
          setAutopilot(false);
          toast.error(formatApiError(error, 'autopilot 中断'));
        }
      }
    },
    onError: (error: unknown) => {
      if (autopilot) setAutopilot(false);
      toast.error(formatApiError(error, '拍板失败'));
    },
  });

  const handleSubmit = (input: SceneRunnerSubmit) => {
    setLastInput(input);
    simulate.mutate(input);
  };

  const handleAiFill = async () => {
    if (!chapterId) return;
    try {
      const next = await suggestNext.mutateAsync();
      setAutopilotReasoning(next.reasoning);
      setPrefill({
        presentCharacterIds: next.suggestion.presentCharacterIds,
        locationId: next.suggestion.locationId,
        timeContext: next.suggestion.timeContext,
        pressureSources: next.suggestion.pressureSources,
        authorConstraints: next.suggestion.authorConstraints,
        alternativeCount: next.suggestion.alternativeCount,
      });
      if (next.shouldEndChapter) {
        toast.info('AI 建议本章可以收尾，可直接 finalize');
      } else {
        toast.success('已填充建议（可微调后再运行）');
      }
    } catch {
      // 错误已在 onError 处理
    }
  };

  const handleAutopilot = async () => {
    if (!chapterId || autopilot) return;
    try {
      setAutopilot(true);
      setAutopilotProgress(0);
      const next = await suggestNext.mutateAsync();
      setAutopilotReasoning(next.reasoning);
      if (next.shouldEndChapter) {
        setAutopilot(false);
        toast.info(`建议收章：${next.reasoning || '本章节奏到位'}`);
        return;
      }
      const nextPrefill: SceneRunnerPrefill = {
        presentCharacterIds: next.suggestion.presentCharacterIds,
        locationId: next.suggestion.locationId,
        timeContext: next.suggestion.timeContext,
        pressureSources: next.suggestion.pressureSources,
        authorConstraints: next.suggestion.authorConstraints,
        alternativeCount: next.suggestion.alternativeCount,
      };
      setPrefill(nextPrefill);
      const nextSceneIndex = (lastInput?.sceneIndex ?? defaultSceneIndex) + (lastInput ? 1 : 0);
      const nextInput: SceneRunnerSubmit = {
        presentCharacterIds: next.suggestion.presentCharacterIds,
        locationId: next.suggestion.locationId,
        timeContext: next.suggestion.timeContext,
        sceneIndex: nextSceneIndex,
        alternativeCount: next.suggestion.alternativeCount,
        authorConstraints: next.suggestion.authorConstraints,
        pressureSources: next.suggestion.pressureSources,
        simulationMode: 'group',
      };
      setLastInput(nextInput);
      simulate.mutate(nextInput);
    } catch {
      setAutopilot(false);
    }
  };

  const handleStopAutopilot = () => {
    setAutopilot(false);
    toast.info('已退出 autopilot');
  };

  const handleRerun = () => {
    if (active) {
      reroll.mutate(active.simulationId);
    } else if (lastInput) {
      simulate.mutate(lastInput);
    }
  };

  const handleAdopt = (branchLabel: string) => {
    if (!active) return;
    adopt.mutate({ simulationId: active.simulationId, branchLabel });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        className="absolute inset-0 bg-ink/30"
        aria-label="关闭故事引擎"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[520px] overflow-y-auto border-l-2 border-outline bg-surface shadow-pixel-2">
        <header className="sticky top-0 z-10 border-b-2 border-outline bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-pixel text-pixel-md">故事引擎</h2>
            <div className="flex items-center gap-2">
              {autopilot ? (
                <PixelButton size="sm" variant="ghost" onClick={handleStopAutopilot}>
                  退出 autopilot
                </PixelButton>
              ) : (
                <PixelButton
                  size="sm"
                  disabled={!chapterId || suggestNext.isPending || simulate.isPending}
                  onClick={handleAutopilot}
                  title="智能填充 → 运行模拟 → 等你拍板 → 自动接下一场，直到 AI 判定该收章"
                >
                  推到章末 ✨
                </PixelButton>
              )}
              <PixelButton size="sm" variant="ghost" onClick={onClose}>
                关闭
              </PixelButton>
            </div>
          </div>
          {!chapterId && (
            <p className="mt-2 font-ui text-xs text-warning">未选中章节，无法运行模拟。</p>
          )}
          {autopilot && (
            <p className="mt-2 font-ui text-xs text-primary">
              autopilot 进行中 · 已推 {autopilotProgress} 场 · 拍板后自动接下一场
            </p>
          )}
          {autopilotReasoning && (
            <p className="mt-1 font-ui text-[11px] text-ink-mute italic">
              AI 建议：{autopilotReasoning}
            </p>
          )}
        </header>

        <div className="space-y-4 p-4">
          <div className="border-2 border-outline rounded-sm bg-surface-raised p-3">
            <h3 className="mb-2 font-pixel text-pixel-md">SceneRunner</h3>
            <SceneRunner
              characters={characters}
              locations={locations}
              defaultSceneIndex={defaultSceneIndex}
              pending={simulate.isPending}
              onSubmit={handleSubmit}
              prefill={prefill}
              onAiFill={chapterId ? handleAiFill : undefined}
              aiFilling={suggestNext.isPending}
            />
          </div>

          <CausalGraphViewer bookId={bookId} />

          {active && (
            <div className="border-2 border-outline rounded-sm bg-surface-raised p-3">
              <h3 className="mb-2 font-pixel text-pixel-md">SceneStateInspector</h3>
              {active.wikiWarnings.length > 0 && (
                <div className="mb-2 border border-warning rounded-sm bg-warning/10 px-2 py-1 font-ui text-xs text-ink-soft">
                  Wiki 警告：{active.wikiWarnings.join('；')}
                </div>
              )}
              {active.hijackIssues.length > 0 && (
                <div className="mb-2 border border-warning rounded-sm bg-warning/10 px-2 py-1 font-ui text-xs text-ink-soft">
                  人物绑架疑似：{active.hijackIssues.length} 条
                </div>
              )}
              <SceneStateInspector
                result={active.result}
                characterNames={characterNames}
                pendingAdopt={adopt.isPending}
                pendingRerun={reroll.isPending || simulate.isPending}
                onAdopt={handleAdopt}
                onRerun={handleRerun}
              />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
