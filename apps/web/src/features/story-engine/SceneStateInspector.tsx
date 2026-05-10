import { PixelButton } from '@grid-story/pixel-kit';
import type { SceneBranch, SceneSimulationResult } from '@grid-story/schema';
import { useMemo, useState } from 'react';

interface SceneStateInspectorProps {
  result: SceneSimulationResult;
  hijackFlaggedCharacterIds?: string[];
  characterNames?: Record<string, string>;
  pendingAdopt?: boolean;
  pendingRerun?: boolean;
  onAdopt: (branchLabel: string) => void;
  onRerun?: () => void;
}

export function SceneStateInspector({
  result,
  hijackFlaggedCharacterIds = [],
  characterNames = {},
  pendingAdopt = false,
  pendingRerun = false,
  onAdopt,
  onRerun,
}: SceneStateInspectorProps) {
  const branches = useMemo(
    () => [result.primaryBranch, ...result.alternativeBranches],
    [result.primaryBranch, result.alternativeBranches],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const branch = branches[activeIndex];
  const flagged = new Set(hijackFlaggedCharacterIds);
  const nameOf = (id: string) => characterNames[id] ?? id;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-pixel text-pixel-md">分支</h3>
        <span className="font-mono text-pixel-sm text-ink-mute">
          {result.modelUsed} · {result.costTokens} tok
        </span>
      </div>

      <div className="flex flex-wrap gap-1 border-b-2 border-outline pb-1">
        {branches.map((b, idx) => (
          <button
            key={b.branchLabel + idx}
            type="button"
            className={`h-7 rounded-sm border-2 px-2 font-pixel text-pixel-sm ${
              idx === activeIndex
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-outline-soft text-ink-mute hover:text-ink'
            }`}
            onClick={() => setActiveIndex(idx)}
          >
            {idx === 0 ? '主走向' : `候选 ${idx}`} · {b.branchLabel}
          </button>
        ))}
      </div>

      <BranchView branch={branch} flagged={flagged} nameOf={nameOf} />

      <div className="flex flex-wrap gap-2 border-t-2 border-outline pt-3">
        <PixelButton
          className="flex-1"
          disabled={pendingAdopt}
          onClick={() => onAdopt(branch.branchLabel)}
        >
          {pendingAdopt ? '拍板中…' : `拍板：${branch.branchLabel}`}
        </PixelButton>
        {onRerun && (
          <PixelButton
            variant="ghost"
            disabled={pendingAdopt || pendingRerun}
            onClick={onRerun}
          >
            {pendingRerun ? '重跑中…' : '重跑'}
          </PixelButton>
        )}
      </div>

      <PacingScoreLine result={result} />
    </section>
  );
}

