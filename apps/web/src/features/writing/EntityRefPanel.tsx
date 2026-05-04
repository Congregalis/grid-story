import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Character, Item, Location, Organization } from '@grid-story/schema';
import { api } from '../../lib/api';

interface EntityCard {
  type: 'character' | 'location' | 'organization' | 'item';
  id: string;
  name: string;
  /** Compact subtitle (role / category) */
  meta: string;
  /** Rich preview text when expanded */
  preview: string;
}

const TAG_COLOR: Record<EntityCard['type'], string> = {
  character: 'bg-secondary-soft text-secondary border-secondary',
  location: 'bg-success/10 text-success border-success',
  organization: 'bg-primary-soft text-primary border-primary',
  item: 'bg-warning/10 text-warning border-warning',
};

const TAG_LABEL: Record<EntityCard['type'], string> = {
  character: '角色',
  location: '地点',
  organization: '组织',
  item: '物品',
};

function charPreview(c: Character): string {
  const parts: string[] = [];
  if (c.gender) parts.push(c.gender === 'male' ? '男' : c.gender === 'female' ? '女' : '其他');
  if (c.age) parts.push(c.age);
  if (c.species) parts.push(c.species);
  const header = parts.length > 0 ? parts.join(' · ') : '';
  const lines: string[] = [];
  if (header) lines.push(header);
  if (c.personality) lines.push(c.personality.length > 80 ? c.personality.slice(0, 80) + '…' : c.personality);
  if (c.background) lines.push(c.background.length > 100 ? c.background.slice(0, 100) + '…' : c.background);
  return lines.join('\n');
}

function locPreview(l: Location): string {
  const lines: string[] = [];
  if (l.type) lines.push(l.type);
  if (l.description) lines.push(l.description.length > 120 ? l.description.slice(0, 120) + '…' : l.description);
  if (l.atmosphere) lines.push('氛围：' + l.atmosphere);
  return lines.join('\n');
}

function orgPreview(o: Organization): string {
  const lines: string[] = [];
  if (o.type) lines.push(o.type);
  if (o.description) lines.push(o.description.length > 120 ? o.description.slice(0, 120) + '…' : o.description);
  if (o.goals) lines.push('目标：' + o.goals);
  return lines.join('\n');
}

function itemPreview(i: Item): string {
  const lines: string[] = [];
  if (i.type) lines.push(i.type);
  if (i.description) lines.push(i.description.length > 120 ? i.description.slice(0, 120) + '…' : i.description);
  if (i.significance) lines.push('意义：' + i.significance);
  return lines.join('\n');
}

function matchEntities(
  content: string,
  characters: Character[],
  locations: Location[],
  organizations: Organization[],
  items: Item[],
  pinned: Set<string>,
): EntityCard[] {
  const result: EntityCard[] = [];
  const lower = content.toLowerCase();

  for (const c of characters) {
    if (!c.name.trim()) continue;
    const matched = pinned.has(c.id) ||
      lower.includes(c.name.trim().toLowerCase()) ||
      c.aliases.some((a) => a.trim() && lower.includes(a.trim().toLowerCase()));
    if (!matched) continue;
    const meta = [c.gender ? (c.gender === 'male' ? '男' : c.gender === 'female' ? '女' : '其他') : '', c.age ?? '']
      .filter(Boolean).join(' · ');
    result.push({
      type: 'character', id: c.id, name: c.name.trim(),
      meta: meta || (c.species ?? ''),
      preview: charPreview(c),
    });
  }

  for (const loc of locations) {
    if (!loc.name.trim()) continue;
    if (!pinned.has(loc.id) && !lower.includes(loc.name.trim().toLowerCase())) continue;
    result.push({
      type: 'location', id: loc.id, name: loc.name.trim(),
      meta: loc.type ?? '',
      preview: locPreview(loc),
    });
  }

  for (const org of organizations) {
    if (!org.name.trim()) continue;
    if (!pinned.has(org.id) && !lower.includes(org.name.trim().toLowerCase())) continue;
    result.push({
      type: 'organization', id: org.id, name: org.name.trim(),
      meta: org.type ?? '',
      preview: orgPreview(org),
    });
  }

  for (const it of items) {
    if (!it.name.trim()) continue;
    if (!pinned.has(it.id) && !lower.includes(it.name.trim().toLowerCase())) continue;
    result.push({
      type: 'item', id: it.id, name: it.name.trim(),
      meta: it.type ?? '',
      preview: itemPreview(it),
    });
  }

  return result;
}

interface EntityRefPanelProps {
  bookId: string;
  content: string;
  /** Card ID to auto-expand, format: "character-{id}" */
  highlightedId?: string | null;
}

