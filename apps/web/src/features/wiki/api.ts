import { api } from '../../lib/api';
import type {
  DivergenceListResponse,
  WikiHistoryResponse,
  WikiPageDetail,
  WikiPagesResponse,
  WikiSearchResponse,
} from './types';
import type {
  WikiLintReportSummary,
  WikiLintResult,
  WikiDivergence,
} from '@grid-story/schema';

const enc = encodeURIComponent;

export function fetchWikiIndex(bookId: string) {
  return api.get<WikiPageDetail>(`/books/${enc(bookId)}/wiki/index`);
}

export function fetchWikiCategoryIndex(bookId: string, category: string) {
  return api.get<WikiPageDetail>(`/books/${enc(bookId)}/wiki/index/${enc(category)}`);
}

export function fetchWikiLog(bookId: string) {
  return api.get<{ ok: true; raw: string; content: string }>(
    `/books/${enc(bookId)}/wiki/log`,
  );
}

export function fetchWikiPages(bookId: string, dir?: string) {
  const query = dir ? `?dir=${enc(dir)}` : '';
  return api.get<WikiPagesResponse>(`/books/${enc(bookId)}/wiki/pages${query}`);
}

export function fetchWikiPage(bookId: string, pagePath: string) {
  // Don't double-encode slashes in the path.
  const safePath = pagePath
    .split('/')
    .map(enc)
    .join('/');
  return api.get<WikiPageDetail>(`/books/${enc(bookId)}/wiki/page/${safePath}`);
}

export function searchWiki(bookId: string, q: string) {
  return api.get<WikiSearchResponse>(`/books/${enc(bookId)}/wiki/search?q=${enc(q)}`);
}

export function fetchDivergences(bookId: string) {
  return api.get<DivergenceListResponse>(`/books/${enc(bookId)}/wiki/divergences`);
}

export function resolveDivergence(
  bookId: string,
  id: string,
  decision: string,
  note?: string,
) {
  return api.post<{ ok: true; divergence: WikiDivergence }>(
    `/books/${enc(bookId)}/wiki/divergences/${enc(id)}/resolve`,
    { decision, note },
  );
}

export function fetchWikiHistory(bookId: string) {
  return api.get<WikiHistoryResponse>(`/books/${enc(bookId)}/wiki/history`);
}

export function rollbackWiki(bookId: string, runId: string) {
  return api.post<{ ok: true; history: unknown }>(
    `/books/${enc(bookId)}/wiki/rollback/${enc(runId)}`,
  );
}

export function fetchLintReports(bookId: string) {
  return api.get<{ ok: true; reports: WikiLintReportSummary[] }>(
    `/books/${enc(bookId)}/wiki/lint/reports`,
  );
}

export function runLint(bookId: string, force?: boolean) {
  const query = force ? '?force=true' : '';
  return api.post<WikiLintResult>(`/books/${enc(bookId)}/wiki/lint${query}`);
}

// ── Mount / entity linking ────────────────────────────────────────────

export interface BibleCandidate {
  id: string;
  name: string;
  alreadyMounted: boolean;
  mountedPagePath: string | null;
}

export interface MountResult {
  ok: boolean;
  pagePath: string;
  bibleEntityId: string;
  bibleEntityName: string;
  newlyCreated: boolean;
}

export function fetchBibleCandidates(bookId: string, pagePath: string) {
  return api.get<{ ok: true; candidates: BibleCandidate[] }>(
    `/books/${enc(bookId)}/wiki/mount-candidates?page_path=${enc(pagePath)}`,
  );
}

export function mountWikiPage(
  bookId: string,
  pagePath: string,
  entityType: string,
  entityId: string,
) {
  return api.post<MountResult>(`/books/${enc(bookId)}/wiki/mount`, {
    page_path: pagePath,
    entity_type: entityType,
    entity_id: entityId,
  });
}

export function createAndMountWikiPage(
  bookId: string,
  pagePath: string,
  entityType: string,
  name: string,
) {
  return api.post<MountResult>(`/books/${enc(bookId)}/wiki/create-and-mount`, {
    page_path: pagePath,
    entity_type: entityType,
    name,
  });
}