function BranchView({
  branch,
  flagged,
  nameOf,
}: {
  branch: SceneBranch;
  flagged: Set<string>;
  nameOf: (id: string) => string;
}) {
  return (
    <div className="space-y-3">
      <div className="border-2 border-outline rounded-sm bg-surface-raised p-3">
        <div className="font-pixel text-pixel-sm text-ink-soft mb-1">narrative</div>
        <p className="font-prose text-sm leading-7 whitespace-pre-wrap">{branch.narrative}</p>
      </div>

      <Section title="角色选择 justifications">
        <ul className="space-y-1">
          {branch.characterChoiceJustifications.map((j) => {
            const isFlagged = flagged.has(j.characterId) || j.decisionProfileMatchScore < 5;
            return (
              <li
                key={j.characterId}
                className={`border rounded-sm px-2 py-1 ${
                  isFlagged
                    ? 'border-warning bg-warning/10'
                    : 'border-outline-soft bg-surface-raised'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-pixel text-pixel-sm">{nameOf(j.characterId)}</span>
                  <span
                    className={`font-mono text-[10px] rounded-sm px-1 ${
                      isFlagged ? 'bg-warning text-ink' : 'bg-surface text-ink-mute'
                    }`}
                  >
                    match {j.decisionProfileMatchScore}
                  </span>
                  {isFlagged && (
                    <span className="font-ui text-[10px] text-warning">可能 OOC</span>
                  )}
                </div>
                <p className="font-ui text-xs text-ink-soft mt-0.5">{j.choiceSummary}</p>
                <p className="font-ui text-[11px] text-ink-mute mt-0.5">{j.rationale}</p>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={`stateDelta · 关系 (${branch.stateDelta.relationships.length})`}>
        <ul className="space-y-0.5 font-ui text-xs">
          {branch.stateDelta.relationships.map((r, i) => (
            <li key={i} className="text-ink-soft">
              <span className="font-mono">{r.axis}</span> {r.delta > 0 ? '+' : ''}
              {r.delta} — {r.reason}
            </li>
          ))}
          {branch.stateDelta.relationships.length === 0 && (
            <li className="text-ink-mute">无</li>
          )}
        </ul>
      </Section>

      <Section title={`stateDelta · Drives (${branch.stateDelta.drives.length})`}>
        <ul className="space-y-0.5 font-ui text-xs">
          {branch.stateDelta.drives.map((d, i) => (
            <li key={i} className="text-ink-soft">
              {d.progressDelta != null && (
                <span className="font-mono">Δ{d.progressDelta > 0 ? '+' : ''}{d.progressDelta} </span>
              )}
              {d.newStatus && <span className="font-mono">→{d.newStatus} </span>}
              — {d.reason}
            </li>
          ))}
          {branch.stateDelta.drives.length === 0 && <li className="text-ink-mute">无</li>}
        </ul>
      </Section>

      <Section
        title={`stateDelta · 世界变量 (${branch.stateDelta.worldVariables.length})`}
      >
        <ul className="space-y-0.5 font-ui text-xs">
          {branch.stateDelta.worldVariables.map((w, i) => (
            <li key={i} className="text-ink-soft">
              {w.worldVariableId} → <span className="font-mono">{w.newValue}</span> — {w.reason}
            </li>
          ))}
          {branch.stateDelta.worldVariables.length === 0 && (
            <li className="text-ink-mute">无</li>
          )}
        </ul>
      </Section>

      <Section
        title={`钩子 · 种植 ${branch.stateDelta.plantedHooks.length} / 兑现 ${branch.stateDelta.paidOffHooks.length}`}
      >
        <ul className="space-y-0.5 font-ui text-xs">
          {branch.stateDelta.plantedHooks.map((h, i) => (
            <li key={`p${i}`} className="text-ink-soft">
              <span className="font-pixel text-pixel-sm text-secondary">+ </span>
              {h.description}
            </li>
          ))}
          {branch.stateDelta.paidOffHooks.map((h, i) => (
            <li key={`o${i}`} className="text-ink-soft">
              <span className="font-pixel text-pixel-sm text-success">✓ </span>
              {h.hookId} — {h.payoffNotes}
            </li>
          ))}
          {branch.stateDelta.plantedHooks.length === 0 &&
            branch.stateDelta.paidOffHooks.length === 0 && (
              <li className="text-ink-mute">无</li>
            )}
        </ul>
      </Section>

      <Section title={`因果链 (${branch.stateDelta.causalLinks.length})`}>
        <ul className="space-y-0.5 font-ui text-xs">
          {branch.stateDelta.causalLinks.map((link, i) => (
            <li key={i} className="text-ink-soft">
              <span className="font-mono">{link.fromSceneRef ?? '∅'} → {link.toSceneRef}</span> ·{' '}
              {link.type} — {link.description}
            </li>
          ))}
          {branch.stateDelta.causalLinks.length === 0 && (
            <li className="text-ink-mute">无</li>
          )}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-pixel text-pixel-sm text-ink-soft">{title}</div>
      <div className="border border-outline-soft rounded-sm bg-surface-raised px-2 py-1">
        {children}
      </div>
    </div>
  );
}

function PacingScoreLine({ result }: { result: SceneSimulationResult }) {
  const { conflictDensity, emotionalIntensity, informationDensity, recommendation } =
    result.pacingScore;
  return (
    <div className="font-ui text-xs text-ink-mute">
      节奏：冲突 {conflictDensity} / 情绪 {emotionalIntensity} / 信息 {informationDensity}
      {recommendation && <span className="ml-2 text-warning">· {recommendation}</span>}
    </div>
  );
}
