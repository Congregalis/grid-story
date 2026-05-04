import type { Character, Item, Location, Organization } from '@grid-story/schema';
import { useMemo, useState } from 'react';

// ── Types ──
type EntityType = 'character' | 'location' | 'organization' | 'item';

interface GraphEdge {
  fromId: string;
  toId: string;
  label: string;
}

interface BibleGraphProps {
  characters: Character[];
  locations: Location[];
  organizations: Organization[];
  items: Item[];
  selectedId?: string | null;
  onSelect?: (type: EntityType, id: string) => void;
}

const TYPE_COLORS: Record<EntityType, { fill: string; stroke: string; label: string }> = {
  character:    { fill: '#dee2ff', stroke: '#5468ff', label: '角色' },
  location:     { fill: '#d4f0e0', stroke: '#2da44e', label: '地点' },
  organization: { fill: '#fff0cc', stroke: '#f0a000', label: '组织' },
  item:         { fill: '#ffe0e4', stroke: '#cf222e', label: '物品' },
};

const SELECTED_FILL: Record<EntityType, string> = {
  character: '#5468ff',
  location: '#2da44e',
  organization: '#f0a000',
  item: '#cf222e',
};

function deriveEdges(
  characters: Character[],
  locations: Location[],
  organizations: Organization[],
  items: Item[],
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const locIds = new Set(locations.map((l) => l.id));
  const orgIds = new Set(organizations.map((o) => o.id));
  const charIds = new Set(characters.map((c) => c.id));

  for (const c of characters) {
    for (const r of c.relationships ?? []) {
      if (charIds.has(r.targetId)) {
        edges.push({ fromId: c.id, toId: r.targetId, label: r.type });
      }
    }
    if (c.locationId && locIds.has(c.locationId)) {
      edges.push({ fromId: c.id, toId: c.locationId, label: '所在地' });
    }
    for (const orgId of c.organizationIds ?? []) {
      if (orgIds.has(orgId)) {
        edges.push({ fromId: c.id, toId: orgId, label: '所属' });
      }
    }
  }

  for (const o of organizations) {
    if (o.leaderId && charIds.has(o.leaderId)) {
      edges.push({ fromId: o.id, toId: o.leaderId, label: '首领' });
    }
    for (const mId of o.memberIds ?? []) {
      if (charIds.has(mId)) {
        edges.push({ fromId: o.id, toId: mId, label: '成员' });
      }
    }
    if (o.locationId && locIds.has(o.locationId)) {
      edges.push({ fromId: o.id, toId: o.locationId, label: '驻地' });
    }
  }

  for (const it of items) {
    if (it.ownerId && charIds.has(it.ownerId)) {
      edges.push({ fromId: it.id, toId: it.ownerId, label: '持有者' });
    }
  }

  for (const l of locations) {
    if (l.parentId && locIds.has(l.parentId)) {
      edges.push({ fromId: l.id, toId: l.parentId, label: '父级' });
    }
  }

  return edges;
}

function nodeKey(type: EntityType, id: string) {
  return `${type}:${id}`;
}

interface EntityNode {
  id: string;
  name: string;
  type: EntityType;
}

function resolveType(
  id: string,
  characters: Character[],
  locations: Location[],
  organizations: Organization[],
  items: Item[],
): EntityType | null {
  if (characters.some((c) => c.id === id)) return 'character';
  if (locations.some((l) => l.id === id)) return 'location';
  if (organizations.some((o) => o.id === id)) return 'organization';
  if (items.some((i) => i.id === id)) return 'item';
  return null;
}

