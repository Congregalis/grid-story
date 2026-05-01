import { useEffect, useState } from 'react';
import { PixelButton, PixelDialog } from '@grid-story/pixel-kit';
import { api, ApiError } from '../../lib/api';
import { toast } from '../../lib/toast';
import {
  entityConfigs,
  type EntityFormValues,
} from './entity-config';
import type {
  StarterBibleCharacterCard,
  StarterBibleConceptCard,
  StarterBibleDraft,
  StarterBibleItemCard,
  StarterBibleLocationCard,
  StarterBibleOrganizationCard,
  StarterBibleTimelineEventCard,
} from '@grid-story/schema';

type Phase = 'idle' | 'generating' | 'preview' | 'writing' | 'error';

interface BibleContextSummary {
  characters: number;
  locations: number;
  organizations: number;
  items: number;
  concepts: number;
  timelineEvents: number;
  total: number;
}

interface GenerateStarterResponse {
  ok: boolean;
  bookId: string;
  counts: {
    characters: number;
    locations: number;
    organizations: number;
    items: number;
    concepts: number;
    timelineEvents: number;
    total: number;
  };
  starterBible: StarterBibleDraft;
}

interface PreviewItem {
  id: string;
  sectionLabel: string;
  path: string;
  title: string;
  summary: string;
  details: string[];
  payload: EntityFormValues;
}

interface CommonStarterCard {
  summary: string;
  storyRole: string | null;
  conflictHook: string | null;
  connections: string[];
}

export interface StarterBibleDialogProps {
  open: boolean;
  bookId: string;
  onClose: () => void;
  onWritten: () => void;
}

function labelValue(label: string, value: string | null | undefined): string | null {
  return value ? `${label}：${value}` : null;
}

function compact(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

function formatConnections(connections: string[]): string | null {
  return connections.length > 0 ? `关联：${connections.join('；')}` : null;
}

function formatNotes(card: CommonStarterCard, extra: Array<string | null | undefined>): string | null {
  const parts = compact([
    ...extra,
    labelValue('叙事功能', card.storyRole),
    labelValue('冲突钩子', card.conflictHook),
    formatConnections(card.connections),
  ]);
  return parts.length > 0 ? parts.join('\n') : null;
}

function apiErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const body =
      typeof error.body === 'string'
        ? error.body
        : JSON.stringify(error.body).slice(0, 300);
    return `后端 ${error.status}: ${body}`;
  }
  return (error as Error)?.message ?? '调用失败';
}

function characterItem(
  bookId: string,
  card: StarterBibleCharacterCard,
  index: number,
): PreviewItem {
  return {
    id: `characters:${index}`,
    sectionLabel: '角色',
    path: entityConfigs.character.path,
    title: card.name,
    summary: card.summary,
    details: compact([card.storyRole, card.conflictHook, card.motivation, card.contradiction]),
    payload: {
      ...entityConfigs.character.emptyValues(bookId),
      name: card.name,
      background: card.summary,
      motivation: card.motivation,
      personality: card.contradiction ? `内在矛盾：${card.contradiction}` : null,
      notes: formatNotes(card, [
        labelValue('动机', card.motivation),
        labelValue('内在矛盾', card.contradiction),
      ]),
    },
  };
}

function locationItem(
  bookId: string,
  card: StarterBibleLocationCard,
  index: number,
): PreviewItem {
  return {
    id: `locations:${index}`,
    sectionLabel: '地点',
    path: entityConfigs.location.path,
    title: card.name,
    summary: card.summary,
    details: compact([card.type, card.atmosphere, card.storyRole, card.conflictHook]),
    payload: {
      ...entityConfigs.location.emptyValues(bookId),
      name: card.name,
      type: card.type,
      description: card.summary,
      atmosphere: card.atmosphere,
      significance: card.storyRole,
      notes: formatNotes(card, []),
    },
  };
}

function organizationItem(
  bookId: string,
  card: StarterBibleOrganizationCard,
  index: number,
): PreviewItem {
  return {
    id: `organizations:${index}`,
    sectionLabel: '组织',
    path: entityConfigs.organization.path,
    title: card.name,
    summary: card.summary,
    details: compact([card.type, card.goal, card.storyRole, card.conflictHook]),
    payload: {
      ...entityConfigs.organization.emptyValues(bookId),
      name: card.name,
      type: card.type,
      description: card.summary,
      goals: card.goal,
      notes: formatNotes(card, []),
    },
  };
}

function itemItem(
  bookId: string,
  card: StarterBibleItemCard,
  index: number,
): PreviewItem {
  return {
    id: `items:${index}`,
    sectionLabel: '物品',
    path: entityConfigs.item.path,
    title: card.name,
    summary: card.summary,
    details: compact([card.type, card.ability, card.significance, card.conflictHook]),
    payload: {
      ...entityConfigs.item.emptyValues(bookId),
      name: card.name,
      type: card.type,
      description: card.summary,
      abilities: card.ability ? [card.ability] : [],
      significance: card.significance ?? card.storyRole,
      notes: formatNotes(card, []),
    },
  };
}

