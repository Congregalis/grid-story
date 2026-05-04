import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { GenerateInput, GenerateOutput, TaskType } from '@grid-story/llm';
import {
  type WikiLintIssue,
  type WikiLintReportSummary,
  type WikiLintResult,
  wikiFrontmatterSchema,
  wikiLintIssueSchema,
  wikiLintModelOutputSchema,
  wikiLintReportSummarySchema,
  wikiLintResultSchema,
} from '@grid-story/schema';
import matter from 'gray-matter';
import type { WikiHistoryEntry, WikiStore } from './wiki-store';

interface MemoryWikiModelRouter {
  generate(input: GenerateInput, task?: TaskType): Promise<GenerateOutput>;
}

interface MemoryWikiPromptRegistry {
  render(agent: string, task: string, vars: Record<string, string>, version?: number): string;
}

export interface LintRunnerOptions {
  wikiStoreFactory: (bookId: string) => WikiStore;
  router: MemoryWikiModelRouter;
  prompts: MemoryWikiPromptRegistry;
  now?: () => Date;
}

export interface RunLintInput {
  bookId: string;
  force?: boolean;
}

interface LintState {
  last_lint_at?: string | null;
  last_report_path?: string;
  last_issue_count?: number;
  last_skipped_at?: string;
  last_skipped_reason?: string;
}

interface WikiPageForLint {
  path: string;
  raw: string;
  content: string;
  frontmatter: Record<string, unknown>;
  title?: string;
  pageType?: string;
}

interface PendingDivergenceForLint {
  id: string;
  pagePath: string;
  kind: string;
  bibleValue?: string;
  newObservation?: string;
  evidence?: string;
  status?: string;
}

interface InferredAssertion {
  page_path: string;
  line_number: number;
  text: string;
}

const LINT_STATE_PATH = path.join('.meta', 'lint-state.json');
const REPORT_DIR = 'tracking/lint';
const INFERRED_SAMPLE_LIMIT = 20;
const AUTHOR_NOTE_START = '<!-- author-note start -->';
const AUTHOR_NOTE_END = '<!-- author-note end -->';
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;
const DIVERGENCE_FIELD = {
  page: '页面',
  kind: '类型',
  newObservation: '新观察',
  wikiObservation: 'Wiki 观察',
  evidence: '证据',
  extractedEvidence: '抽取证据',
  status: '状态',
} as const;

export class LintRunner {
  private readonly now: () => Date;

