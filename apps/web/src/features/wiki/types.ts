import type {
  WikiDivergence,
  WikiLintResult,
  WikiLintReportSummary,
} from '@grid-story/schema';

export interface WikiPageMeta {
  path: string;
  title: string | null;
  slug: string | null;
  page_type: string | null;
  bible_entity_id: string | null;
  updated_at: string | null;
  last_ingest_chapter: number | null;
  first_appearance: number | null;
  last_appearance: number | null;
  status: string | null;
  chapter_number: number | null;
  category: string | null;
  tags: string[] | null;
}

export interface WikiPageDetail {
  ok: true;
  path: string;
  raw: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

export interface WikiSearchHit {
  path: string;
  title: string;
  page_type: string | null;
  matches: { line: number; text: string }[];
}

export interface WikiHistoryEntry {
  run_id: string;
  ts: string;
  run_type: 'ingest' | 'rollback' | 'manual';
  chapter_id?: string;
  files_changed: string[];
  file_hashes_before: Record<string, string | null>;
  file_hashes_after: Record<string, string | null>;
  backup_dir?: string;
  rollback_of?: string;
}

export type WikiCategoryKey =
  | 'characters'
  | 'locations'
  | 'organizations'
  | 'items'
  | 'concepts'
  | 'chapters';

export interface WikiCategoryInfo {
  key: WikiCategoryKey;
  label: string;
  dir: string;
  pageTypes: string[];
}

export const WIKI_CATEGORIES: WikiCategoryInfo[] = [
  { key: 'characters', label: '角色', dir: 'entities/characters', pageTypes: ['character'] },
  { key: 'locations', label: '地点', dir: 'entities/locations', pageTypes: ['location'] },
  {
    key: 'organizations',
    label: '组织',
    dir: 'entities/organizations',
    pageTypes: ['organization'],
  },
  { key: 'items', label: '物品', dir: 'entities/items', pageTypes: ['item'] },
  { key: 'concepts', label: '概念', dir: 'concepts', pageTypes: ['concept'] },
  {
    key: 'chapters',
    label: '章节',
    dir: 'chapters',
    pageTypes: ['chapter-summary', 'volume-summary', 'global-state'],
  },
];

export interface DivergenceListResponse {
  ok: true;
  divergences: WikiDivergence[];
}

export interface WikiHistoryResponse {
  ok: true;
  history: WikiHistoryEntry[];
}

export interface WikiSearchResponse {
  ok: true;
  hits: WikiSearchHit[];
}

export interface WikiPagesResponse {
  ok: true;
  pages: WikiPageMeta[];
}

export interface WikiLintReportsResponse {
  ok: true;
  reports: WikiLintReportSummary[];
}

export type { WikiDivergence, WikiLintResult, WikiLintReportSummary };
