import { PixelButton, PixelInput, PixelTextArea } from '@grid-story/pixel-kit';
import type { Character, Location, SceneInitialConditions } from '@grid-story/schema';
import { useEffect, useState } from 'react';

export interface SceneRunnerSubmit {
  presentCharacterIds: string[];
  locationId: string | null;
  timeContext: string;
  sceneIndex: number;
  alternativeCount: number;
  authorConstraints: string[] | null;
  pressureSources: SceneInitialConditions['pressureSources'];
  simulationMode: 'group' | 'multi-agent';
}

export interface SceneRunnerPrefill {
  presentCharacterIds?: string[];
  locationId?: string | null;
  timeContext?: string;
  pressureSources?: SceneInitialConditions['pressureSources'];
  authorConstraints?: string[] | null;
  alternativeCount?: number;
}

interface SceneRunnerProps {
  characters: Character[];
  locations: Location[];
  defaultSceneIndex?: number;
  pending: boolean;
  onSubmit: (input: SceneRunnerSubmit) => void;
  /** 外部强制填充（autopilot / AI 建议）。每次引用变更触发覆盖 */
  prefill?: SceneRunnerPrefill | null;
  /** "✨ AI 填充" 按钮的 onClick。null/undef 隐藏按钮 */
  onAiFill?: () => void;
  aiFilling?: boolean;
}

export function SceneRunner({
  characters,
  locations,
  defaultSceneIndex = 0,
  pending,
  onSubmit,
  prefill,
  onAiFill,
  aiFilling,
}: SceneRunnerProps) {
  const [present, setPresent] = useState<string[]>([]);
  const [locationId, setLocationId] = useState<string>('');
  const [timeContext, setTimeContext] = useState('');
  const [sceneIndex, setSceneIndex] = useState(defaultSceneIndex);
  const [alternativeCount, setAlternativeCount] = useState(2);
  const [constraints, setConstraints] = useState('');
  const [pressureNote, setPressureNote] = useState('');

  useEffect(() => {
    if (!prefill) return;
    if (prefill.presentCharacterIds) setPresent(prefill.presentCharacterIds);
    if (prefill.locationId !== undefined) setLocationId(prefill.locationId ?? '');
    if (prefill.timeContext !== undefined) setTimeContext(prefill.timeContext);
    if (prefill.alternativeCount !== undefined) setAlternativeCount(prefill.alternativeCount);
    if (prefill.authorConstraints !== undefined) {
      setConstraints((prefill.authorConstraints ?? []).join('\n'));
    }
    if (prefill.pressureSources && prefill.pressureSources.length > 0) {
      setPressureNote(prefill.pressureSources.map((p) => p.description).join('\n'));
    }
  }, [prefill]);

  const togglePresent = (id: string) => {
    setPresent((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const valid = present.length >= 1 && timeContext.trim().length >= 1;

  const handleRun = () => {
    if (!valid) return;
    const constraintList = constraints
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const pressureSources = pressureNote.trim()
      ? [
          {
            type: 'author_event' as const,
            description: pressureNote.trim(),
            sourceId: null,
          },
        ]
      : [];
    onSubmit({
      presentCharacterIds: present,
      locationId: locationId || null,
      timeContext: timeContext.trim(),
      sceneIndex,
      alternativeCount,
      authorConstraints: constraintList.length > 0 ? constraintList : null,
      pressureSources,
      simulationMode: 'group',
    });
  };

  return (
    <section className="space-y-3">
      <div>
        <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">
          出场角色 ({present.length})
        </span>
        <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto pixel-scrollbar pr-1">
          {characters.map((character) => (
            <label
              key={character.id}
              className="flex items-center gap-2 font-ui text-sm border border-outline-soft rounded-sm bg-surface-raised px-2 py-1"
            >
              <input
                type="checkbox"
                checked={present.includes(character.id)}
                onChange={() => togglePresent(character.id)}
                className="h-4 w-4 accent-primary"
              />
              <span className="truncate">{character.name}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">地点</span>
        <select
          className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
        >
          <option value="">不指定</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">时间 / 场景背景</span>
        <PixelInput
          value={timeContext}
          onChange={(event) => setTimeContext(event.target.value)}
          placeholder="深夜茶寮 / 三日后清晨"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">
            sceneIndex {sceneIndex}
          </span>
          <PixelInput
            type="number"
            min={0}
            value={sceneIndex}
            onChange={(event) => setSceneIndex(Math.max(0, Number(event.target.value) || 0))}
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">
            候选分支 {alternativeCount}
          </span>
          <input
            type="range"
            min={2}
            max={4}
            value={alternativeCount}
            className="w-full accent-primary"
            onChange={(event) => setAlternativeCount(Number(event.target.value))}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">
          作者硬约束 (每行一条)
        </span>
        <PixelTextArea
          rows={2}
          value={constraints}
          onChange={(event) => setConstraints(event.target.value)}
          placeholder="不准死人&#10;必须出现门外脚步声"
        />
      </label>

      <label className="block">
        <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">外部压力源 (可选)</span>
        <PixelTextArea
          rows={2}
          value={pressureNote}
          onChange={(event) => setPressureNote(event.target.value)}
          placeholder="信使送来一封血书"
        />
      </label>

      <fieldset className="block">
        <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">模拟模式</span>
        <div className="flex gap-2">
          <label className="flex items-center gap-1 font-ui text-sm">
            <input type="radio" name="sim-mode" defaultChecked className="accent-primary" />
            group · 单 LLM 群戏
          </label>
          <label
            className="flex items-center gap-1 font-ui text-sm text-ink-mute opacity-60 cursor-not-allowed"
            title="multi-agent 模式将在 V2 提供"
          >
            <input type="radio" name="sim-mode" disabled className="accent-primary" />
            multi-agent · V2 计划
          </label>
        </div>
      </fieldset>

      <div className="flex gap-2">
        {onAiFill && (
          <PixelButton
            variant="ghost"
            className="flex-shrink-0"
            disabled={pending || aiFilling}
            onClick={onAiFill}
            title="基于已发生场景 + Bible 状态自动填充字段"
          >
            {aiFilling ? '建议中…' : '✨ AI 填充'}
          </PixelButton>
        )}
        <PixelButton className="flex-1" disabled={!valid || pending} onClick={handleRun}>
          {pending ? '推演中…' : '运行模拟'}
        </PixelButton>
      </div>
    </section>
  );
}