function conceptItem(
  bookId: string,
  card: StarterBibleConceptCard,
  index: number,
): PreviewItem {
  return {
    id: `concepts:${index}`,
    sectionLabel: '概念',
    path: entityConfigs.concept.path,
    title: card.name,
    summary: card.summary,
    details: compact([card.category, card.rules, card.storyRole, card.conflictHook]),
    payload: {
      ...entityConfigs.concept.emptyValues(bookId),
      name: card.name,
      category: card.category,
      description: card.summary,
      rules: card.rules,
      notes: formatNotes(card, []),
    },
  };
}

function timelineEventItem(
  bookId: string,
  card: StarterBibleTimelineEventCard,
  index: number,
): PreviewItem {
  return {
    id: `timeline_events:${index}`,
    sectionLabel: '时间线',
    path: entityConfigs.timelineEvent.path,
    title: card.title,
    summary: card.summary,
    details: compact([card.timestamp, `#${card.order}`, card.storyRole, card.conflictHook]),
    payload: {
      ...entityConfigs.timelineEvent.emptyValues(bookId),
      title: card.title,
      description: card.summary,
      timestamp: card.timestamp,
      order: card.order,
      notes: formatNotes(card, []),
    },
  };
}

function toPreviewItems(bookId: string, draft: StarterBibleDraft): PreviewItem[] {
  return [
    ...draft.characters.map((card, index) => characterItem(bookId, card, index)),
    ...draft.locations.map((card, index) => locationItem(bookId, card, index)),
    ...draft.organizations.map((card, index) => organizationItem(bookId, card, index)),
    ...draft.items.map((card, index) => itemItem(bookId, card, index)),
    ...draft.concepts.map((card, index) => conceptItem(bookId, card, index)),
    ...draft.timeline_events.map((card, index) => timelineEventItem(bookId, card, index)),
  ];
}

