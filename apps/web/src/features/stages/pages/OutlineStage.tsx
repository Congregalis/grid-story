import { PixelButton, PixelInput } from '@grid-story/pixel-kit';
import type { Outline } from '@grid-story/schema';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatApiError } from '../../../lib/api';
import { toast } from '../../../lib/toast';
import { OUTLINE_STAGE, WRITING_STAGE } from '../definitions';
import type { StageContext } from '../types';

interface OutlineStageProps {
  ctx: StageContext;
  bookId: string;
}

interface GeneratedScene {
  title: string;
  summary: string;
}
interface GeneratedChapter {
  title: string;
  summary: string;
  scenes: GeneratedScene[];
}
interface GeneratedVolume {
  title: string;
  summary: string;
  chapters: GeneratedChapter[];
}
interface GeneratedArc {
  title: string;
  summary: string;
  volumes: GeneratedVolume[];
}
interface GenerateResp {
  outline: { arcs: GeneratedArc[] };
  counts: { arcs: number; volumes: number; chapters: number; scenes: number };
}

export function OutlineStage({ ctx, bookId }: OutlineStageProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [idea, setIdea] = useState('');

  const isSimulation = ctx.book.engineMode === 'simulation';

  const tree = useMemo(() => buildOutlineTree(ctx.outlines), [ctx.outlines]);

  const generate = useMutation({
    mutationFn: async () => {
      const seedIdea = idea.trim() || ctx.book.hook?.trim() || ctx.book.title || '本书的主线';
      const seedStyle = ctx.book.style?.trim() || ctx.book.tone?.trim() || '文学性';
      const resp = await api.post<GenerateResp>('/agent/outline/generate', {
        bookId,
        idea: seedIdea,
        style: seedStyle,
      });
      const baseOrder = ctx.outlines.filter((o) => o.type === 'arc').length;
      await writeOutlineTree(bookId, resp.outline, baseOrder);
      return resp.counts;
    },
    onSuccess: (counts) => {
      qc.invalidateQueries({ queryKey: ['bible', 'outlines', bookId] });
      const sceneCount = isSimulation ? 0 : counts.scenes;
      toast.success(
        `已生成 ${counts.arcs} arc / ${counts.volumes} 卷 / ${counts.chapters} 章${
          sceneCount ? ` / ${sceneCount} 场景` : '（模拟模式：场景由写作阶段推演）'
        }`,
      );
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '大纲生成失败')),
  });

  const stageProgress = OUTLINE_STAGE.computeProgress(ctx);

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
      <header>
        <h1 className="font-pixel text-pixel-lg mb-1">🗺️ 大纲</h1>
        <p className="font-ui text-sm text-ink-soft">
          {isSimulation
            ? '模拟模式：AI 只生成主线锚点（arc / 卷 / 章），不预设场景级走向——场景由 ④ 写作阶段实时推演。'
            : '传统模式：AI 生成完整四层大纲（含场景级走向）。'}
        </p>
      </header>

      {/* AI 生成区 */}
      <section className="border-2 border-outline rounded-md bg-surface p-4 shadow-pixel-1 space-y-3">
        <h2 className="font-pixel text-pixel-md">✨ AI 一键生成大纲</h2>
        <p className="font-ui text-xs text-ink-soft">
          将基于本书的钩子 + charter 自动生成。也可以填一句更具体的"故事 idea"覆盖。
        </p>
        <PixelInput
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder={`默认：${ctx.book.hook?.slice(0, 40) || ctx.book.title}`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <PixelButton disabled={generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? '生成中（30s）…' : '✨ 一键生成'}
          </PixelButton>
          <Link
            to={`/books/${bookId}/expert/outline`}
            className="font-pixel text-pixel-sm border-2 border-outline-soft rounded-sm px-2 py-1 hover:bg-primary-soft text-ink-soft"
            title="进入完整大纲编辑器，可拖拽 / 改 / 删"
          >
            ⚙ 完整大纲编辑器
          </Link>
        </div>
      </section>

      {/* 大纲展示 */}
      <section className="border-2 border-outline-soft rounded-md bg-surface-raised p-4 space-y-2">
        <h2 className="font-pixel text-pixel-md">当前大纲（{ctx.outlines.length} 节点）</h2>
        {ctx.outlines.length === 0 ? (
          <p className="font-ui text-sm text-ink-mute">
            还没有大纲。点上方"一键生成"或去专家模式手填。
          </p>
        ) : (
          <ul className="space-y-2">
            {tree.map((arc) => (
              <OutlineNode key={arc.id} node={arc} bookId={bookId} qc={qc} />
            ))}
          </ul>
        )}
      </section>

      {/* Footer */}
      <footer className="flex flex-wrap items-center gap-3">
        <PixelButton
          disabled={!stageProgress.done}
          onClick={() => navigate(`/books/${bookId}/stages/${WRITING_STAGE.route}`)}
        >
          {stageProgress.done
            ? '下一步：开始写作 ④ →'
            : `还差：${stageProgress.blockers[0]}`}
        </PixelButton>
        <span className="ml-auto font-ui text-xs text-ink-mute">
          arcs={ctx.outlines.filter((o) => o.type === 'arc').length} · volumes=
          {ctx.outlines.filter((o) => o.type === 'volume').length} · chapters=
          {ctx.outlines.filter((o) => o.type === 'chapter').length}
        </span>
      </footer>
    </div>
  );
}