  constructor(private options: LintRunnerOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async run(input: RunLintInput): Promise<WikiLintResult> {
    const wikiStore = this.options.wikiStoreFactory(input.bookId);
    await wikiStore.ensureBase();

    const generatedAt = this.now().toISOString();
    const state = await this.readLintState(wikiStore);
    const history = await wikiStore.readHistory();
    if (!input.force && shouldSkipLint(history, state.last_lint_at)) {
      const reason = 'no ingest since last lint';
      await this.writeLintState(wikiStore, {
        ...state,
        last_skipped_at: generatedAt,
        last_skipped_reason: reason,
      });
      return wikiLintResultSchema.parse({
        ok: true,
        skipped: true,
        reason,
        issues: [],
        generatedAt,
        counts: emptyCounts(),
      });
    }

    const pages = await readWikiPages(wikiStore);
    const issues: WikiLintIssue[] = [];

    issues.push(...checkFrontmatter(pages));
    issues.push(...checkAuthorNoteIntegrity(pages));
    issues.push(...(await checkDeadLinks(wikiStore, pages)));
    issues.push(...(await checkOrphanPages(wikiStore, pages)));
    issues.push(...checkOverdueForeshadowing(pages));
    issues.push(...checkStaleChapterSummaries(pages));

    const divergences = parsePendingDivergences(pageRaw(pages, 'tracking/divergences-pending.md'));
    issues.push(...checkBibleWikiDivergences(divergences));

    issues.push(
      ...(await this.safeLlmCheck('character_consistency', () =>
        this.checkCharacterConsistency(pages, divergences),
      )),
    );
    issues.push(
      ...(await this.safeLlmCheck('timeline_consistency', () =>
        this.checkTimelineConsistency(pages),
      )),
    );
    issues.push(
      ...(await this.safeLlmCheck('inferred_review', () => this.checkInferredAssertions(pages))),
    );

    const finalIssues = sortIssues(dedupeIssues(issues));
    const reportPath = await this.writeReport(wikiStore, finalIssues, generatedAt);
    await this.writeLintState(wikiStore, {
      last_lint_at: generatedAt,
      last_report_path: reportPath,
      last_issue_count: finalIssues.length,
    });

    return wikiLintResultSchema.parse({
      ok: true,
      skipped: false,
      reportPath,
      issues: finalIssues,
      generatedAt,
      counts: countBySeverity(finalIssues),
    });
  }

  async listReports(bookId: string): Promise<WikiLintReportSummary[]> {
    const wikiStore = this.options.wikiStoreFactory(bookId);
    await wikiStore.ensureBase();
    const files = (await wikiStore.list(REPORT_DIR, { recursive: false }))
      .filter((file) => file.endsWith('.md'))
      .sort()
      .reverse();

    const reports = await Promise.all(
      files.map(async (file) => {
        const raw = await wikiStore.read(file);
        const parsed = matter(raw);
        const summary = {
          path: file,
          title: stringValue(parsed.data.title) ?? 'MemoryWiki Lint Report',
          generatedAt: stringValue(parsed.data.generated_at) ?? stringValue(parsed.data.updated_at),
          issueCount: numberValue(parsed.data.issue_count) ?? countIssueHeadings(parsed.content),
          critical: numberValue(parsed.data.critical_count) ?? 0,
          warning: numberValue(parsed.data.warning_count) ?? 0,
          info: numberValue(parsed.data.info_count) ?? 0,
        };
        return wikiLintReportSummarySchema.parse(summary);
      }),
    );

    return reports;
  }

  private async checkCharacterConsistency(
    pages: WikiPageForLint[],
    divergences: PendingDivergenceForLint[],
  ): Promise<WikiLintIssue[]> {
    const characterPages = pages.filter(
      (page) => page.pageType === 'character' || page.path.startsWith('entities/characters/'),
    );
    if (characterPages.length === 0) return [];

    const prompt = this.options.prompts.render('memory-wiki', 'lint-character', {
      character_pages: formatPagesForPrompt(characterPages),
      divergences: JSON.stringify(divergences, null, 2),
    });

    return this.runLlmIssueCheck('character_consistency', prompt);
  }

  private async checkTimelineConsistency(pages: WikiPageForLint[]): Promise<WikiLintIssue[]> {
    const timeline = pages.find((page) => page.path === 'tracking/timeline.md');
    if (!timeline || !timeline.content.includes('|')) return [];

    const prompt = this.options.prompts.render('memory-wiki', 'lint-timeline', {
      timeline_page: timeline.raw,
    });

    return this.runLlmIssueCheck('timeline_consistency', prompt);
  }

  private async checkInferredAssertions(pages: WikiPageForLint[]): Promise<WikiLintIssue[]> {
    const assertions = collectInferredAssertions(pages).slice(0, INFERRED_SAMPLE_LIMIT);
    if (assertions.length === 0) return [];

    const chapterNumbers = new Set(
      assertions.flatMap((assertion) =>
        [...assertion.text.matchAll(/\[ch-(\d+)/g)].map((match) => Number(match[1])),
      ),
    );
    const chapterContext = pages
      .filter((page) => {
        const match = page.path.match(/^chapters\/ch-(\d+)\.md$/);
        return match && chapterNumbers.has(Number(match[1]));
      })
      .map((page) => `## ${page.path}\n${page.content}`)
      .join('\n\n');

    const prompt = this.options.prompts.render('memory-wiki', 'lint-inferred-review', {
      inferred_assertions_json: JSON.stringify(assertions, null, 2),
      chapter_context: chapterContext || '（未找到对应章节摘要）',
    });

    return this.runLlmIssueCheck('inferred_review', prompt);
  }

  private async runLlmIssueCheck(check: string, prompt: string): Promise<WikiLintIssue[]> {
    const result = await this.options.router.generate(
      {
        messages: [
          { role: 'system', content: '你是 MemoryWiki 一致性 lint 检查器。只输出 JSON。' },
          { role: 'user', content: prompt },
        ],
        maxTokens: 2048,
        temperature: 0,
      },
      'review',
    );

    const parsed = wikiLintModelOutputSchema.parse(JSON.parse(extractJson(result.content)));
    return parsed.issues.map((issue) =>
      makeIssue({
        ...issue,
        check,
        source: 'llm',
      }),
    );
  }

  private async safeLlmCheck(
    check: string,
    run: () => Promise<WikiLintIssue[]>,
  ): Promise<WikiLintIssue[]> {
    try {
      return await run();
    } catch (error) {
      return [
        makeIssue({
          check,
          severity: 'warning',
          title: 'LLM lint 检查失败',
          message: error instanceof Error ? error.message : String(error),
          suggestion: '保留确定性 lint 结果；稍后重试该 LLM 检查。',
          source: 'deterministic',
        }),
      ];
    }
  }

  private async writeReport(
    wikiStore: WikiStore,
    issues: WikiLintIssue[],
    generatedAt: string,
  ): Promise<string> {
    const safeTime = safeTimestamp(generatedAt);
    const reportPath = `${REPORT_DIR}/report-${safeTime}.md`;
    const counts = countBySeverity(issues);
    const report = [
      '---',
      'title: "MemoryWiki Lint Report"',
      `slug: "report-${safeTime}"`,
      'page_type: "lint-report"',
      `updated_at: "${generatedAt}"`,
      `generated_at: "${generatedAt}"`,
      `issue_count: ${issues.length}`,
      `critical_count: ${counts.critical}`,
      `warning_count: ${counts.warning}`,
      `info_count: ${counts.info}`,
      '---',
      '',
      '# MemoryWiki Lint Report',
      '',
      `- 生成时间：${generatedAt}`,
      `- Critical：${counts.critical}`,
      `- Warning：${counts.warning}`,
      `- Info：${counts.info}`,
      '',
      ...formatIssuesForReport(issues),
      '',
    ].join('\n');

    await wikiStore.write(reportPath, report);
    return reportPath;
  }

  private async readLintState(wikiStore: WikiStore): Promise<LintState> {
    try {
      const raw = await fs.readFile(path.join(wikiStore.wikiRoot, LINT_STATE_PATH), 'utf-8');
      return JSON.parse(raw) as LintState;
    } catch {
      return { last_lint_at: null };
    }
  }

  private async writeLintState(wikiStore: WikiStore, state: LintState): Promise<void> {
    const target = path.join(wikiStore.wikiRoot, LINT_STATE_PATH);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  }
}

async function readWikiPages(wikiStore: WikiStore): Promise<WikiPageForLint[]> {
  const files = (await wikiStore.list('', { recursive: true })).filter(
    (file) => file.endsWith('.md') && !file.startsWith(`${REPORT_DIR}/`),
  );

  return Promise.all(
    files.map(async (file) => {
      const raw = await wikiStore.read(file);
      const parsed = matter(raw);
      return {
        path: file,
        raw,
        content: parsed.content,
        frontmatter: parsed.data,
        title: stringValue(parsed.data.title),
        pageType: stringValue(parsed.data.page_type),
      };
    }),
  );
}

function checkFrontmatter(pages: WikiPageForLint[]): WikiLintIssue[] {
  return pages.flatMap((page) => {
    const result = wikiFrontmatterSchema.safeParse(page.frontmatter);
    if (result.success) return [];
    return [
      makeIssue({
        check: 'frontmatter_validation',
        severity: 'warning',
        title: 'Frontmatter 不符合 MemoryWiki 规约',
        message: result.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
        page_path: page.path,
        suggestion: '补齐 page_type / slug / updated_at 三个核心字段。',
        source: 'deterministic',
        auto_fixable: true,
      }),
    ];
  });
}

function checkAuthorNoteIntegrity(pages: WikiPageForLint[]): WikiLintIssue[] {
  return pages.flatMap((page) => {
    const tokens = [...page.raw.matchAll(/<!-- author-note (?:start|end) -->/g)];
    let open = 0;
    const issues: WikiLintIssue[] = [];

    for (const token of tokens) {
      if (token[0] === AUTHOR_NOTE_START) {
        open++;
      } else if (open === 0) {
        issues.push(
          makeIssue({
            check: 'author_note_integrity',
            severity: 'critical',
            title: 'author-note 结束标记没有对应 start',
            message: '检测到孤立的 `<!-- author-note end -->`，下次 ingest 可能误改作者手写内容。',
            page_path: page.path,
            evidence: token[0],
            suggestion: '补齐对应 start 标记，或删除孤立 end 标记。',
            source: 'deterministic',
            auto_fixable: true,
          }),
        );
      } else {
        open--;
      }
    }

    if (open > 0) {
      issues.push(
        makeIssue({
          check: 'author_note_integrity',
          severity: 'critical',
          title: 'author-note 缺少结束标记',
          message: `检测到 ${open} 个未闭合 author-note 块，LLM 合并时无法可靠保护作者手写内容。`,
          page_path: page.path,
          evidence: AUTHOR_NOTE_START,
          suggestion: `追加 ${AUTHOR_NOTE_END}，确保 author-note 块完整闭合。`,
          source: 'deterministic',
          auto_fixable: true,
        }),
      );
    }

    return issues;
  });
}

async function checkDeadLinks(
  wikiStore: WikiStore,
  pages: WikiPageForLint[],
): Promise<WikiLintIssue[]> {
  const issues: WikiLintIssue[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    for (const link of extractWikiLinks(page.raw)) {
      const key = `${page.path}:${link}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        await wikiStore.resolveLink(link);
      } catch {
        issues.push(
          makeIssue({
            check: 'dead_wikilink',
            severity: 'warning',
            title: 'Wikilink 无法解析',
            message: `无法解析 [[${link}]]，slug 改名或页面删除后可能留下了死链。`,
            page_path: page.path,
            evidence: `[[${link}]]`,
            suggestion: '修正链接、补充 redirects.md，或恢复目标页面。',
            source: 'deterministic',
          }),
        );
      }
    }
  }

  return issues;
}

async function checkOrphanPages(
  wikiStore: WikiStore,
  pages: WikiPageForLint[],
): Promise<WikiLintIssue[]> {
  const incoming = new Map<string, number>();
  const contentPages = pages.filter(
    (page) =>
      !page.path.startsWith('index/') &&
      page.path !== 'log.md' &&
      !page.path.startsWith('tracking/lint/'),
  );

  for (const page of contentPages) {
    for (const link of extractWikiLinks(page.raw)) {
      try {
        const resolved = await wikiStore.resolveLink(link);
        if (resolved !== page.path) incoming.set(resolved, (incoming.get(resolved) ?? 0) + 1);
      } catch {
        // Dead links are reported by checkDeadLinks.
      }
    }
  }

  return pages
    .filter((page) => page.path.startsWith('entities/') || page.path.startsWith('concepts/'))
    .filter((page) => (incoming.get(page.path) ?? 0) === 0)
    .map((page) =>
      makeIssue({
        check: 'orphan_page',
        severity: 'info',
        title: '实体页缺少正文 wiki 引用',
        message: '该实体或概念页目前没有来自非索引页面的入链，可能是抽取残留或尚未接入叙事关系网。',
        page_path: page.path,
        suggestion: '确认该页面是否仍有效；若有效，在相关角色/地点/章节页补充 wikilink。',
        source: 'deterministic',
      }),
    );
}

function checkOverdueForeshadowing(pages: WikiPageForLint[]): WikiLintIssue[] {
  const latestChapter = latestChapterNumber(pages);
  if (!latestChapter) return [];

  const foreshadowing = pages.find((page) => page.path === 'tracking/foreshadowing.md');
  if (!foreshadowing) return [];

  const issues: WikiLintIssue[] = [];
  for (const row of markdownTableRows(foreshadowing.content)) {
    const expected = chapterNumberFromCell(row[2]);
    const actual = chapterNumberFromCell(row[3]);
    const status = row[4] ?? '';
    if (!expected || actual || !/待回收|open|opened/i.test(status)) continue;
    if (latestChapter <= expected + 5) continue;

    issues.push(
      makeIssue({
        check: 'foreshadowing_overdue',
        severity: 'info',
        title: '伏笔超过预计回收窗口',
        message: `伏笔「${row[0]}」预计 ch-${expected} 回收，但当前已到 ch-${latestChapter}。`,
        page_path: foreshadowing.path,
        evidence: row.join(' | '),
        suggestion: '决定是否尽快回收、延后预计回收章，或标记为废弃。',
        source: 'deterministic',
      }),
    );
  }

  return issues;
}

function checkStaleChapterSummaries(pages: WikiPageForLint[]): WikiLintIssue[] {
  return pages.flatMap((page) => {
    if (page.pageType !== 'chapter-summary') return [];
    const updatedAt = stringValue(page.frontmatter.updated_at);
    const chapterUpdatedAt = stringValue(page.frontmatter.chapter_updated_at);
    if (!updatedAt || !chapterUpdatedAt) return [];
    if (Date.parse(chapterUpdatedAt) <= Date.parse(updatedAt)) return [];

    return [
      makeIssue({
        check: 'stale_chapter_summary',
        severity: 'info',
        title: '章节摘要可能过期',
        message: '章节正文更新时间晚于 wiki 章摘要更新时间。',
        page_path: page.path,
        evidence: `chapter_updated_at=${chapterUpdatedAt}, updated_at=${updatedAt}`,
        suggestion: '重新 ingest 对应章节，或手动刷新该章摘要。',
        source: 'deterministic',
      }),
    ];
  });
}

function checkBibleWikiDivergences(divergences: PendingDivergenceForLint[]): WikiLintIssue[] {
  return divergences
    .filter(
      (divergence) =>
        divergence.status !== 'resolved' &&
        (divergence.kind === 'bible_conflict' || Boolean(divergence.bibleValue)),
    )
    .map((divergence) =>
      makeIssue({
        check: 'bible_wiki_divergence',
        severity: 'warning',
        title: '存在待处理 Bible/Wiki 分歧',
        message: divergence.newObservation ?? 'Wiki 观察与 Bible 规范存在待处理分歧。',
        page_path: divergence.pagePath,
        evidence: divergence.evidence ?? divergence.bibleValue,
        suggestion: '在 DivergencesPanel 中拍板：采纳新观察、保留 Bible，或回修正文。',
        source: 'deterministic',
      }),
    );
}

function collectInferredAssertions(pages: WikiPageForLint[]): InferredAssertion[] {
  const assertions: InferredAssertion[] = [];
  const inferredRe = /\[(?:ch-\d+:\s*)?inferred\]/i;

  for (const page of pages) {
    const lines = page.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!inferredRe.test(lines[i])) continue;
      assertions.push({
        page_path: page.path,
        line_number: i + 1,
        text: lines[i].trim(),
      });
    }
  }

  return assertions;
}

function parsePendingDivergences(content: string): PendingDivergenceForLint[] {
  const matches = [...content.matchAll(/^###\s+(.+)$/gm)];
  const entries: PendingDivergenceForLint[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const next = matches[i + 1];
    const block = content.slice(match.index ?? 0, next?.index ?? content.length);
    const fields = parseBulletFields(block);
    entries.push({
      id: fields.ID ?? stableId(block),
      pagePath: fields[DIVERGENCE_FIELD.page] ?? match[1].trim(),
      kind: fields[DIVERGENCE_FIELD.kind] ?? 'wiki_conflict',
      bibleValue: fields.Bible,
      newObservation:
        fields[DIVERGENCE_FIELD.newObservation] ?? fields[DIVERGENCE_FIELD.wikiObservation],
      evidence: fields[DIVERGENCE_FIELD.extractedEvidence] ?? fields[DIVERGENCE_FIELD.evidence],
      status: fields[DIVERGENCE_FIELD.status],
    });
  }

  return entries;
}

function parseBulletFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const match = line.match(/^-\s+\*\*(.+?)\*\*[:：]\s*(.+)$/);
    if (match) fields[match[1].trim()] = match[2].trim();
  }
  return fields;
}

function extractWikiLinks(content: string): string[] {
  return [...content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((match) => match[1].trim());
}

function markdownTableRows(content: string): string[][] {
  return content
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) =>
      line
        .split('|')
        .map((cell) => cell.trim())
        .filter(Boolean),
    )
    .filter((cells) => cells.length > 0 && !cells[0].startsWith('-') && cells[0] !== '伏笔');
}

function latestChapterNumber(pages: WikiPageForLint[]): number | null {
  const numbers = pages.flatMap((page) => {
    const fromPath = page.path.match(/^chapters\/ch-(\d+)\.md$/)?.[1];
    const fromFrontmatter = numberValue(page.frontmatter.chapter_number);
    return [fromPath ? Number(fromPath) : null, fromFrontmatter].filter(isNumber);
  });

  return numbers.length > 0 ? Math.max(...numbers) : null;
}

function chapterNumberFromCell(value: string | undefined): number | null {
  if (!value || value === '-') return null;
  const match = value.match(/ch-(\d+)/i);
  return match ? Number(match[1]) : null;
}

function pageRaw(pages: WikiPageForLint[], pagePath: string): string {
  return pages.find((page) => page.path === pagePath)?.raw ?? '';
}

function formatPagesForPrompt(pages: WikiPageForLint[]): string {
  return pages.map((page) => `## ${page.path}\n${page.raw}`).join('\n\n');
}

function formatIssuesForReport(issues: WikiLintIssue[]): string[] {
  if (issues.length === 0) return ['## 结果', '', '未发现问题。'];

  const lines: string[] = [];
  for (const severity of ['critical', 'warning', 'info'] as const) {
    const scoped = issues.filter((issue) => issue.severity === severity);
    lines.push(`## ${severityLabel(severity)}（${scoped.length}）`, '');
    if (scoped.length === 0) {
      lines.push('- 无', '');
      continue;
    }

    for (const issue of scoped) {
      lines.push(`### ${issue.title}`);
      lines.push(`- **ID**：${issue.id}`);
      lines.push(`- **检查项**：${issue.check}`);
      if (issue.page_path) lines.push(`- **页面**：${issue.page_path}`);
      lines.push(`- **说明**：${issue.message}`);
      if (issue.evidence) lines.push(`- **证据**：${issue.evidence}`);
      if (issue.suggestion) lines.push(`- **建议**：${issue.suggestion}`);
      lines.push(`- **来源**：${issue.source}`);
      if (issue.auto_fixable) lines.push('- **可自动修复**：true');
      lines.push('');
    }
  }

  return lines;
}

function makeIssue(
  input: Omit<WikiLintIssue, 'id' | 'source' | 'auto_fixable'> & {
    id?: string;
    source?: WikiLintIssue['source'];
    auto_fixable?: boolean;
  },
): WikiLintIssue {
  return wikiLintIssueSchema.parse({
    auto_fixable: false,
    ...input,
    id:
      input.id ??
      stableId(
        [
          input.check,
          input.severity,
          input.page_path,
          input.title,
          input.message,
          input.evidence,
        ].join('|'),
      ),
  });
}

function dedupeIssues(issues: WikiLintIssue[]): WikiLintIssue[] {
  const seen = new Set<string>();
  const result: WikiLintIssue[] = [];
  for (const issue of issues) {
    if (seen.has(issue.id)) continue;
    seen.add(issue.id);
    result.push(issue);
  }
  return result;
}

function sortIssues(issues: WikiLintIssue[]): WikiLintIssue[] {
  return [...issues].sort((a, b) => {
    const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severity !== 0) return severity;
    return `${a.check}:${a.page_path ?? ''}:${a.title}`.localeCompare(
      `${b.check}:${b.page_path ?? ''}:${b.title}`,
    );
  });
}

function countBySeverity(issues: WikiLintIssue[]): WikiLintResult['counts'] {
  const counts = emptyCounts();
  for (const issue of issues) counts[issue.severity]++;
  return counts;
}

function emptyCounts(): WikiLintResult['counts'] {
  return { critical: 0, warning: 0, info: 0 };
}

function shouldSkipLint(
  history: WikiHistoryEntry[],
  lastLintAt: string | null | undefined,
): boolean {
  if (!lastLintAt) return false;
  const lastLintTime = Date.parse(lastLintAt);
  if (!Number.isFinite(lastLintTime)) return false;
  return !history.some(
    (entry) => entry.run_type === 'ingest' && Date.parse(entry.ts) > lastLintTime,
  );
}

function countIssueHeadings(content: string): number {
  return [...content.matchAll(/^###\s+/gm)].length;
}

function severityLabel(severity: WikiLintIssue['severity']): string {
  if (severity === 'critical') return 'Critical';
  if (severity === 'warning') return 'Warning';
  return 'Info';
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function safeTimestamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function stableId(value: string): string {
  return `lint-${crypto.createHash('sha1').update(value).digest('hex').slice(0, 12)}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
