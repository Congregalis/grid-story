import {
  PixelButton,
  PixelInput,
  PixelList,
  PixelListItem,
  PixelScrollArea,
} from '@grid-story/pixel-kit';
import type {
  Book,
  Chapter,
  Character,
  Item,
  Location,
  Organization,
  ReviewIssue,
  ReviewResult,
} from '@grid-story/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CharterBanner } from '../components/CharterBanner';
import type { OutlineNode, OutlineRow, OutlineTreeResponse } from '../features/outline/types';
import { AiCandidatePanel } from '../features/writing/AiCandidatePanel';
import { AiDraftDialog, type DraftRequest } from '../features/writing/AiDraftDialog';
import { ProseEditor, type ProseEditorHandle } from '../features/writing/Editor';
import type { EntityEntry } from '../features/writing/EntityHighlight';
import { EntityRefPanel } from '../features/writing/EntityRefPanel';
import { ReviewPanel } from '../features/writing/ReviewPanel';
import { SaveIndicator } from '../features/writing/SaveIndicator';
import { SceneBriefBar } from '../features/writing/SceneBriefBar';
import { ShortcutHelp } from '../features/writing/ShortcutHelp';
import { useAutoSave } from '../features/writing/useAutoSave';
import { api, formatApiError } from '../lib/api';
import { useBookId } from '../lib/book';
import { toast } from '../lib/toast';

type ChapterRow = Chapter;

const REVIEW_PREFIX = 'grid-story:review:';