export function BibleGraph({
  characters,
  locations,
  organizations,
  items,
  selectedId,
  onSelect,
}: BibleGraphProps) {
  const [activeTypes, setActiveTypes] = useState<Set<EntityType>>(
    new Set(['character', 'location', 'organization', 'item']),
  );

  const toggleType = (t: EntityType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  // Build unified node list, respecting filter
  const allNodes = useMemo(() => {
    const nodes: EntityNode[] = [];
    if (activeTypes.has('character')) {
      for (const c of characters) nodes.push({ id: c.id, name: c.name, type: 'character' });
    }
    if (activeTypes.has('location')) {
      for (const l of locations) nodes.push({ id: l.id, name: l.name, type: 'location' });
    }
    if (activeTypes.has('organization')) {
      for (const o of organizations) nodes.push({ id: o.id, name: o.name, type: 'organization' });
    }
    if (activeTypes.has('item')) {
      for (const it of items) nodes.push({ id: it.id, name: it.name, type: 'item' });
    }
    return nodes;
  }, [characters, locations, organizations, items, activeTypes]);

  const allEdges = useMemo(
    () => deriveEdges(characters, locations, organizations, items),
    [characters, locations, organizations, items],
  );

  const visibleNodeKeys = useMemo(
    () => new Set(allNodes.map((n) => nodeKey(n.type, n.id))),
    [allNodes],
  );

  const visibleEdges = useMemo(
    () =>
      allEdges.filter((e) => {
        const fromType = resolveType(e.fromId, characters, locations, organizations, items);
        const toType = resolveType(e.toId, characters, locations, organizations, items);
        return (
          fromType !== null &&
          toType !== null &&
          visibleNodeKeys.has(nodeKey(fromType, e.fromId)) &&
          visibleNodeKeys.has(nodeKey(toType, e.toId))
        );
      }),
    [allEdges, visibleNodeKeys, characters, locations, organizations, items],
  );

  // Circular layout
  const layout = useMemo(() => {
    const W = 900;
    const H = 500;
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) / 2 - 60;
    const n = Math.max(allNodes.length, 1);
    const positions = new Map<string, { x: number; y: number }>();
    allNodes.forEach((node, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      positions.set(nodeKey(node.type, node.id), {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    });
    return { W, H, positions };
  }, [allNodes]);

  const totalAll = characters.length + locations.length + organizations.length + items.length;
  const tooMany = totalAll > 30;

  return (
    <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4">
      <header className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-pixel text-pixel-md">全景关系图</h3>
        <span className="font-ui text-xs text-ink-soft">
          {allNodes.length} 个节点 · {visibleEdges.length} 条关系
        </span>
      </header>

      {/* Entity type filter chips */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {(['character', 'location', 'organization', 'item'] as EntityType[]).map((t) => {
          const cfg = TYPE_COLORS[t];
          const count =
            t === 'character' ? characters.length
            : t === 'location' ? locations.length
            : t === 'organization' ? organizations.length
            : items.length;
          const active = activeTypes.has(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              className={`font-pixel text-pixel-xs px-2 py-1 border-2 rounded-sm transition-colors ${
                active ? 'border-outline shadow-pixel-1' : 'border-outline-soft opacity-40'
              }`}
              style={active ? { backgroundColor: cfg.fill, borderColor: cfg.stroke } : undefined}
            >
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {tooMany && (
        <p className="font-ui text-xs text-warning mb-2">
          实体过多（{totalAll}），建议用上方筛选缩小范围以获得更清晰的视图。
        </p>
      )}

      {allNodes.length === 0 ? (
        <div className="bg-surface-raised border-2 border-outline-soft rounded-sm p-8 text-center font-ui text-sm text-ink-soft">
          当前筛选条件下没有实体。请至少选中一种类型。
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${layout.W} ${layout.H}`}
          className="w-full h-auto bg-surface-raised border-2 border-outline-soft rounded-sm"
        >
          <defs>
            <marker
              id="panorama-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="#5b536a" />
            </marker>
          </defs>

          {visibleEdges.map((e, i) => {
            const fromType = resolveType(e.fromId, characters, locations, organizations, items);
            const toType = resolveType(e.toId, characters, locations, organizations, items);
            if (!fromType || !toType) return null;
            const a = layout.positions.get(nodeKey(fromType, e.fromId));
            const b = layout.positions.get(nodeKey(toType, e.toId));
            if (!a || !b) return null;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / d;
            const uy = dy / d;
            const nodeR = 26;
            const x1 = a.x + ux * nodeR;
            const y1 = a.y + uy * nodeR;
            const x2 = b.x - ux * (nodeR + 4);
            const y2 = b.y - uy * (nodeR + 4);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const labelW = e.label.length * 11 + 8;
            return (
              <g key={i}>
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="#5b536a" strokeWidth={1.5}
                  markerEnd="url(#panorama-arrow)"
                />
                <rect
                  x={mx - labelW / 2} y={my - 9}
                  width={labelW} height={16}
                  fill="#fbf3df" stroke="#2a2535" strokeWidth={1}
                />
                <text
                  x={mx} y={my + 3}
                  textAnchor="middle" fontSize="10"
                  fontFamily="Inter, sans-serif" fill="#5b536a"
                >
                  {e.label}
                </text>
              </g>
            );
          })}

          {allNodes.map((node) => {
            const p = layout.positions.get(nodeKey(node.type, node.id));
            if (!p) return null;
            const selected = node.id === selectedId;
            const cfg = TYPE_COLORS[node.type];
            const R = 26;
            return (
              <g
                key={nodeKey(node.type, node.id)}
                transform={`translate(${p.x}, ${p.y})`}
                className="cursor-pointer"
                onClick={() => onSelect?.(node.type, node.id)}
              >
                {node.type === 'character' && (
                  <circle r={R} fill={selected ? SELECTED_FILL.character : cfg.fill}
                    stroke={selected ? SELECTED_FILL.character : cfg.stroke}
                    strokeWidth={selected ? 3 : 2} />
                )}
                {node.type === 'location' && (
                  <rect x={-R} y={-R} width={R * 2} height={R * 2}
                    fill={selected ? SELECTED_FILL.location : cfg.fill}
                    stroke={selected ? SELECTED_FILL.location : cfg.stroke}
                    strokeWidth={selected ? 3 : 2} />
                )}
                {node.type === 'organization' && (
                  <polygon points={`0,${-R} ${R},0 0,${R} ${-R},0`}
                    fill={selected ? SELECTED_FILL.organization : cfg.fill}
                    stroke={selected ? SELECTED_FILL.organization : cfg.stroke}
                    strokeWidth={selected ? 3 : 2} />
                )}
                {node.type === 'item' && (
                  <polygon points={`0,${-R - 4} ${R + 2},${R / 2} ${0},${R + 6} ${-R - 2},${R / 2}`}
                    fill={selected ? SELECTED_FILL.item : cfg.fill}
                    stroke={selected ? SELECTED_FILL.item : cfg.stroke}
                    strokeWidth={selected ? 3 : 2} />
                )}
                <text
                  y={node.type === 'item' ? R / 2 + 1 : 4}
                  textAnchor="middle" fontSize="11"
                  fontFamily="Inter, sans-serif" fontWeight={500}
                  fill={selected ? '#ffffff' : '#2a2535'}
                >
                  {node.name.slice(0, 4)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
