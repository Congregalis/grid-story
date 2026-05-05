import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchWikiPage, fetchWikiPages } from './api';
import type { WikiPageMeta } from './types';

const ENTITY_PREFIXES = [
  'entities/characters/',
  'entities/locations/',
  'entities/organizations/',
  'entities/items/',
  'concepts/',
];

const ENTITY_KIND_BY_PREFIX: Record<string, EntityKind> = {
  'entities/characters/': 'character',
  'entities/locations/': 'location',
  'entities/organizations/': 'organization',
  'entities/items/': 'item',
  'concepts/': 'concept',
};

type EntityKind = 'character' | 'location' | 'organization' | 'item' | 'concept';

const KIND_COLORS: Record<EntityKind, { fill: string; stroke: string; label: string }> = {
  character: { fill: '#ffd6e4', stroke: '#e85a8e', label: '角色' },
  location: { fill: '#dee2ff', stroke: '#5468ff', label: '地点' },
  organization: { fill: '#f0e0c8', stroke: '#a07845', label: '组织' },
  item: { fill: '#ffe6b8', stroke: '#f0a93b', label: '物品' },
  concept: { fill: '#cdebd5', stroke: '#2fa66a', label: '概念' },
};

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

interface GraphNode {
  id: string;
  path: string;
  title: string;
  kind: EntityKind;
  x: number;
  y: number;
}

interface GraphEdge {
  fromId: string;
  toId: string;
}

export interface WikiGraphProps {
  bookId: string;
  onSelect?: (path: string) => void;
  selectedPath?: string | null;
}

