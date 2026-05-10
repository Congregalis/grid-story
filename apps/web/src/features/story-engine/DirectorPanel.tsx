import { PixelButton, PixelInput, PixelTextArea } from '@grid-story/pixel-kit';
import type {
  Character,
  DirectorEventScope,
  DriveHorizon,
  DriveStatus,
  HookType,
  Location,
  TensionVector,
} from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { formatApiError } from '../../lib/api';
import { toast } from '../../lib/toast';
import { storyEngineApi } from './api';

type DirectorTab = 'event' | 'pressure' | 'drive' | 'tension' | 'hook';

const PRESSURE_STORAGE_PREFIX = 'grid-story:director-pressure:';

const TABS: { key: DirectorTab; label: string }[] = [
  { key: 'event', label: '事件' },
  { key: 'pressure', label: '环境' },
  { key: 'drive', label: 'Drive' },
  { key: 'tension', label: '关系' },
  { key: 'hook', label: '钩子' },
];

const HORIZON_LABEL: Record<DriveHorizon, string> = {
  short: '短期',
  medium: '中期',
  long: '长期',
};

const STATUS_LABEL: Record<DriveStatus, string> = {
  active: '进行',
  achieved: '完成',
  abandoned: '放弃',
  frustrated: '受阻',
};

const HOOK_LABEL: Record<HookType, string> = {
  foreshadowing: '伏笔',
  debt: '债',
  hidden_object: '隐藏物',
  secret_knowledge: '秘密',
  unfulfilled_promise: '承诺',
  lurking_threat: '威胁',
};

const EVENT_PRESETS = ['亲人病危', '被诬陷', '意外发现', '失业', '中毒'];

interface DirectorPanelProps {
  bookId: string;
  open: boolean;
  characters: Character[];
  locations: Location[];
  currentChapterOrder?: number | null;
  onClose: () => void;
}

function blankTension(): TensionVector {
  return { class: 0, info: 0, emotion: 0 };
}

function targetOptions(scope: DirectorEventScope, characters: Character[], locations: Location[]) {
  if (scope === 'character') {
    return characters.map((character) => ({ id: character.id, label: character.name }));
  }
  if (scope === 'location') {
    return locations.map((location) => ({ id: location.id, label: location.name }));
  }
  return [];
}

function persistPressureSource(bookId: string, value: unknown) {
  try {
    const key = `${PRESSURE_STORAGE_PREFIX}${bookId}`;
    const current = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
    localStorage.setItem(key, JSON.stringify([...current, value].slice(-20)));
  } catch {
    // localStorage may be unavailable; the API response is still returned to the UI.
  }
}

