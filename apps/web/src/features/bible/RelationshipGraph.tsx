import { useMemo } from 'react';
import type { CharacterRow } from './types';

export interface RelationshipGraphProps {
  characters: CharacterRow[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

/**
 * 最小版关系图：圆形布局 + 有向箭头。
 * - 节点 = 角色（圆 + 名字）
 * - 边 = relationships（A → B），边上标 type
 * - 选中节点：高亮 + 收紧到中心更近
 * - 无第三方依赖（不引 react-flow / d3 — MVP 验收只要"最小版"）
 */
export function RelationshipGraph({
  characters,
  selectedId,
  onSelect,
}: RelationshipGraphProps) {
  const layout = useMemo(() => {
    const W = 720;
    const H = 360;
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) / 2 - 60;
    const n = Math.max(characters.length, 1);
    const positions = new Map<string, { x: number; y: number }>();
    characters.forEach((c, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      positions.set(c.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    });
    return { W, H, positions };
  }, [characters]);

  if (characters.length === 0) {
    return (
      <div className="bg-surface border-2 border-outline rounded-sm p-8 text-center font-ui text-sm text-ink-soft">
        还没有角色。先在左侧创建一个。
      </div>
    );
  }

  const edges = characters.flatMap((c) =>
    c.relationships
      .filter((r) => layout.positions.has(r.targetId))
      .map((r) => ({ fromId: c.id, toId: r.targetId, type: r.type })),
  );

  return (
    <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="font-pixel text-pixel-md">关系图</h3>
        <span className="font-ui text-xs text-ink-soft">
          {characters.length} 个角色 · {edges.length} 条关系
        </span>
      </header>
      <svg
        viewBox={`0 0 ${layout.W} ${layout.H}`}
        className="w-full h-auto bg-surface-raised border-2 border-outline-soft rounded-sm"
      >
        <defs>
          <marker
            id="arrowhead"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#2a2535" />
          </marker>
        </defs>

        {edges.map((e, i) => {
          const a = layout.positions.get(e.fromId)!;
          const b = layout.positions.get(e.toId)!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const ux = dx / d;
          const uy = dy / d;
          // 起止偏移到圆边（节点半径 28）
          const x1 = a.x + ux * 28;
          const y1 = a.y + uy * 28;
          const x2 = b.x - ux * 32;
          const y2 = b.y - uy * 32;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          return (
            <g key={i}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#5b536a"
                strokeWidth={2}
                markerEnd="url(#arrowhead)"
              />
              <rect
                x={mx - e.type.length * 5 - 4}
                y={my - 9}
                width={e.type.length * 10 + 8}
                height={16}
                fill="#ffd6e4"
                stroke="#2a2535"
                strokeWidth={1}
              />
              <text
                x={mx}
                y={my + 3}
                textAnchor="middle"
                fontSize="11"
                fontFamily="Inter, sans-serif"
                fill="#e85a8e"
              >
                {e.type}
              </text>
            </g>
          );
        })}

        {characters.map((c) => {
          const p = layout.positions.get(c.id)!;
          const selected = c.id === selectedId;
          return (
            <g
              key={c.id}
              transform={`translate(${p.x}, ${p.y})`}
              className="cursor-pointer"
              onClick={() => onSelect?.(c.id)}
            >
              <circle
                r={28}
                fill={selected ? '#5468ff' : '#fbf3df'}
                stroke="#2a2535"
                strokeWidth={2}
              />
              <text
                y={4}
                textAnchor="middle"
                fontSize="12"
                fontFamily="Inter, sans-serif"
                fontWeight={500}
                fill={selected ? '#ffffff' : '#2a2535'}
              >
                {c.name.slice(0, 4)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