export function WikiGraph({ bookId, onSelect, selectedPath }: WikiGraphProps) {
  const pagesQuery = useQuery({
    queryKey: ['wiki', 'pages', bookId],
    queryFn: () => fetchWikiPages(bookId),
    staleTime: 30_000,
  });

  const entityPages = useMemo(() => {
    const all = pagesQuery.data?.pages ?? [];
    return all.filter((page) =>
      ENTITY_PREFIXES.some((prefix) => page.path.startsWith(prefix)),
    );
  }, [pagesQuery.data]);

  // Pull content for every entity page so we can extract edges.
  const detailQueries = useEntityPageContents(bookId, entityPages);

  const { nodes, edges } = useMemo(() => {
    const layoutResult = layoutNodes(entityPages);
    const allEdges: GraphEdge[] = [];
    const byPath = new Map(layoutResult.map((n) => [n.path, n]));

    detailQueries.forEach((q) => {
      if (!q.data) return;
      const fromPath = q.data.path;
      const fromNode = byPath.get(fromPath);
      if (!fromNode) return;
      const links = extractWikilinks(q.data.content);
      for (const link of links) {
        const toNode = resolveLinkToNode(link, byPath);
        if (toNode && toNode.id !== fromNode.id) {
          allEdges.push({ fromId: fromNode.id, toId: toNode.id });
        }
      }
    });

    // Deduplicate edges (treat undirected for visualization).
    const seen = new Set<string>();
    const dedup = allEdges.filter((edge) => {
      const key = [edge.fromId, edge.toId].sort().join('::');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { nodes: layoutResult, edges: dedup };
  }, [entityPages, detailQueries]);

  if (pagesQuery.isLoading) {
    return <div className="font-ui text-sm text-ink-soft p-4">加载图…</div>;
  }
  if (pagesQuery.isError) {
    return <div className="font-ui text-sm text-danger p-4">加载图失败</div>;
  }

  if (nodes.length === 0) {
    return (
      <div className="bg-surface border-2 border-outline rounded-md p-8 text-center font-ui text-sm text-ink-soft">
        还没有实体 wiki 页面。
      </div>
    );
  }

  const W = 720;
  const H = 480;

  return (
    <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-4 overflow-auto pixel-scrollbar">
      <header className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-pixel text-pixel-md">实体关系图</h3>
        <div className="flex gap-3 text-xs font-ui text-ink-soft">
          {Object.entries(KIND_COLORS).map(([kind, c]) => (
            <span key={kind} className="inline-flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 border-2"
                style={{ background: c.fill, borderColor: c.stroke }}
                aria-hidden
              />
              {c.label}
            </span>
          ))}
        </div>
        <span className="font-ui text-xs text-ink-soft">
          {nodes.length} 节点 · {edges.length} 边
        </span>
      </header>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="wiki 关系图">
        <title>Wiki 实体关系图</title>
        <g>
          {edges.map((edge, i) => {
            const from = nodes.find((n) => n.id === edge.fromId);
            const to = nodes.find((n) => n.id === edge.toId);
            if (!from || !to) return null;
            return (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: edges array is stable per render.
                key={`e-${i}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#9a93a8"
                strokeWidth={1}
                opacity={0.6}
              />
            );
          })}
        </g>
        <g>
          {nodes.map((node) => {
            const palette = KIND_COLORS[node.kind];
            const active = selectedPath === node.path;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => onSelect?.(node.path)}
                style={{ cursor: onSelect ? 'pointer' : 'default' }}
              >
                <circle
                  r={active ? 14 : 11}
                  fill={palette.fill}
                  stroke={active ? '#2a2535' : palette.stroke}
                  strokeWidth={active ? 3 : 2}
                />
                <text
                  y={-18}
                  textAnchor="middle"
                  className="font-pixel"
                  fontSize="11"
                  fill="#2a2535"
                >
                  {node.title}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function useEntityPageContents(bookId: string, pages: WikiPageMeta[]) {
  // Cap to first 60 entity pages to keep request volume reasonable on large wikis.
  const capped = pages.slice(0, 60);
  return useQueries({
    queries: capped.map((page) => ({
      queryKey: ['wiki', 'page', bookId, page.path],
      queryFn: () => fetchWikiPage(bookId, page.path.replace(/\.md$/, '')),
      staleTime: 60_000,
    })),
  });
}

function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  WIKILINK_RE.lastIndex = 0;
  for (let match = WIKILINK_RE.exec(content); match; match = WIKILINK_RE.exec(content)) {
    links.push(match[1].trim());
  }
  return links;
}

function resolveLinkToNode(
  link: string,
  byPath: Map<string, GraphNode>,
): GraphNode | null {
  // 1. Try direct path
  const direct = `${link}.md`;
  if (byPath.has(direct)) return byPath.get(direct)!;
  // 2. Try common prefixes
  for (const prefix of ENTITY_PREFIXES) {
    const candidate = `${prefix}${link.split('/').pop()}.md`;
    if (byPath.has(candidate)) return byPath.get(candidate)!;
  }
  // 3. Try matching by slug (last path segment)
  const slug = link.split('/').pop();
  if (!slug) return null;
  for (const node of byPath.values()) {
    if (node.path.endsWith(`/${slug}.md`)) return node;
  }
  return null;
}

function layoutNodes(pages: WikiPageMeta[]): GraphNode[] {
  const W = 720;
  const H = 480;
  const cx = W / 2;
  const cy = H / 2;

  // Group by kind, lay out each group in a concentric ring.
  const grouped = new Map<EntityKind, WikiPageMeta[]>();
  for (const page of pages) {
    const kind = kindFromPath(page.path);
    if (!kind) continue;
    if (!grouped.has(kind)) grouped.set(kind, []);
    grouped.get(kind)!.push(page);
  }

  const groupOrder: EntityKind[] = ['character', 'location', 'organization', 'item', 'concept'];
  const nodes: GraphNode[] = [];

  let ringIndex = 0;
  for (const kind of groupOrder) {
    const group = grouped.get(kind);
    if (!group || group.length === 0) continue;
    const radius = 80 + ringIndex * 70;
    const n = group.length;
    group.forEach((page, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2 + ringIndex * 0.3;
      nodes.push({
        id: page.path,
        path: page.path,
        title: page.title ?? page.slug ?? page.path,
        kind,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    });
    ringIndex++;
  }

  return nodes;
}

function kindFromPath(path: string): EntityKind | null {
  for (const [prefix, kind] of Object.entries(ENTITY_KIND_BY_PREFIX)) {
    if (path.startsWith(prefix)) return kind;
  }
  return null;
}