export function DirectorPanel({
  bookId,
  open,
  characters,
  locations,
  currentChapterOrder,
  onClose,
}: DirectorPanelProps) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<DirectorTab>('event');

  const [eventScope, setEventScope] = useState<DirectorEventScope>('character');
  const [eventTargetId, setEventTargetId] = useState('');
  const [eventPreset, setEventPreset] = useState<string | null>(EVENT_PRESETS[0]);
  const [eventDescription, setEventDescription] = useState('');

  const [pressureVariableId, setPressureVariableId] = useState('');
  const [pressureValue, setPressureValue] = useState('');
  const [pressureChapter, setPressureChapter] = useState(currentChapterOrder ?? 1);
  const [pressureReason, setPressureReason] = useState('');

  const [driveId, setDriveId] = useState<string | null>(null);
  const [driveCharacterId, setDriveCharacterId] = useState('');
  const [driveHorizon, setDriveHorizon] = useState<DriveHorizon>('short');
  const [driveDescription, setDriveDescription] = useState('');
  const [driveGoalState, setDriveGoalState] = useState('');
  const [driveMotivation, setDriveMotivation] = useState('');
  const [drivePriority, setDrivePriority] = useState(5);
  const [driveProgress, setDriveProgress] = useState(0);
  const [driveStatus, setDriveStatus] = useState<DriveStatus>('active');
  const [driveReason, setDriveReason] = useState('');

  const [relationshipId, setRelationshipId] = useState('');
  const [tension, setTension] = useState<TensionVector>(() => blankTension());
  const [tensionChapter, setTensionChapter] = useState(currentChapterOrder ?? 1);
  const [tensionReason, setTensionReason] = useState('');

  const [hookType, setHookType] = useState<HookType>('foreshadowing');
  const [hookDescription, setHookDescription] = useState('');
  const [hookCharacters, setHookCharacters] = useState<string[]>([]);
  const [hookEarliest, setHookEarliest] = useState(currentChapterOrder ?? 1);
  const [hookLatest, setHookLatest] = useState((currentChapterOrder ?? 1) + 2);
  const [hookUrgency, setHookUrgency] = useState(5);

  const drivesQuery = useQuery({
    queryKey: ['story-engine', 'drives', bookId],
    queryFn: () => storyEngineApi.listDrives(bookId),
    enabled: open,
  });
  const relationshipsQuery = useQuery({
    queryKey: ['story-engine', 'relationships', bookId],
    queryFn: () => storyEngineApi.listRelationships(bookId),
    enabled: open,
  });
  const variablesQuery = useQuery({
    queryKey: ['story-engine', 'world-variables', bookId],
    queryFn: () => storyEngineApi.listWorldVariables(bookId),
    enabled: open,
  });

  const eventTargets = useMemo(
    () => targetOptions(eventScope, characters, locations),
    [characters, eventScope, locations],
  );
  const characterName = useMemo(() => {
    const map = new Map(characters.map((character) => [character.id, character.name]));
    return (id: string) => map.get(id) ?? id;
  }, [characters]);

  useEffect(() => {
    setEventTargetId(eventTargets[0]?.id ?? '');
  }, [eventTargets]);

  useEffect(() => {
    setPressureChapter(currentChapterOrder ?? 1);
    setTensionChapter(currentChapterOrder ?? 1);
    setHookEarliest(currentChapterOrder ?? 1);
    setHookLatest((currentChapterOrder ?? 1) + 2);
  }, [currentChapterOrder]);

  useEffect(() => {
    const variable = variablesQuery.data?.find((item) => item.id === pressureVariableId);
    if (variable) setPressureValue(variable.currentValue);
  }, [pressureVariableId, variablesQuery.data]);

  useEffect(() => {
    const drive = drivesQuery.data?.find((item) => item.id === driveId);
    if (!drive) return;
    setDriveCharacterId(drive.characterId);
    setDriveHorizon(drive.horizon);
    setDriveDescription(drive.description);
    setDriveGoalState(drive.goalState);
    setDriveMotivation(drive.motivation);
    setDrivePriority(drive.priority);
    setDriveProgress(drive.progress);
    setDriveStatus(drive.status);
  }, [driveId, drivesQuery.data]);

  useEffect(() => {
    const relationship = relationshipsQuery.data?.find((item) => item.id === relationshipId);
    if (relationship) setTension(relationship.currentTension);
  }, [relationshipId, relationshipsQuery.data]);

  const invalidateStoryEngine = (name: string) =>
    qc.invalidateQueries({ queryKey: ['story-engine', name, bookId] });

  const injectEvent = useMutation({
    mutationFn: () =>
      storyEngineApi.injectEvent(bookId, {
        scope: eventScope,
        targetId: eventScope === 'global' ? null : eventTargetId,
        description: eventDescription.trim(),
        preset: eventPreset,
      }),
    onSuccess: (result) => {
      persistPressureSource(bookId, result.pressureSource);
      setEventDescription('');
      toast.success('事件压力源已加入');
    },
    onError: (error: unknown) => toast.error(formatApiError(error, '事件注入失败')),
  });

  const tunePressure = useMutation({
    mutationFn: () =>
      storyEngineApi.tunePressure(bookId, {
        worldVariableId: pressureVariableId,
        toValue: pressureValue.trim(),
        chapter: pressureChapter,
        reason: pressureReason.trim(),
      }),
    onSuccess: () => {
      invalidateStoryEngine('world-variables');
      setPressureReason('');
      toast.success('环境变量已调整');
    },
    onError: (error: unknown) => toast.error(formatApiError(error, '环境调整失败')),
  });

  const editDrive = useMutation({
    mutationFn: () =>
      storyEngineApi.editDrive(bookId, {
        driveId,
        characterId: driveCharacterId || characters[0]?.id || '',
        horizon: driveHorizon,
        description: driveDescription.trim(),
        goalState: driveGoalState.trim(),
        motivation: driveMotivation.trim(),
        priority: drivePriority,
        progress: driveProgress,
        status: driveStatus,
        reason: driveReason.trim(),
      }),
    onSuccess: () => {
      invalidateStoryEngine('drives');
      setDriveReason('');
      toast.success('Drive 已调整');
    },
    onError: (error: unknown) => toast.error(formatApiError(error, 'Drive 调整失败')),
  });

  const tuneRelationship = useMutation({
    mutationFn: () =>
      storyEngineApi.tuneTension(bookId, {
        relationshipId,
        currentTension: tension,
        chapter: tensionChapter,
        reason: tensionReason.trim(),
      }),
    onSuccess: () => {
      invalidateStoryEngine('relationships');
      setTensionReason('');
      toast.success('关系张力已调整');
    },
    onError: (error: unknown) => toast.error(formatApiError(error, '关系调整失败')),
  });

  const plantHook = useMutation({
    mutationFn: () =>
      storyEngineApi.plantHook(bookId, {
        type: hookType,
        description: hookDescription.trim(),
        involvedCharacters: hookCharacters,
        involvedEntities: [],
        plantedAtChapter: currentChapterOrder ?? 1,
        plantedScene: null,
        preferredPayoffWindow: {
          earliestChapter: hookEarliest,
          latestChapter: hookLatest,
        },
        urgency: hookUrgency,
        notes: null,
      }),
    onSuccess: () => {
      invalidateStoryEngine('hooks');
      setHookDescription('');
      toast.success('钩子已投放');
    },
    onError: (error: unknown) => toast.error(formatApiError(error, '钩子投放失败')),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        className="absolute inset-0 bg-ink/30"
        aria-label="关闭导演台"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[460px] overflow-y-auto border-l-2 border-outline bg-surface shadow-pixel-2">
        <header className="sticky top-0 z-10 border-b-2 border-outline bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-pixel text-pixel-md">导演台</h2>
            <PixelButton size="sm" variant="ghost" onClick={onClose}>
              关闭
            </PixelButton>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`h-8 rounded-sm border-2 font-pixel text-pixel-sm ${
                  tab === item.key
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-outline text-ink-mute hover:text-ink'
                }`}
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <div className="space-y-4 p-4">
          {tab === 'event' && (
            <section className="space-y-3">
              <select
                className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
                value={eventScope}
                onChange={(event) => setEventScope(event.target.value as DirectorEventScope)}
              >
                <option value="character">角色</option>
                <option value="location">地点</option>
                <option value="global">全局</option>
              </select>
              {eventScope !== 'global' && (
                <select
                  className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
                  value={eventTargetId}
                  onChange={(event) => setEventTargetId(event.target.value)}
                >
                  {eventTargets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.label}
                    </option>
                  ))}
                </select>
              )}
              <select
                className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
                value={eventPreset ?? ''}
                onChange={(event) => setEventPreset(event.target.value || null)}
              >
                <option value="">自定义</option>
                {EVENT_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
              <PixelTextArea
                rows={5}
                value={eventDescription}
                onChange={(event) => setEventDescription(event.target.value)}
                placeholder="事件描述"
              />
              <PixelButton
                className="w-full"
                disabled={!eventDescription.trim() || injectEvent.isPending}
                onClick={() => injectEvent.mutate()}
              >
                {injectEvent.isPending ? '注入中…' : '注入事件'}
              </PixelButton>
            </section>
          )}

          {tab === 'pressure' && (
            <section className="space-y-3">
              <select
                className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
                value={pressureVariableId}
                onChange={(event) => setPressureVariableId(event.target.value)}
              >
                <option value="">选择变量</option>
                {variablesQuery.data?.map((variable) => (
                  <option key={variable.id} value={variable.id}>
                    {variable.name}
                  </option>
                ))}
              </select>
              <PixelInput
                value={pressureValue}
                onChange={(event) => setPressureValue(event.target.value)}
                placeholder="新值"
              />
              <PixelInput
                type="number"
                min={1}
                value={pressureChapter}
                onChange={(event) => setPressureChapter(Number(event.target.value) || 1)}
              />
              <PixelTextArea
                rows={4}
                value={pressureReason}
                onChange={(event) => setPressureReason(event.target.value)}
                placeholder="原因"
              />
              <PixelButton
                className="w-full"
                disabled={
                  !pressureVariableId ||
                  !pressureValue.trim() ||
                  !pressureReason.trim() ||
                  tunePressure.isPending
                }
                onClick={() => tunePressure.mutate()}
              >
                {tunePressure.isPending ? '调整中…' : '调整环境'}
              </PixelButton>
            </section>
          )}

          {tab === 'drive' && (
            <section className="space-y-3">
              <select
                className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
                value={driveId ?? ''}
                onChange={(event) => setDriveId(event.target.value || null)}
              >
                <option value="">觉醒新 Drive</option>
                {drivesQuery.data?.map((drive) => (
                  <option key={drive.id} value={drive.id}>
                    {characterName(drive.characterId)} · {drive.description}
                  </option>
                ))}
              </select>
              <select
                className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
                value={driveCharacterId || characters[0]?.id || ''}
                onChange={(event) => setDriveCharacterId(event.target.value)}
              >
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </select>
              <select
                className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
                value={driveHorizon}
                onChange={(event) => setDriveHorizon(event.target.value as DriveHorizon)}
              >
                {Object.entries(HORIZON_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <PixelInput
                value={driveDescription}
                onChange={(event) => setDriveDescription(event.target.value)}
                placeholder="Drive"
              />
              <PixelInput
                value={driveGoalState}
                onChange={(event) => setDriveGoalState(event.target.value)}
                placeholder="目标状态"
              />
              <PixelTextArea
                rows={3}
                value={driveMotivation}
                onChange={(event) => setDriveMotivation(event.target.value)}
                placeholder="动机"
              />
              <label className="block">
                <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">
                  优先级 {drivePriority}
                </span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={drivePriority}
                  className="w-full accent-primary"
                  onChange={(event) => setDrivePriority(Number(event.target.value))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">
                  进度 {driveProgress}%
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={driveProgress}
                  className="w-full accent-primary"
                  onChange={(event) => setDriveProgress(Number(event.target.value))}
                />
              </label>
              <select
                className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
                value={driveStatus}
                onChange={(event) => setDriveStatus(event.target.value as DriveStatus)}
              >
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <PixelTextArea
                rows={4}
                value={driveReason}
                onChange={(event) => setDriveReason(event.target.value)}
                placeholder="理由"
              />
              <PixelButton
                className="w-full"
                disabled={
                  !driveReason.trim() ||
                  !driveDescription.trim() ||
                  !driveGoalState.trim() ||
                  !driveMotivation.trim() ||
                  editDrive.isPending
                }
                onClick={() => editDrive.mutate()}
              >
                {editDrive.isPending ? '调整中…' : '调整 Drive'}
              </PixelButton>
            </section>
          )}

          {tab === 'tension' && (
            <section className="space-y-3">
              <select
                className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
                value={relationshipId}
                onChange={(event) => setRelationshipId(event.target.value)}
              >
                <option value="">选择关系</option>
                {relationshipsQuery.data?.map((relationship) => (
                  <option key={relationship.id} value={relationship.id}>
                    {characterName(relationship.fromCharacterId)} →{' '}
                    {characterName(relationship.toCharacterId)}
                  </option>
                ))}
              </select>
              {(['class', 'info', 'emotion'] as const).map((axis) => (
                <label key={axis} className="block">
                  <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">
                    {axis} {tension[axis]}
                  </span>
                  <input
                    type="range"
                    min={-10}
                    max={10}
                    value={tension[axis]}
                    className="w-full accent-primary"
                    onChange={(event) =>
                      setTension((prev) => ({ ...prev, [axis]: Number(event.target.value) }))
                    }
                  />
                </label>
              ))}
              <PixelInput
                type="number"
                min={1}
                value={tensionChapter}
                onChange={(event) => setTensionChapter(Number(event.target.value) || 1)}
              />
              <PixelTextArea
                rows={4}
                value={tensionReason}
                onChange={(event) => setTensionReason(event.target.value)}
                placeholder="原因"
              />
              <PixelButton
                className="w-full"
                disabled={!relationshipId || !tensionReason.trim() || tuneRelationship.isPending}
                onClick={() => tuneRelationship.mutate()}
              >
                {tuneRelationship.isPending ? '调整中…' : '调整关系'}
              </PixelButton>
            </section>
          )}

          {tab === 'hook' && (
            <section className="space-y-3">
              <select
                className="h-8 w-full rounded-sm border-2 border-outline bg-surface-raised px-2 font-ui text-sm text-ink"
                value={hookType}
                onChange={(event) => setHookType(event.target.value as HookType)}
              >
                {Object.entries(HOOK_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <PixelTextArea
                rows={5}
                value={hookDescription}
                onChange={(event) => setHookDescription(event.target.value)}
                placeholder="钩子描述"
              />
              <div className="grid grid-cols-2 gap-2">
                {characters.map((character) => (
                  <label key={character.id} className="flex items-center gap-2 font-ui text-sm">
                    <input
                      type="checkbox"
                      checked={hookCharacters.includes(character.id)}
                      onChange={(event) =>
                        setHookCharacters((prev) =>
                          event.target.checked
                            ? [...prev, character.id]
                            : prev.filter((id) => id !== character.id),
                        )
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    <span>{character.name}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <PixelInput
                  type="number"
                  min={1}
                  value={hookEarliest}
                  onChange={(event) => setHookEarliest(Number(event.target.value) || 1)}
                />
                <PixelInput
                  type="number"
                  min={1}
                  value={hookLatest}
                  onChange={(event) => setHookLatest(Number(event.target.value) || 1)}
                />
              </div>
              <label className="block">
                <span className="mb-1 block font-pixel text-pixel-sm text-ink-soft">
                  紧急度 {hookUrgency}
                </span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={hookUrgency}
                  className="w-full accent-primary"
                  onChange={(event) => setHookUrgency(Number(event.target.value))}
                />
              </label>
              <PixelButton
                className="w-full"
                disabled={
                  !hookDescription.trim() || hookLatest < hookEarliest || plantHook.isPending
                }
                onClick={() => plantHook.mutate()}
              >
                {plantHook.isPending ? '投放中…' : '投放钩子'}
              </PixelButton>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
