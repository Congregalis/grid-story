import { useState, type DragEvent } from 'react';
import { PixelButton } from '@grid-story/pixel-kit';
import {
  CHILD_TYPE,
  TYPE_COLOR,
  TYPE_LABEL,
  type OutlineNode,
  type OutlineRow,
} from './types';

export interface CardActions {
  onAddChild: (parent: OutlineRow) => void;
  onDelete: (id: string) => void;
  onRename: (row: OutlineRow) => void;
  onReorder: (id: string, dir: -1 | 1) => void;
  /** 把 dragged 节点移成 target 的最后一个子 */
  onReparent: (draggedId: string, targetParentId: string | null) => void;
  /** 在 Writing 中打开此节点对应的章节 */
  onOpenInWriting?: (row: OutlineRow) => void;
  busyId?: string | null;
}

const DRAG_KEY = 'application/x-grid-outline-id';

export function OutlineCard({
  node,
  depth,
  actions,
}: {
  node: OutlineNode;
  depth: number;
  actions: CardActions;
}) {
  const [hover, setHover] = useState(false);
  const row = node.node;
  const childType = CHILD_TYPE[row.type];

  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.dataTransfer.setData(DRAG_KEY, row.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(DRAG_KEY)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setHover(true);
  };

  const onDragLeave = () => setHover(false);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setHover(false);
    const draggedId = e.dataTransfer.getData(DRAG_KEY);
    if (!draggedId || draggedId === row.id) return;
    actions.onReparent(draggedId, row.id);
  };

  const isBusy = actions.busyId === row.id;

  return (
    <div className="flex flex-col">
      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={
          'bg-surface-raised border-2 border-outline rounded-sm shadow-pixel-1 ' +
          'px-3 py-2 cursor-grab active:cursor-grabbing transition-colors ' +
          (hover ? 'border-primary bg-primary-soft' : '') +
          (isBusy ? ' opacity-60' : '')
        }
      >
        <div className="flex items-start gap-2">
          <span
            className={
              'shrink-0 font-pixel text-pixel-sm px-1.5 py-0.5 ' +
              TYPE_COLOR[row.type]
            }
          >
            {TYPE_LABEL[row.type]}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-ui text-sm font-medium truncate">{row.title}</div>
            {row.summary && (
              <div className="font-ui text-xs text-ink-soft mt-0.5 line-clamp-2">
                {row.summary}
              </div>
            )}
          </div>
          <div className="shrink-0 flex flex-col gap-0.5">
            <button
              type="button"
              className="font-mono text-xs px-1 leading-none border border-outline rounded-sm hover:bg-primary-soft"
              onClick={() => actions.onReorder(row.id, -1)}
              title="上移"
            >
              ↑
            </button>
            <button
              type="button"
              className="font-mono text-xs px-1 leading-none border border-outline rounded-sm hover:bg-primary-soft"
              onClick={() => actions.onReorder(row.id, 1)}
              title="下移"
            >
              ↓
            </button>
          </div>
        </div>

        <div className="mt-2 flex gap-2 flex-wrap">
          {childType && (
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => actions.onAddChild(row)}
            >
              + {TYPE_LABEL[childType]}
            </PixelButton>
          )}
          <PixelButton size="sm" variant="ghost" onClick={() => actions.onRename(row)}>
            重命名
          </PixelButton>
          {(row.type === 'chapter' || row.type === 'scene') && actions.onOpenInWriting && (
            <PixelButton
              size="sm"
              variant="ghost"
              onClick={() => actions.onOpenInWriting?.(row)}
            >
              在写作中打开
            </PixelButton>
          )}
          <PixelButton
            size="sm"
            variant="danger"
            onClick={() => {
              if (confirm(`删除「${row.title}」及其所有子节点？`)) actions.onDelete(row.id);
            }}
          >
            删除
          </PixelButton>
        </div>
      </div>

      {node.children.length > 0 && (
        <div
          className="mt-2 ml-6 pl-4 border-l-2 border-outline-soft space-y-2"
          style={{ minHeight: depth === 0 ? 0 : 8 }}
        >
          {node.children.map((c) => (
            <OutlineCard key={c.node.id} node={c} depth={depth + 1} actions={actions} />
          ))}
        </div>
      )}
    </div>
  );
}

export function RootDropZone({
  onReparent,
}: {
  onReparent: (draggedId: string, parentId: string | null) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_KEY)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const id = e.dataTransfer.getData(DRAG_KEY);
        if (id) onReparent(id, null);
      }}
      className={
        'border-2 border-dashed rounded-sm py-3 text-center font-ui text-xs ' +
        (hover
          ? 'border-primary bg-primary-soft text-primary'
          : 'border-outline-soft text-ink-mute')
      }
    >
      把卡片拖到这里 → 提升为根节点（总纲）
    </div>
  );
}
