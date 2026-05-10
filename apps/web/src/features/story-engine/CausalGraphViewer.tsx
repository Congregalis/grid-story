import { PixelButton } from '@grid-story/pixel-kit';
import type { CausalLink, CausalLinkType } from '@grid-story/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { storyEngineApi } from './api';

interface CausalGraphViewerProps {
  bookId: string;
}

const TYPE_LABEL: Record<CausalLinkType, string> = {
  trigger: '触发',
  consequence: '结果',
  enabling: '使能',
  undermining: '反挫',
};

const TYPE_COLOR: Record<CausalLinkType, string> = {
  trigger: 'border-primary text-primary',
  consequence: 'border-success text-success',
  enabling: 'border-secondary text-secondary',
  undermining: 'border-danger text-danger',
};

interface GraphNode {
  id: string;
  incoming: CausalLink[];
  outgoing: CausalLink[];
}

function buildNodes(links: CausalLink[]): GraphNode[] {
  const map = new Map<string, GraphNode>();
  const ensure = (id: string) => {
    let node = map.get(id);
    if (!node) {
      node = { id, incoming: [], outgoing: [] };
      map.set(id, node);
    }
    return node;
  };
  for (const link of links) {
    if (link.fromSceneRef) ensure(link.fromSceneRef).outgoing.push(link);
    ensure(link.toSceneRef).incoming.push(link);
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function CausalGraphViewer({ bookId }: CausalGraphViewerProps) {
  const query = useQuery({
    queryKey: ['story-engine', 'causal-graph', bookId],
    queryFn: () => storyEngineApi.listCausalGraph(bookId),
    staleTime: 30_000,
  });

  const links = query.data?.links ?? [];
  const nodes = useMemo(() => buildNodes(links), [links]);
  const [impactNode, setImpactNode] = useState<string | null>(null);

  const impactQuery = useQuery({
    queryKey: ['story-engine', 'causal-graph', bookId, 'impact', impactNode],
    queryFn: () => storyEngineApi.causalImpact(bookId, impactNode ?? ''),
    enabled: Boolean(impactNode),
    staleTime: 30_000,
  });

  const impactedSet = useMemo(
    () => new Set((impactQuery.data?.impacted ?? []).map((entry) => entry.sceneRef)),
    [impactQuery.data?.impacted],
  );

  return (
    <section className="border-2 border-outline rounded-md bg-surface p-3 shadow-pixel-1">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-pixel text-pixel-sm">因果图</h2>
        <span className="font-ui text-xs text-ink-mute">
          {nodes.length} 节点 / {links.length} 边
        </span>
      </div>

      {query.isLoading ? (
        <div className="font-ui text-xs text-ink-soft">加载…</div>
      ) : nodes.length === 0 ? (
        <div className="font-ui text-xs text-ink-soft">
          尚无因果链。每次拍板分支后会写入 stateDelta.causalLinks。
        </div>
      ) : (
        <ul className="space-y-2">
          {nodes.map((node) => {
            const isImpactSource = impactNode === node.id;
            const isImpacted = impactedSet.has(node.id);
            const containerCls = isImpactSource
              ? 'border-2 border-primary bg-primary-soft/30'
              : isImpacted
                ? 'border-2 border-warning bg-warning/10'
                : 'border border-outline-soft bg-surface-raised';
            return (
            <li key={node.id} className={`${containerCls} rounded-sm p-2`}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-pixel-sm text-ink">{node.id}</div>
                <PixelButton
                  size="sm"
                  variant={isImpactSource ? 'primary' : 'ghost'}
                  onClick={() => setImpactNode(isImpactSource ? null : node.id)}
                >
                  {isImpactSource ? '取消影响分析' : '影响分析'}
                </PixelButton>
              </div>
              {node.incoming.length > 0 && (
                <div className="mt-1">
                  <div className="font-pixel text-[10px] text-ink-mute">← 上游</div>
                  <ul className="space-y-0.5">
                    {node.incoming.map((link, idx) => (
                      <li key={idx} className="font-ui text-xs text-ink-soft flex gap-2 items-baseline">
                        <span
                          className={`rounded-sm border px-1 font-pixel text-[10px] ${TYPE_COLOR[link.type]}`}
                        >
                          {TYPE_LABEL[link.type]}
                        </span>
                        <span className="font-mono text-ink-mute">{link.fromSceneRef ?? '∅'}</span>
                        <span>{link.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {node.outgoing.length > 0 && (
                <div className="mt-1">
                  <div className="font-pixel text-[10px] text-ink-mute">→ 下游</div>
                  <ul className="space-y-0.5">
                    {node.outgoing.map((link, idx) => (
                      <li key={idx} className="font-ui text-xs text-ink-soft flex gap-2 items-baseline">
                        <span
                          className={`rounded-sm border px-1 font-pixel text-[10px] ${TYPE_COLOR[link.type]}`}
                        >
                          {TYPE_LABEL[link.type]}
                        </span>
                        <span className="font-mono text-ink-mute">{link.toSceneRef}</span>
                        <span>{link.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
          })}
        </ul>
      )}

      {impactNode && (
        <div className="mt-3 border-t-2 border-outline pt-2">
          <div className="font-pixel text-[11px] text-ink-mute">
            从 <span className="font-mono text-ink">{impactNode}</span> 出发的影响链：
          </div>
          {impactQuery.isLoading ? (
            <div className="font-ui text-xs text-ink-soft">加载…</div>
          ) : (impactQuery.data?.impacted ?? []).length === 0 ? (
            <div className="font-ui text-xs text-ink-soft">该节点没有下游因果。</div>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {(impactQuery.data?.impacted ?? []).map((entry) => (
                <li
                  key={entry.sceneRef}
                  className="font-ui text-xs text-ink-soft flex gap-2 items-baseline"
                >
                  <span className="font-pixel text-[10px] text-ink-mute">d={entry.distance}</span>
                  <span className="font-mono text-ink">{entry.sceneRef}</span>
                  <span className="text-ink-mute">via {entry.via.from}</span>
                  <span>{entry.via.description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