function loadReview(rootId: string): ReviewResult | null {
  try {
    const raw = localStorage.getItem(`${REVIEW_PREFIX}${rootId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ReviewResult;
  } catch {
    return null;
  }
}

function saveReview(rootId: string, result: ReviewResult) {
  try {
    localStorage.setItem(`${REVIEW_PREFIX}${rootId}`, JSON.stringify(result));
  } catch {
    // localStorage full — ignore
  }
}

function clearReview(rootId: string) {
  localStorage.removeItem(`${REVIEW_PREFIX}${rootId}`);
}

const CHAPTER_STATUS_LABEL: Record<ChapterRow['status'], string> = {
  draft: '草稿',
  review: '待审',
  revised: '已修改',
  final: '已定稿',
  published: '已发布',
};

const CHARTER_KEYS = [
  'worldview',
  'era',
  'themes',
  'hook',
  'pov',
  'tone',
  'rules',
  'avoid',
] as const;

function charterFilled(b: Book | undefined): number {
  if (!b) return 0;
  return CHARTER_KEYS.filter((k) => {
    const v = b[k as keyof Book];
    if (Array.isArray(v)) return v.length > 0;
    return v != null && v !== '';
  }).length;
}

interface ChapterHead {
  rootId: string;
  latest: ChapterRow;
  versionCount: number;
}

function groupByRoot(rows: ChapterRow[]): ChapterHead[] {
  const map = new Map<string, ChapterRow[]>();
  for (const r of rows) {
    const list = map.get(r.chapterRootId) ?? [];
    list.push(r);
    map.set(r.chapterRootId, list);
  }
  const heads: ChapterHead[] = [];
  for (const [rootId, list] of map) {
    list.sort((a, b) => b.version - a.version);
    heads.push({ rootId, latest: list[0], versionCount: list.length });
  }
  heads.sort((a, b) => a.latest.order - b.latest.order);
  return heads;
}

function nextChapterOrder(heads: ChapterHead[]): number {
  return heads.reduce((max, h) => Math.max(max, h.latest.order), 0) + 1;
}

/** Flatten outline tree into a row list + build a parent→children map for breadcrumbs. */
function flattenOutline(roots: OutlineNode[]): {
  rows: OutlineRow[];
  parentMap: Map<string, string | null>;
} {
  const rows: OutlineRow[] = [];
  const parentMap = new Map<string, string | null>();
  const walk = (n: OutlineNode, parentId: string | null) => {
    rows.push(n.node);
    parentMap.set(n.node.id, parentId);
    for (const child of n.children) {
      walk(child, n.node.id);
    }
  };
  for (const root of roots) {
    walk(root, null);
  }
  return { rows, parentMap };
}

function buildBreadcrumbs(
  nodeId: string | null,
  rows: OutlineRow[],
  parentMap: Map<string, string | null>,
): OutlineRow[] {
  if (!nodeId) return [];
  const crumbs: OutlineRow[] = [];
  let cur: string | null = nodeId;
  const byId = new Map(rows.map((r) => [r.id, r]));
  while (cur) {
    const node = byId.get(cur);
    if (node) crumbs.unshift(node);
    cur = parentMap.get(cur) ?? null;
  }
  // Remove the last element (the scene itself) — breadcrumbs show ancestors only
  return crumbs.slice(0, -1);
}

export default function WritingDesk() {
  const [bookId] = useBookId();
  const location = useLocation();
  const qc = useQueryClient();

  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [reviseInputOpen, setReviseInputOpen] = useState(false);
  const [reviseInstruction, setReviseInstruction] = useState('');
  const [candidate, setCandidate] = useState<{
    content: string;
    timestamp: Date;
    /** 'draft' = full replace, 'rewrite' = selection replace, 'full-rewrite' = full replace from AI修订 */
    type: 'draft' | 'rewrite' | 'full-rewrite';
  } | null>(null);
  const editorRef = useRef<ProseEditorHandle>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  // Entity click → auto-expand card in right panel
  const [focusedEntityKey, setFocusedEntityKey] = useState<string | null>(null);
  // Track whether auto-select from outline nav has fired
  const [autoSelectFired, setAutoSelectFired] = useState(false);
  // Sidebar collapse state
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  // Focus mode & help overlay
  const [focusMode, setFocusMode] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Right panel tab
  const [rightTab, setRightTab] = useState<'entities' | 'review'>('entities');
  // Review state
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [defaultInstruction, setDefaultInstruction] = useState<string | undefined>(undefined);
  const [rewriteTrigger, setRewriteTrigger] = useState(0);

  // Focus mode: toggle data attribute on <html> so CSS hides the NavBar
  useEffect(() => {
    document.documentElement.setAttribute('data-focus-mode', String(focusMode));
    return () => document.documentElement.removeAttribute('data-focus-mode');
  }, [focusMode]);

  const chaptersQuery = useQuery({
    queryKey: ['chapters', bookId],
    queryFn: () => api.get<ChapterRow[]>(`/bible/chapters?bookId=${encodeURIComponent(bookId)}`),
  });

  const bookQuery = useQuery<Book>({
    queryKey: ['book', bookId],
    queryFn: () => api.get<Book>(`/book/${encodeURIComponent(bookId)}`),
    retry: false,
    staleTime: 300_000,
  });

  const outlineQuery = useQuery<OutlineTreeResponse>({
    queryKey: ['outline-tree', bookId],
    queryFn: () =>
      api.get<OutlineTreeResponse>(`/outline/tree?bookId=${encodeURIComponent(bookId)}`),
    staleTime: 120_000,
  });

  // Entity data for inline highlighting (same keys as EntityRefPanel → cache dedupe)
  const charsQuery = useQuery<Character[]>({
    queryKey: ['bible-entities', bookId, 'character'],
    queryFn: () => api.get<Character[]>(`/bible/characters?bookId=${encodeURIComponent(bookId)}`),
    staleTime: 120_000,
  });
  const locsQuery = useQuery<Location[]>({
    queryKey: ['bible-entities', bookId, 'location'],
    queryFn: () => api.get<Location[]>(`/bible/locations?bookId=${encodeURIComponent(bookId)}`),
    staleTime: 120_000,
  });
  const orgsQuery = useQuery<Organization[]>({
    queryKey: ['bible-entities', bookId, 'organization'],
    queryFn: () =>
      api.get<Organization[]>(`/bible/organizations?bookId=${encodeURIComponent(bookId)}`),
    staleTime: 120_000,
  });
  const itemsQuery = useQuery<Item[]>({
    queryKey: ['bible-entities', bookId, 'item'],
    queryFn: () => api.get<Item[]>(`/bible/items?bookId=${encodeURIComponent(bookId)}`),
    staleTime: 120_000,
  });

  const highlightEntities = useMemo<EntityEntry[]>(() => {
    const entries: EntityEntry[] = [];
    for (const c of charsQuery.data ?? []) {
      entries.push({ id: c.id, name: c.name, type: 'character' as const, aliases: c.aliases });
    }
    for (const l of locsQuery.data ?? []) {
      entries.push({ id: l.id, name: l.name, type: 'location' as const });
    }
    for (const o of orgsQuery.data ?? []) {
      entries.push({ id: o.id, name: o.name, type: 'organization' as const });
    }
    for (const it of itemsQuery.data ?? []) {
      entries.push({ id: it.id, name: it.name, type: 'item' as const });
    }
    return entries;
  }, [charsQuery.data, locsQuery.data, orgsQuery.data, itemsQuery.data]);

  const heads = useMemo(() => groupByRoot(chaptersQuery.data ?? []), [chaptersQuery.data]);
  const nextOrder = useMemo(() => nextChapterOrder(heads), [heads]);
  const current = useMemo(
    () => heads.find((h) => h.rootId === selectedRoot) ?? null,
    [heads, selectedRoot],
  );

  // Outline data for scene brief + position highlight
  const { rows, parentMap } = useMemo(() => {
    const roots = outlineQuery.data?.roots ?? [];
    return flattenOutline(roots);
  }, [outlineQuery.data]);

  // Auto-select chapter when navigating from outline
  useEffect(() => {
    if (autoSelectFired) return;
    const state = location.state as { outlineNodeId?: string } | null;
    const outlineNodeId = state?.outlineNodeId;
    if (!outlineNodeId || heads.length === 0) return;

    // Collect scene IDs to match: if the target is a scene, match it directly;
    // if it's a chapter, match all descendant scenes.
    const sceneIds = new Set<string>();
    const targetNode = rows.find((r) => r.id === outlineNodeId);
    if (targetNode) {
      if (targetNode.type === 'scene') {
        sceneIds.add(targetNode.id);
      } else if (targetNode.type === 'chapter') {
        // Find all scene descendants
        const children = rows.filter((r) => r.parentId === targetNode.id);
        for (const c of children) {
          if (c.type === 'scene') sceneIds.add(c.id);
        }
      }
    }

    // Try to find a chapter bound to any of these scenes
    for (const h of heads) {
      if (h.latest.outlineSceneId && sceneIds.has(h.latest.outlineSceneId)) {
        setAutoSelectFired(true);
        setSelectedRoot(h.rootId);
        return;
      }
    }

    // No existing binding found — just mark as fired
    setAutoSelectFired(true);
  }, [autoSelectFired, location.state, heads, rows]);

  const boundSceneId = current?.latest.outlineSceneId ?? null;
  const boundScene = useMemo(
    () => (boundSceneId ? (rows.find((r) => r.id === boundSceneId) ?? null) : null),
    [boundSceneId, rows],
  );
  const sceneBreadcrumbs = useMemo(
    () => buildBreadcrumbs(boundSceneId, rows, parentMap),
    [boundSceneId, rows, parentMap],
  );

  // Find outline position for current chapter
  const outlinePosition = useMemo(() => {
    if (!boundScene || sceneBreadcrumbs.length === 0) return null;
    return `${sceneBreadcrumbs.map((b) => b.title).join(' → ')} → ${boundScene.title}`;
  }, [boundScene, sceneBreadcrumbs]);

  // Prev / next chapter helpers
  const currentIdx = useMemo(
    () => heads.findIndex((h) => h.rootId === selectedRoot),
    [heads, selectedRoot],
  );
  const prevChapter = currentIdx > 0 ? heads[currentIdx - 1] : null;
  const nextChapter = currentIdx < heads.length - 1 ? heads[currentIdx + 1] : null;

  // 切章 → 把 latest 内容灌入编辑态 + 恢复/清除审稿状态
  useEffect(() => {
    if (current) {
      setTitle(current.latest.title);
      setContent(current.latest.content);
      // Try to restore persisted review for this version
      const saved = loadReview(current.rootId);
      setReviewResult(saved);
    } else if (selectedRoot === '__new__') {
      setTitle('');
      setContent('');
      setReviewResult(null);
    }
    setCandidate(null);
    setDefaultInstruction(undefined);
  }, [current, selectedRoot]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['chapters', bookId] });
  };

  const createChapter = useMutation({
    mutationFn: async () => {
      const rootId = `chap_${crypto.randomUUID().slice(0, 8)}`;
      const order = nextOrder;
      const body = {
        bookId,
        chapterRootId: rootId,
        title: title.trim() || `第 ${order} 章`,
        content,
        version: 1,
        parentVersionId: null,
        status: 'draft' as const,
        wordCount: content.length,
        order,
        outlineSceneId: null,
        notes: null,
      };
      const created = await api.post<ChapterRow>('/bible/chapters', body);
      return created;
    },
    onSuccess: (created) => {
      invalidate();
      setSelectedRoot(created.chapterRootId);
      toast.success(`已创建：${created.title}`);
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '创建失败，请稍后重试')),
  });

  const saveDraft = useMutation({
    mutationFn: async (rootId: string) => {
      return api.put<{ ok: boolean; chapter: ChapterRow }>(`/chapter/${rootId}/draft`, {
        title: title.trim() || undefined,
        content,
      });
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '保存失败，请稍后重试')),
  });

  const saveVersion = useMutation({
    mutationFn: async (rootId: string) => {
      return api.post<ChapterRow>(`/chapter/${rootId}/new-version`, {
        title: title.trim() || undefined,
        content,
      });
    },
    onSuccess: (created) => {
      invalidate();
      toast.success(`已保存 v${created.version}`);
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '版本保存失败，请稍后重试')),
  });

  const transition = useMutation({
    mutationFn: async ({ rootId, status }: { rootId: string; status: ChapterRow['status'] }) =>
      api.post(`/chapter/${rootId}/transition`, { status }),
    onSuccess: (_data, vars) => {
      invalidate();
      // Clear review when leaving review/revised
      if (vars.status === 'draft' || vars.status === 'final') {
        setReviewResult(null);
        clearReview(vars.rootId);
      }
      toast.success(`状态已更新为${CHAPTER_STATUS_LABEL[vars.status]}`);
    },
    onError: (e: unknown) => toast.error(formatApiError(e, '状态更新失败，请稍后重试')),
  });

  const aiDraft = useMutation({
    mutationFn: async (req: DraftRequest) =>
      api.post<{ ok: boolean; wordCount: number; content: string }>('/agent/writing/first-draft', {
        bookId,
        chapterRootId: current?.rootId,
        currentTitle: title,
        currentContent: content,
        ...req,
      }),
    onSuccess: (resp) => {
      setCandidate({ content: resp.content, timestamp: new Date(), type: 'draft' });
      setAiOpen(false);
      setAiError(null);
      toast.success(`AI 首稿已生成（${resp.wordCount} 字），请在候选面板中审阅`);
    },
    onError: (e: unknown) => {
      setAiError(formatApiError(e, 'AI 起草失败，请稍后重试'));
    },
  });

  const dirty = !!current && (title !== current.latest.title || content !== current.latest.content);

  const newDraftDirty =
    selectedRoot === '__new__' && (title.trim() !== '' || content.trim() !== '');

  const guardedSelect = useCallback(
    (next: string | null) => {
      if ((dirty || newDraftDirty) && next !== selectedRoot) {
        const ok = confirm('当前章节有未保存的修改。继续切换会丢失它们 —— 确认吗？');
        if (!ok) return;
      }
      setSelectedRoot(next);
    },
    [dirty, newDraftDirty, selectedRoot],
  );

  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (dirty || newDraftDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [dirty, newDraftDirty]);

  const handleSave = useCallback(() => {
    if (selectedRoot === '__new__' || !current) {
      createChapter.mutate();
    } else {
      saveDraft.mutate(current.rootId);
    }
  }, [selectedRoot, current, createChapter, saveDraft]);

  const handleSaveVersion = useCallback(() => {
    if (!current) return;
    saveVersion.mutate(current.rootId);
  }, [current, saveVersion]);

  // Candidate actions
  const handleAccept = useCallback(async () => {
    if (!candidate) return;
    if (candidate.type === 'rewrite') {
      // Selection-based rewrite — replace only the highlighted text
      editorRef.current?.replaceSelection(candidate.content, candidate.timestamp);
    } else {
      // 'draft' or 'full-rewrite' — replace entire document
      editorRef.current?.insertAiContent(candidate.content, candidate.timestamp);
    }
    setCandidate(null);

    // Save immediately — read content directly from the editor to avoid
    // stale closure issues with React-batched state updates.
    const text = editorRef.current?.getText() ?? '';
    const rootId = selectedRoot;

    try {
      if (rootId === '__new__' || !current) {
        const order = nextOrder;
        const body = {
          bookId,
          chapterRootId: `chap_${crypto.randomUUID().slice(0, 8)}`,
          title: title.trim() || `第 ${order} 章`,
          content: text,
          version: 1,
          parentVersionId: null,
          status: 'draft' as const,
          wordCount: text.length,
          order,
          outlineSceneId: null,
          notes: null,
        };
        const created = await api.post<ChapterRow>('/bible/chapters', body);
        qc.invalidateQueries({ queryKey: ['chapters', bookId] });
        setSelectedRoot(created.chapterRootId);
        toast.success(`已创建：${created.title}`);
      } else {
        if (current.latest.status === 'draft') {
          await api.put(`/chapter/${rootId}/draft`, {
            title: title.trim() || undefined,
            content: text,
          });
        } else {
          await api.post<ChapterRow>(`/chapter/${rootId}/new-version`, {
            title: title.trim() || undefined,
            content: text,
          });
        }
        qc.invalidateQueries({ queryKey: ['chapters', bookId] });
      }
    } catch (e: unknown) {
      toast.error(formatApiError(e, '保存失败，请稍后重试'));
    }
  }, [candidate, selectedRoot, current, title, bookId, nextOrder, qc]);

  const handleReject = useCallback(() => setCandidate(null), []);

  const handleRegenerate = useCallback(() => {
    const type = candidate?.type ?? 'draft';
    setCandidate(null);
    if (type === 'draft') {
      setAiOpen(true);
    } else if (type === 'full-rewrite') {
      setReviseInputOpen(true);
    }
    // For selection rewrite, the user just re-selects text and clicks again
  }, [candidate]);

  // AI rewrite handler (from selection toolbar or full-text button)
  const rewriteMutation = useMutation({
    mutationFn: async (req: { selectedText: string; instruction: string; fullText?: boolean }) =>
      api.post<{ ok: boolean; rewritten: string }>('/agent/writing/rewrite', {
        bookId,
        chapterRootId: current?.rootId,
        currentTitle: title,
        currentContent: content,
        selectedText: req.selectedText,
        instruction: req.instruction,
        contextText: content,
      }),
    onSuccess: (resp, vars) => {
      setCandidate({
        content: resp.rewritten,
        timestamp: new Date(),
        type: vars.fullText ? 'full-rewrite' : 'rewrite',
      });
      toast.success('AI 改写完成，请在候选面板中审阅');
    },
    onError: (e: unknown) => {
      toast.error(formatApiError(e, 'AI 改写失败，请稍后重试'));
    },
  });

  const handleRewriteRequest = useCallback(
    (selectedText: string, instruction: string, fullText = false) => {
      setDefaultInstruction(undefined);
      rewriteMutation.mutate({ selectedText, instruction, fullText });
    },
    [rewriteMutation],
  );

  const reviewMutation = useMutation({
    mutationFn: async (rootId: string) =>
      api.post<{ ok: boolean; review: ReviewResult }>(
        '/agent/writing/review',
        {
          bookId,
          chapterRootId: rootId,
          content: contentRef.current,
        },
        AbortSignal.timeout(300_000),
      ),
    onSuccess: (resp, rootId) => {
      setReviewResult(resp.review);
      setRightTab('review');
      saveReview(rootId, resp.review);
      toast.success(`审稿完成，${resp.review.issues.length} 条意见`);
    },
    onError: (e: unknown) => {
      toast.error(formatApiError(e, '审稿失败，请稍后重试'));
    },
  });

  const handleReview = useCallback(
    (rootId: string) => {
      setRightTab('review');
      setRightCollapsed(false);
      reviewMutation.mutate(rootId);
      transition.mutate({ rootId, status: 'review' });
    },
    [reviewMutation, transition],
  );

  const handleNavigateToQuote = useCallback((quote: string) => {
    const found = editorRef.current?.selectText(quote);
    if (!found) {
      toast.info('未在正文中找到对应段落');
    }
  }, []);

  const handleAdoptSuggestion = useCallback((issue: ReviewIssue) => {
    if (issue.quote) {
      const found = editorRef.current?.selectText(issue.quote);
      if (!found) {
        toast.info('未在正文中找到对应段落，请手动选择');
      }
    }
    setDefaultInstruction(issue.suggestion ?? issue.comment);
    setRewriteTrigger((n) => n + 1);
  }, []);

  const handleDismissIssue = useCallback(
    (index: number) => {
      setReviewResult((prev) => {
        if (!prev) return prev;
        const next = { issues: prev.issues.filter((_, i) => i !== index) };
        // Persist filtered result
        if (current) saveReview(current.rootId, next);
        return next;
      });
    },
    [current],
  );

  const handleEntityClick = useCallback((type: string, id: string) => {
    setFocusedEntityKey(`${type}-${id}`);
    setRightCollapsed(false);
  }, []);

  // Auto-save: debounced in-place draft updates
  const { saveState, lastSavedAt } = useAutoSave({
    bookId,
    chapterRootId: current?.rootId ?? null,
    title,
    content,
    currentVersion: current?.latest.version ?? null,
    status: current?.latest.status ?? null,
    onSaved: invalidate,
  });

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        // Allow Cmd+S from inputs
        if (!(mod && e.key === 's')) return;
      }

      if (mod && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        handleSaveVersion();
      } else if (mod && e.key === 's') {
        e.preventDefault();
        if (dirty || newDraftDirty) handleSave();
      } else if (mod && e.key === 'j') {
        e.preventDefault();
        if (nextChapter) guardedSelect(nextChapter.rootId);
      } else if (mod && e.key === 'k') {
        e.preventDefault();
        if (prevChapter) guardedSelect(prevChapter.rootId);
      } else if (e.key === 'Escape' && focusMode) {
        e.preventDefault();
        setFocusMode(false);
      } else if (e.key === '?' && !mod) {
        e.preventDefault();
        setHelpOpen((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    handleSave,
    handleSaveVersion,
    nextChapter,
    prevChapter,
    guardedSelect,
    focusMode,
    dirty,
    newDraftDirty,
  ]);

  // Build grid columns via static Tailwind classes (JIT needs complete literal strings).
  // Four combinations: left expanded/collapsed × right expanded/collapsed.
  const gridClass = useMemo(() => {
    const base = 'grid gap-3 items-start';
    if (leftCollapsed && rightCollapsed) {
      return `${base} grid-cols-[36px_1fr] md:grid-cols-[36px_1fr_36px]`;
    }
    if (leftCollapsed && !rightCollapsed) {
      return `${base} grid-cols-[36px_1fr] md:grid-cols-[36px_1fr_200px]`;
    }
    if (!leftCollapsed && rightCollapsed) {
      return `${base} grid-cols-[200px_1fr] md:grid-cols-[200px_1fr_36px]`;
    }
    return `${base} grid-cols-[200px_1fr] md:grid-cols-[200px_1fr_200px]`;
  }, [leftCollapsed, rightCollapsed]);

  return (
    <div className="px-4 py-4 max-w-[1920px] mx-auto">
      <header className="mb-3 flex items-center gap-3 flex-wrap">
        <h1 className="font-pixel text-pixel-lg">写作</h1>
        <span className="font-ui text-sm text-ink-soft">章节草稿与版本</span>
        <span className="ml-auto flex items-center gap-3">
          <SaveIndicator state={saveState} lastSavedAt={lastSavedAt} />
          <Link
            to={`/books/${bookId}/wiki`}
            className="font-pixel text-pixel-sm border-2 border-outline rounded-sm px-2 py-0.5 hover:bg-primary-soft text-ink-soft"
            title="打开 Wiki"
          >
            📖 Wiki
          </Link>
          <button
            type="button"
            className="font-pixel text-pixel-sm border-2 border-outline rounded-sm px-2 py-0.5 hover:bg-primary-soft text-ink-soft"
            onClick={() => setFocusMode(!focusMode)}
            title={focusMode ? '退出专注模式 (Esc)' : '专注模式'}
          >
            {focusMode ? '退出专注' : '专注'}
          </button>
        </span>
      </header>

      {!focusMode && (
        <CharterBanner
          bookId={bookId}
          filled={charterFilled(bookQuery.data)}
          total={CHARTER_KEYS.length}
        />
      )}

      <div className={gridClass}>
        {/* ── Left column ── */}
        {!focusMode &&
          (leftCollapsed ? (
            <aside className="bg-surface border-2 border-outline rounded-sm shadow-pixel-1 flex flex-col items-center py-2 gap-2">
              <button
                type="button"
                className="font-pixel text-pixel-sm text-ink-mute hover:text-ink"
                onClick={() => setLeftCollapsed(false)}
                title="展开章节列表"
              >
                ▶
              </button>
              <span className="font-pixel text-pixel-sm text-ink-mute [writing-mode:vertical-lr] tracking-widest">
                章节
              </span>
            </aside>
          ) : (
            <aside className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-2">
              <div className="flex items-center gap-1 mb-2">
                <PixelButton className="flex-1" size="sm" onClick={() => guardedSelect('__new__')}>
                  + 新建
                </PixelButton>
                <button
                  type="button"
                  className="font-pixel text-pixel-sm text-ink-mute hover:text-ink px-1"
                  onClick={() => setLeftCollapsed(true)}
                  title="收起章节列表"
                >
                  ◀
                </button>
              </div>
              <PixelScrollArea maxHeight={360}>
                {chaptersQuery.isLoading && (
                  <div className="font-ui text-sm text-ink-soft p-2">加载中…</div>
                )}
                {chaptersQuery.isError && (
                  <div className="font-ui text-sm text-danger p-2">加载失败</div>
                )}
                {chaptersQuery.isSuccess && heads.length === 0 && (
                  <div className="font-ui text-sm text-ink-soft p-2">暂无章节</div>
                )}
                {heads.length > 0 && (
                  <PixelList>
                    {heads.map((h) => (
                      <PixelListItem
                        key={h.rootId}
                        active={h.rootId === selectedRoot}
                        onClick={() => guardedSelect(h.rootId)}
                        leading={
                          <span
                            className={`inline-block w-2 h-2 ${
                              h.latest.status === 'final'
                                ? 'bg-success'
                                : h.latest.status === 'review'
                                  ? 'bg-warning'
                                  : 'bg-secondary'
                            }`}
                          />
                        }
                        trailing={
                          <span className="font-pixel text-pixel-sm">v{h.latest.version}</span>
                        }
                      >
                        {h.latest.title}
                      </PixelListItem>
                    ))}
                  </PixelList>
                )}
              </PixelScrollArea>

              {/* Outline position */}
              {outlinePosition && (
                <div className="mt-2 pt-2 border-t-2 border-outline-soft">
                  <span className="font-pixel text-pixel-sm text-ink-mute">大纲位置</span>
                  <p className="font-ui text-xs text-ink-soft mt-0.5 leading-relaxed">
                    {outlinePosition}
                  </p>
                </div>
              )}

              {/* Prev / Next */}
              {heads.length > 1 && (
                <div className="mt-2 pt-2 border-t-2 border-outline-soft flex gap-1">
                  <PixelButton
                    size="sm"
                    variant="ghost"
                    disabled={!prevChapter}
                    onClick={() => prevChapter && guardedSelect(prevChapter.rootId)}
                    className="flex-1"
                  >
                    ←
                  </PixelButton>
                  <PixelButton
                    size="sm"
                    variant="ghost"
                    disabled={!nextChapter}
                    onClick={() => nextChapter && guardedSelect(nextChapter.rootId)}
                    className="flex-1"
                  >
                    →
                  </PixelButton>
                </div>
              )}
            </aside>
          ))}

        {/* ── Center: scene brief + editor ── */}
        <main className="min-w-0">
          {/* Scene brief bar */}
          {!focusMode && selectedRoot !== null && (
            <SceneBriefBar bookId={bookId} sceneNode={boundScene} breadcrumbs={sceneBreadcrumbs} />
          )}

          <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-5 min-h-[600px]">
            {selectedRoot === null ? (
              <div className="font-ui text-sm text-ink-soft text-center py-12">
                选一个章节，或点击「+ 新建章节」开始。
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <PixelInput
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="章节标题"
                    className="flex-1"
                  />
                  <PixelButton
                    variant="ghost"
                    onClick={() => {
                      setAiError(null);
                      setAiOpen(true);
                    }}
                  >
                    AI 首稿
                  </PixelButton>
                  {reviseInputOpen ? (
                    <div className="flex items-start gap-2 bg-surface-raised border border-outline rounded-sm p-2">
                      <textarea
                        className="flex-1 font-ui text-xs bg-surface border border-outline-soft rounded-sm px-2 py-1 text-ink resize-none focus:outline-none focus:border-primary"
                        placeholder="修订要求，如：把这段改得更紧凑…"
                        rows={2}
                        value={reviseInstruction}
                        onChange={(e) => setReviseInstruction(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setReviseInputOpen(false);
                            setReviseInstruction('');
                          }
                        }}
                      />
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          className="font-pixel text-[10px] text-primary hover:bg-primary-soft rounded-sm px-2 py-0.5 border border-primary"
                          onClick={() => {
                            handleRewriteRequest(
                              content,
                              reviseInstruction.trim() || '润色修订',
                              true,
                            );
                            setReviseInputOpen(false);
                            setReviseInstruction('');
                          }}
                        >
                          确定
                        </button>
                        <button
                          type="button"
                          className="font-pixel text-[10px] text-ink-mute hover:bg-surface-raised rounded-sm px-2 py-0.5 border border-outline-soft"
                          onClick={() => {
                            setReviseInputOpen(false);
                            setReviseInstruction('');
                          }}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <PixelButton
                      variant="ghost"
                      disabled={!content.trim() || rewriteMutation.isPending}
                      onClick={() => setReviseInputOpen(true)}
                    >
                      {rewriteMutation.isPending ? '修订中…' : 'AI 修订'}
                    </PixelButton>
                  )}
                  <PixelButton
                    disabled={
                      (!dirty && selectedRoot !== '__new__') ||
                      createChapter.isPending ||
                      saveDraft.isPending
                    }
                    onClick={handleSave}
                  >
                    {createChapter.isPending || saveDraft.isPending
                      ? '保存中…'
                      : selectedRoot === '__new__'
                        ? '创建章节'
                        : '保存'}
                  </PixelButton>
                  {current && (
                    <PixelButton
                      variant="ghost"
                      disabled={saveVersion.isPending}
                      onClick={handleSaveVersion}
                    >
                      {saveVersion.isPending ? '版本保存中…' : '存为新版本'}
                    </PixelButton>
                  )}
                </div>

                <div className="bg-surface-raised border-2 border-outline-soft rounded-sm p-6 min-h-[420px]">
                  <ProseEditor
                    ref={editorRef}
                    content={content}
                    onChange={setContent}
                    editable={
                      current?.latest.status === 'draft' &&
                      !aiDraft.isPending &&
                      !rewriteMutation.isPending
                    }
                    entities={highlightEntities}
                    onEntityClick={handleEntityClick}
                    onRewriteRequest={handleRewriteRequest}
                    defaultInstruction={defaultInstruction}
                    triggerOpen={rewriteTrigger}
                  />
                  {candidate && (
                    <AiCandidatePanel
                      content={candidate.content}
                      timestamp={candidate.timestamp}
                      onAccept={handleAccept}
                      onReject={handleReject}
                      onRegenerate={handleRegenerate}
                      pending={aiDraft.isPending}
                    />
                  )}
                </div>

                <footer className="mt-3 flex items-center gap-4 font-ui text-sm text-ink-soft flex-wrap">
                  <span>字数 {content.length}</span>
                  {current && (
                    <>
                      <span>·</span>
                      <span>
                        v{current.latest.version}（共 {current.versionCount}）
                      </span>
                      <span>·</span>
                      <span>状态 {CHAPTER_STATUS_LABEL[current.latest.status]}</span>
                      <div className="ml-auto flex gap-2">
                        {current.latest.status === 'draft' && (
                          <PixelButton
                            size="sm"
                            variant="ghost"
                            disabled={reviewMutation.isPending || transition.isPending}
                            onClick={() => handleReview(current.rootId)}
                          >
                            {reviewMutation.isPending
                              ? '审稿中…'
                              : transition.isPending
                                ? '状态更新中…'
                                : '送审'}
                          </PixelButton>
                        )}
                        {current.latest.status === 'review' && (
                          <>
                            <PixelButton
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                transition.mutate({ rootId: current.rootId, status: 'draft' })
                              }
                            >
                              继续编辑
                            </PixelButton>
                            <PixelButton
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                transition.mutate({ rootId: current.rootId, status: 'revised' })
                              }
                            >
                              标记已阅
                            </PixelButton>
                            <PixelButton
                              size="sm"
                              variant="ghost"
                              disabled={reviewMutation.isPending}
                              onClick={() => {
                                setRightTab('review');
                                setRightCollapsed(false);
                                reviewMutation.mutate(current.rootId);
                              }}
                            >
                              {reviewMutation.isPending ? '审稿中…' : '重新审稿'}
                            </PixelButton>
                          </>
                        )}
                        {current.latest.status === 'revised' && (
                          <>
                            <PixelButton
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                transition.mutate({ rootId: current.rootId, status: 'draft' })
                              }
                            >
                              继续编辑
                            </PixelButton>
                            <PixelButton
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                transition.mutate({ rootId: current.rootId, status: 'review' })
                              }
                            >
                              重新送审
                            </PixelButton>
                            <PixelButton
                              size="sm"
                              onClick={() =>
                                transition.mutate({ rootId: current.rootId, status: 'final' })
                              }
                            >
                              定稿
                            </PixelButton>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </footer>

                {aiDraft.isPending && (
                  <p className="mt-3 font-ui text-sm text-primary">
                    正在生成首稿，根据字数与模型，通常 30s–2min…
                  </p>
                )}
              </>
            )}
          </div>
        </main>

        {/* ── Right column: entity cards / review panel ── */}
        {!focusMode &&
          (rightCollapsed ? (
            <aside className="hidden md:flex bg-surface border-2 border-outline rounded-sm shadow-pixel-1 flex-col items-center py-2 gap-2 sticky top-4">
              <button
                type="button"
                className="font-pixel text-pixel-sm text-ink-mute hover:text-ink"
                onClick={() => setRightCollapsed(false)}
                title="展开面板"
              >
                ◀
              </button>
              <span className="font-pixel text-pixel-sm text-ink-mute [writing-mode:vertical-lr] tracking-widest">
                工具
              </span>
            </aside>
          ) : (
            <div className="hidden md:block sticky top-4 self-start">
              <div className="flex items-center justify-between mb-1">
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    className={`font-pixel text-pixel-sm px-2 py-0.5 rounded-sm border-2 transition-colors ${
                      rightTab === 'entities'
                        ? 'border-primary text-primary bg-primary-soft'
                        : 'border-outline text-ink-mute hover:text-ink'
                    }`}
                    onClick={() => setRightTab('entities')}
                  >
                    设定
                  </button>
                  <button
                    type="button"
                    className={`font-pixel text-pixel-sm px-2 py-0.5 rounded-sm border-2 transition-colors relative ${
                      rightTab === 'review'
                        ? 'border-primary text-primary bg-primary-soft'
                        : 'border-outline text-ink-mute hover:text-ink'
                    }`}
                    onClick={() => setRightTab('review')}
                  >
                    审稿
                    {reviewResult && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-success rounded-full" />
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  className="font-pixel text-pixel-sm text-ink-mute hover:text-ink px-1"
                  onClick={() => setRightCollapsed(true)}
                  title="收起面板"
                >
                  ▶
                </button>
              </div>
              {rightTab === 'entities' ? (
                <EntityRefPanel
                  bookId={bookId}
                  content={content}
                  highlightedId={focusedEntityKey}
                />
              ) : (
                <div className="min-h-[200px]">
                  {reviewMutation.isPending ? (
                    <ReviewPanel
                      review={{ issues: [] }}
                      pending
                      onNavigateToQuote={handleNavigateToQuote}
                      onDismissIssue={handleDismissIssue}
                    />
                  ) : reviewResult ? (
                    <ReviewPanel
                      review={reviewResult}
                      onAdoptSuggestion={handleAdoptSuggestion}
                      onDismissIssue={handleDismissIssue}
                      onNavigateToQuote={handleNavigateToQuote}
                      onRefresh={() => {
                        if (current) reviewMutation.mutate(current.rootId);
                      }}
                    />
                  ) : (
                    <div className="bg-surface border-2 border-outline rounded-md shadow-pixel-1 p-3">
                      <div className="font-ui text-xs text-ink-soft text-center">
                        暂无审稿结果。
                        {current?.latest.status === 'draft' && (
                          <span className="block mt-1">点击「送审」开始 AI 审稿。</span>
                        )}
                        {current?.latest.status === 'review' && (
                          <button
                            type="button"
                            className="font-pixel text-pixel-sm text-primary hover:underline mt-1"
                            disabled={reviewMutation.isPending}
                            onClick={() => reviewMutation.mutate(current.rootId)}
                          >
                            {reviewMutation.isPending ? '审稿中…' : '点击重新审稿'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
      </div>

      <AiDraftDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onSubmit={(req) => aiDraft.mutate(req)}
        pending={aiDraft.isPending}
        error={aiError}
      />

      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