interface OutlineNodeData extends Outline {
  children: OutlineNodeData[];
}

function buildOutlineTree(rows: Outline[]): OutlineNodeData[] {
  const map = new Map<string, OutlineNodeData>();
  for (const row of rows) {
    map.set(row.id, { ...row, children: [] });
  }
  const roots: OutlineNodeData[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  for (const node of map.values()) {
    node.children.sort((a, b) => a.order - b.order);
  }
  roots.sort((a, b) => a.order - b.order);
  return roots;
}

function OutlineNode({
  node,
  bookId,
  qc,
}: {
  node: OutlineNodeData;
  bookId: string;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(node.title);

  const update = useMutation({
    mutationFn: () =>
      api.put<Outline>(`/bible/outlines/${encodeURIComponent(node.id)}`, {
        title: title.trim() || node.title,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bible', 'outlines', bookId] });
      setEditing(false);
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '保存失败')),
  });

  const indent = node.type === 'arc' ? 0 : node.type === 'volume' ? 12 : 24;
  const badge =
    node.type === 'arc'
      ? 'A'
      : node.type === 'volume'
        ? 'V'
        : node.type === 'chapter'
          ? 'C'
          : 'S';

  return (
    <li>
      <div
        className="flex items-center gap-2 py-1"
        style={{ paddingLeft: `${indent}px` }}
      >
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-sm border-2 border-outline-soft font-pixel text-[10px] text-ink-mute">
          {badge}
        </span>
        {editing ? (
          <>
            <PixelInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') update.mutate();
                if (e.key === 'Escape') {
                  setTitle(node.title);
                  setEditing(false);
                }
              }}
            />
            <PixelButton size="sm" disabled={update.isPending} onClick={() => update.mutate()}>
              ✓
            </PixelButton>
          </>
        ) : (
          <button
            type="button"
            className="font-pixel text-pixel-sm text-ink hover:text-primary text-left"
            onClick={() => setEditing(true)}
          >
            {node.title}
          </button>
        )}
        {node.summary && !editing && (
          <span className="font-ui text-[11px] text-ink-mute truncate ml-2 max-w-md">
            · {node.summary}
          </span>
        )}
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <OutlineNode key={child.id} node={child} bookId={bookId} qc={qc} />
          ))}
        </ul>
      )}
    </li>
  );
}

async function writeOutlineTree(
  bookId: string,
  outline: { arcs: GeneratedArc[] },
  baseOrder: number,
): Promise<void> {
  for (let i = 0; i < outline.arcs.length; i++) {
    const arc = outline.arcs[i];
    const arcRow = await api.post<Outline>('/bible/outlines', {
      bookId,
      type: 'arc',
      title: arc.title,
      summary: arc.summary,
      parentId: null,
      order: baseOrder + i,
      notes: null,
    });
    for (let j = 0; j < arc.volumes.length; j++) {
      const vol = arc.volumes[j];
      const volRow = await api.post<Outline>('/bible/outlines', {
        bookId,
        type: 'volume',
        title: vol.title,
        summary: vol.summary,
        parentId: arcRow.id,
        order: j,
        notes: null,
      });
      for (let k = 0; k < vol.chapters.length; k++) {
        const ch = vol.chapters[k];
        const chRow = await api.post<Outline>('/bible/outlines', {
          bookId,
          type: 'chapter',
          title: ch.title,
          summary: ch.summary,
          parentId: volRow.id,
          order: k,
          notes: null,
        });
        for (let m = 0; m < ch.scenes.length; m++) {
          const sc = ch.scenes[m];
          await api.post<Outline>('/bible/outlines', {
            bookId,
            type: 'scene',
            title: sc.title,
            summary: sc.summary,
            parentId: chRow.id,
            order: m,
            notes: null,
          });
        }
      }
    }
  }
}