export function StarterBibleDialog({
  open,
  bookId,
  onClose,
  onWritten,
}: StarterBibleDialogProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ saved: number; total: number } | null>(null);
  const [ctxSummary, setCtxSummary] = useState<BibleContextSummary | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);

  const selectedCount = items.filter((item) => selectedIds.has(item.id)).length;

  async function fetchContextSummary() {
    setCtxLoading(true);
    try {
      const types = ['characters', 'locations', 'organizations', 'items', 'concepts', 'timelineEvents'] as const;
      const results = await Promise.all(
        types.map((t) =>
          api.get<unknown[]>(`/bible/${t}?bookId=${encodeURIComponent(bookId)}`).then((arr) => arr.length),
        ),
      );
      const [characters, locations, organizations, items, concepts, timelineEvents] = results;
      setCtxSummary({
        characters,
        locations,
        organizations,
        items,
        concepts,
        timelineEvents,
        total: characters + locations + organizations + items + concepts + timelineEvents,
      });
    } catch {
      setCtxSummary(null);
    } finally {
      setCtxLoading(false);
    }
  }

  async function generateStarter() {
    setPhase('generating');
    setError(null);
    setProgress(null);
    setItems([]);
    setSelectedIds(new Set());
    try {
      const response = await api.post<GenerateStarterResponse>('/agent/bible/generate-starter', {
        bookId,
      });
      const nextItems = toPreviewItems(bookId, response.starterBible);
      setItems(nextItems);
      setSelectedIds(new Set(nextItems.map((item) => item.id)));
      setPhase('preview');
    } catch (err) {
      setError(apiErrorText(err));
      setPhase('error');
    }
  }

  useEffect(() => {
    if (!open) return;
    clearState();
    setPhase('idle');
    void fetchContextSummary();
  }, [open, bookId]);

  function clearState() {
    setItems([]);
    setSelectedIds(new Set());
    setError(null);
    setProgress(null);
    setCtxSummary(null);
    setPhase('idle');
  }

  function resetAndClose() {
    if (phase === 'generating' || phase === 'writing') return;
    clearState();
    onClose();
  }

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selectedCount === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((item) => item.id)));
    }
  }

  async function writeSelected() {
    const selected = items.filter((item) => selectedIds.has(item.id));
    if (selected.length === 0) return;

    setPhase('writing');
    setError(null);
    setProgress({ saved: 0, total: selected.length });

    try {
      let saved = 0;
      for (const item of selected) {
        await api.post(`/bible/${item.path}`, item.payload);
        saved += 1;
        setProgress({ saved, total: selected.length });
      }
      onWritten();
      toast.success(`已写入 ${selected.length} 个 entity`);
      clearState();
      onClose();
    } catch (err) {
      setError(apiErrorText(err));
      setPhase('error');
    }
  }

  return (
    <PixelDialog
      open={open}
      onClose={resetAndClose}
      title="AI 启动 Bible"
      className="!max-w-[880px]"
      footer={
        phase === 'idle' ? (
          <>
            <PixelButton variant="ghost" onClick={resetAndClose}>
              取消
            </PixelButton>
            <PixelButton
              disabled={ctxLoading}
              onClick={() => void generateStarter()}
            >
              开始生成
            </PixelButton>
          </>
        ) : phase === 'preview' ? (
          <>
            <PixelButton variant="ghost" onClick={toggleAll}>
              {selectedCount === items.length ? '全不选' : '全选'}
            </PixelButton>
            <PixelButton variant="ghost" onClick={() => void generateStarter()}>
              重新生成
            </PixelButton>
            <PixelButton disabled={selectedCount === 0} onClick={() => void writeSelected()}>
              写入选中项 ({selectedCount})
            </PixelButton>
          </>
        ) : phase === 'error' ? (
          <>
            <PixelButton variant="ghost" onClick={resetAndClose}>
              关闭
            </PixelButton>
            <PixelButton onClick={() => void generateStarter()}>
              重试
            </PixelButton>
          </>
        ) : (
          <PixelButton variant="ghost" disabled>
            {phase === 'writing' ? '写入中…' : '生成中…'}
          </PixelButton>
        )
      }
    >
      <div className="space-y-3">
        {phase === 'idle' && (
          <div className="space-y-3">
            <p className="font-ui text-sm text-ink">
              将基于 Story Charter 和已有的 Bible 设定，让 AI 一次生成一组互相咬合的初始草案卡片。
            </p>
            <div className="border-2 border-outline bg-surface-raised p-3 space-y-2">
              <p className="font-pixel text-pixel-sm text-ink-soft">生成上下文</p>
              {ctxLoading && (
                <p className="font-ui text-sm text-ink-soft">正在获取已有设定…</p>
              )}
              {ctxSummary && (
                <div className="font-ui text-sm text-ink-soft space-y-1">
                  <p>
                    已有设定：
                    {ctxSummary.total > 0 ? (
                      <span className="text-ink">
                        {' '}{ctxSummary.characters > 0 && `${ctxSummary.characters} 角色 `}
                        {ctxSummary.locations > 0 && `${ctxSummary.locations} 地点 `}
                        {ctxSummary.organizations > 0 && `${ctxSummary.organizations} 组织 `}
                        {ctxSummary.items > 0 && `${ctxSummary.items} 物品 `}
                        {ctxSummary.concepts > 0 && `${ctxSummary.concepts} 概念 `}
                        {ctxSummary.timelineEvents > 0 && `${ctxSummary.timelineEvents} 事件`}
                      </span>
                    ) : (
                      <span>（空，将从零生成）</span>
                    )}
                  </p>
                  <p>AI 会基于 Charter 约束 + 已有设定，避免重复、补缺口、制造可接续的张力。</p>
                  <p className="text-ink-mute">预计需要 15–30 秒</p>
                </div>
              )}
              {!ctxLoading && !ctxSummary && (
                <p className="font-ui text-sm text-ink-mute">无法获取设定统计，仍可继续生成。</p>
              )}
            </div>
          </div>
        )}

        {phase === 'generating' && (
          <div className="space-y-3">
            <p className="font-ui text-sm text-primary">正在调用 AI 生成启动设定…</p>
            <div className="border-2 border-outline bg-surface-raised p-3">
              <div className="flex items-center gap-2">
                <span className="font-pixel text-pixel-md text-primary animate-pulse">◆</span>
                <span className="font-ui text-sm text-ink-soft">
                  {ctxSummary && ctxSummary.total > 0
                    ? `基于 Charter + 已有 ${ctxSummary.total} 个 entity 作为上下文，等待 AI 响应…`
                    : '基于 Charter 从零构思，等待 AI 响应…'}
                </span>
              </div>
            </div>
          </div>
        )}

        {phase === 'preview' && (
          <>
            <p className="font-ui text-sm text-success">
              已生成 {items.length} 张草案卡片，可勾选后写入 Bible。
            </p>
            <div className="max-h-[60vh] space-y-2 overflow-auto pr-2 pixel-scrollbar">
              {items.map((item) => (
                <label
                  key={item.id}
                  className="block cursor-pointer border-2 border-outline-soft bg-surface-raised p-3 hover:border-primary"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-primary"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="font-pixel text-pixel-sm bg-primary text-on-primary px-1.5 py-0.5">
                          {item.sectionLabel}
                        </span>
                        <strong className="font-ui text-sm text-ink">{item.title}</strong>
                      </div>
                      <p className="font-ui text-sm text-ink-soft">{item.summary}</p>
                      {item.details.length > 0 && (
                        <p className="mt-1 font-ui text-xs text-ink-mute">
                          {item.details.join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        {phase === 'writing' && progress && (
          <div>
            <p className="font-ui text-sm text-primary mb-2">
              正在写入… {progress.saved} / {progress.total}
            </p>
            <div className="h-2 bg-outline-soft">
              <div
                className="h-full bg-primary transition-[width]"
                style={{
                  width: `${progress.total > 0 ? Math.round((progress.saved / progress.total) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="break-words border-2 border-danger px-3 py-2 font-ui text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </PixelDialog>
  );
}
