import type { Outline, OutlineType } from '@grid-story/schema';

export type OutlineRow = Outline;

export interface OutlineNode {
  node: OutlineRow;
  children: OutlineNode[];
}

export interface OutlineTreeResponse {
  bookId: string;
  roots: OutlineNode[];
}

export const TYPE_LABEL: Record<OutlineType, string> = {
  arc: '总纲',
  volume: '卷',
  chapter: '章',
  scene: '场景',
};

export const TYPE_COLOR: Record<OutlineType, string> = {
  arc: 'bg-secondary text-on-primary',
  volume: 'bg-primary text-on-primary',
  chapter: 'bg-success text-on-primary',
  scene: 'bg-warning text-ink',
};

export const CHILD_TYPE: Record<OutlineType, OutlineType | null> = {
  arc: 'volume',
  volume: 'chapter',
  chapter: 'scene',
  scene: null,
};