export function EntityRefPanel({
  bookId,
  content,
  highlightedId,
}: EntityRefPanelProps) {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const chars = useQuery<Character[]>({
    queryKey: ['bible-entities', bookId, 'character'],
    queryFn: () => api.get<Character[]>(`/bible/characters?bookId=${encodeURIComponent(bookId)}`),
    staleTime: 120_000,
  });
  const locs = useQuery<Location[]>({
    queryKey: ['bible-entities', bookId, 'location'],
    queryFn: () => api.get<Location[]>(`/bible/locations?bookId=${encodeURIComponent(bookId)}`),
    staleTime: 120_000,
  });
  const orgs = useQuery<Organization[]>({
    queryKey: ['bible-entities', bookId, 'organization'],
    queryFn: () =>
      api.get<Organization[]>(`/bible/organizations?bookId=${encodeURIComponent(bookId)}`),
    staleTime: 120_000,
  });
  const its = useQuery<Item[]>({
    queryKey: ['bible-entities', bookId, 'item'],
    queryFn: () => api.get<Item[]>(`/bible/items?bookId=${encodeURIComponent(bookId)}`),
    staleTime: 120_000,
  });

  const cards = useMemo(
    () =>
      matchEntities(
        content,
        chars.data ?? [],
        locs.data ?? [],
        orgs.data ?? [],
        its.data ?? [],
        pinnedIds,
      ),
    [content, chars.data, locs.data, orgs.data, its.data, pinnedIds],
  );

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const anyLoading = chars.isLoading || locs.isLoading || orgs.isLoading || its.isLoading;

  // Auto-expand & scroll when highlightedId changes (e.g. from entity click in editor)
  useEffect(() => {
    if (highlightedId) {
      setExpandedId(highlightedId);
      // Wait for the card to render, then scroll it into view
      requestAnimationFrame(() => {
        const el = cardRefs.current.get(highlightedId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }
  }, [highlightedId]);

  return (
    <aside className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-2">
      <h3 className="font-pixel text-pixel-sm text-ink-soft mb-1.5">相关设定</h3>
      {anyLoading && <p className="font-ui text-xs text-ink-mute">加载中…</p>}
      {!anyLoading && cards.length === 0 && (
        <p className="font-ui text-xs text-ink-mute">
          {content.trim()
            ? '未检测到已知实体'
            : '选择章节后显示'}
        </p>
      )}
      {cards.length > 0 && (
        <ul className="space-y-0.5">
          {cards.map((c) => {
            const cardId = `${c.type}-${c.id}`;
            const isExpanded = expandedId === cardId;
            return (
              <li
                key={cardId}
                ref={(el) => {
                  if (el) cardRefs.current.set(cardId, el);
                  else cardRefs.current.delete(cardId);
                }}
              >
                <button
                  type="button"
                  className={`w-full text-left rounded-sm border-2 transition-colors ${
                    isExpanded
                      ? 'border-outline bg-surface-raised'
                      : 'border-transparent hover:border-outline-soft hover:bg-surface-raised'
                  }`}
                  onClick={() => setExpandedId(isExpanded ? null : cardId)}
                >
                  {/* Compact row */}
                  <div className="flex items-center gap-1 px-1.5 py-1 min-w-0">
                    <span
                      className="shrink-0 text-[10px] leading-none cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(c.id);
                      }}
                      title={pinnedIds.has(c.id) ? '取消固定' : '固定'}
                      role="button"
                      tabIndex={0}
                    >
                      {pinnedIds.has(c.id) ? '📌' : '📍'}
                    </span>
                    <span
                      className={`shrink-0 font-pixel text-[10px] leading-none px-1 py-px border rounded-sm ${TAG_COLOR[c.type]}`}
                    >
                      {TAG_LABEL[c.type]}
                    </span>
                    <span className="font-ui text-xs truncate font-medium">{c.name}</span>
                    <span className="font-pixel text-[10px] text-ink-mute ml-auto shrink-0">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>

                  {/* Expanded preview */}
                  {isExpanded && (
                    <div className="px-1.5 pb-1.5">
                      {c.meta && (
                        <p className="font-ui text-[11px] text-ink-soft mb-0.5">{c.meta}</p>
                      )}
                      {c.preview && (
                        <p className="font-ui text-[11px] text-ink-soft leading-relaxed whitespace-pre-line mb-1 line-clamp-4">
                          {c.preview}
                        </p>
                      )}
                      <Link
                        to={`/books/${bookId}/bible?type=${c.type}`}
                        className="font-pixel text-[10px] text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        设定库 →
                      </Link>
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
