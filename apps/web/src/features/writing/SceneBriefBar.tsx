import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { OutlineRow } from '../outline/types';

const TYPE_LABEL: Record<string, string> = {
  arc: '总纲',
  volume: '卷',
  chapter: '章',
  scene: '场景',
};

interface SceneBriefBarProps {
  bookId: string;
  sceneNode: OutlineRow | null;
  /** Path from root to this scene node, for breadcrumb display */
  breadcrumbs: OutlineRow[];
}

export function SceneBriefBar({ bookId, sceneNode, breadcrumbs }: SceneBriefBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (!sceneNode) {
    return (
      <div className="mb-3 bg-surface border-2 border-outline-soft rounded-sm px-3 py-1.5 flex items-center gap-2">
        <span className="font-pixel text-pixel-sm text-ink-mute">场景概要</span>
        <span className="font-ui text-xs text-ink-mute">
          未绑定大纲场景 —
        </span>
        <Link
          to={`/books/${bookId}/outline`}
          className="font-ui text-xs text-primary hover:underline"
        >
          去大纲绑定
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-3 bg-primary-soft border-2 border-primary/30 rounded-sm">
      <button
        type="button"
        className="w-full px-3 py-1.5 flex items-center gap-2 font-ui text-sm text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-pixel text-pixel-sm text-primary">
          {TYPE_LABEL[sceneNode.type] ?? sceneNode.type}
        </span>
        <span className="font-medium truncate">{sceneNode.title}</span>
        {breadcrumbs.length > 0 && (
          <span className="text-ink-mute text-xs truncate hidden sm:inline">
            {breadcrumbs.map((b) => b.title).join(' → ')}
          </span>
        )}
        <span className="ml-auto font-pixel text-pixel-sm text-ink-mute">
          {expanded ? '收起' : '展开'}
        </span>
      </button>
      {expanded && sceneNode.summary && (
        <div className="px-3 pb-2 font-ui text-sm text-ink-soft leading-relaxed">
          {sceneNode.summary}
        </div>
      )}
      {expanded && !sceneNode.summary && (
        <div className="px-3 pb-2 font-ui text-xs text-ink-mute">
          此场景节点没有简介。
        </div>
      )}
    </div>
  );
}
