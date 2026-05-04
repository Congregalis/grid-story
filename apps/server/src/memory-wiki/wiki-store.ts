import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { normalizeWikiDir, normalizeWikiPath, stripMarkdownExt } from './path';

const CONTROL_DIRS = new Set(['.staging', '.bak']);
const CONTENT_EXCLUDES = new Set(['.staging', '.bak']);
const DEFAULT_BACKUP_LIMIT = 30;

export interface WikiStoreOptions {
  bookId: string;
  dataRoot?: string;
  backupLimit?: number;
  now?: () => Date;
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

export interface CommitStagingOptions {
  chapterId?: string;
  runType?: WikiHistoryEntry['run_type'];
}

interface CopyOptions {
  hardlink?: boolean;
  excludeNames?: Set<string>;
}

interface RedirectEntry {
  oldSlug: string;
  newSlug: string;
  bibleEntityId?: string;
}

export class WikiStore {
  readonly dataRoot: string;
  readonly wikiRoot: string;

  private readonly backupLimit: number;
  private readonly now: () => Date;

  constructor(options: WikiStoreOptions) {
    this.dataRoot = path.resolve(options.dataRoot ?? process.env.STORAGE_ROOT ?? './storage');
    this.wikiRoot = path.join(this.dataRoot, 'books', options.bookId, 'wiki');
    this.backupLimit = options.backupLimit ?? DEFAULT_BACKUP_LIMIT;
    this.now = options.now ?? (() => new Date());
  }

  async ensureDir(dir = ''): Promise<void> {
    await fs.mkdir(path.join(this.wikiRoot, normalizeWikiDir(dir)), { recursive: true });
  }

  async ensureBase(): Promise<void> {
    await fs.mkdir(this.wikiRoot, { recursive: true });

    const dirs = [
      'index',
      'entities/characters',
      'entities/locations',
      'entities/organizations',
      'entities/items',
      'chapters',
      'concepts',
      'tracking/lint',
      '.staging',
      '.bak',
      '.meta',
    ];
    await Promise.all(dirs.map((dir) => fs.mkdir(path.join(this.wikiRoot, dir), { recursive: true })));

    const now = this.nowIso();
    const files: Record<string, string> = {
      'index/_root.md': this.page('Wiki 索引（总目录）', 'root', 'index', '# Wiki 索引（总目录）\n'),
      'index/characters.md': this.page('角色索引', 'characters', 'index', '# 角色索引\n'),
      'index/locations.md': this.page('地点索引', 'locations', 'index', '# 地点索引\n'),
      'index/organizations.md': this.page('组织索引', 'organizations', 'index', '# 组织索引\n'),
      'index/items.md': this.page('物品索引', 'items', 'index', '# 物品索引\n'),
      'index/concepts.md': this.page('概念索引', 'concepts', 'index', '# 概念索引\n'),
      'index/chapters.md': this.page('章节索引', 'chapters', 'index', '# 章节索引\n'),
      'log.md': this.page('Wiki 活动日志', 'log', 'log', '# Wiki 活动日志\n'),
      'tracking/timeline.md': this.page('时间线', 'timeline', 'timeline', '# 时间线\n'),
      'tracking/foreshadowing.md': this.page('伏笔追踪', 'foreshadowing', 'foreshadowing', '# 伏笔追踪\n'),
      'tracking/loose-threads.md': this.page('遗留线索', 'loose-threads', 'loose-threads', '# 遗留线索\n'),
      'tracking/divergences-pending.md': this.page('分歧待处理', 'divergences-pending', 'divergences', '# 分歧待处理\n'),
      'tracking/redirects.md': this.page('Slug 重命名历史', 'redirects', 'redirects', '# Slug 重命名历史\n\n| 原 slug | 新 slug | bible_entity_id | 改名时间 |\n|---------|---------|-----------------|---------|\n'),
      'chapters/global.md': this.page('全书状态', 'global', 'global-state', '# 全书状态\n'),
      '.meta/lint-state.json': JSON.stringify({ last_lint_at: null }, null, 2),
    };

    await Promise.all(Object.entries(files).map(async ([relativePath, content]) => {
      const target = path.join(this.wikiRoot, relativePath);
      try {
        await fs.access(target);
      } catch {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content.replaceAll('{{updated_at}}', now), 'utf-8');
      }
    }));
  }

  async read(relativePath: string, runId?: string): Promise<string> {
    return fs.readFile(this.resolveRelative(relativePath, runId), 'utf-8');
  }

  async write(relativePath: string, content: string, runId?: string): Promise<void> {
    const target = this.resolveRelative(relativePath, runId);
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (runId && await this.existsAbsolute(target)) {
      await fs.unlink(target);
    }
    await fs.writeFile(target, content, 'utf-8');
  }

  async delete(relativePath: string, runId?: string): Promise<void> {
    await fs.rm(this.resolveRelative(relativePath, runId), { force: true });
  }

  async list(dir = '', options: { runId?: string; recursive?: boolean } = {}): Promise<string[]> {
    const baseDir = path.join(this.resolveRoot(options.runId), normalizeWikiDir(dir));
    const exists = await this.existsAbsolute(baseDir);
    if (!exists) return [];

    const files = await collectFiles(baseDir, {
      excludeNames: CONTENT_EXCLUDES,
      recursive: options.recursive ?? true,
    });

    return files
      .map((file) => path.relative(this.resolveRoot(options.runId), file).replaceAll(path.sep, '/'))
      .sort();
  }

  async openStaging(runId: string): Promise<string> {
    await this.ensureBase();
    const stagingPath = this.stagingPath(runId);
    await fs.rm(stagingPath, { recursive: true, force: true });
    await fs.mkdir(path.dirname(stagingPath), { recursive: true });
    await copyTree(this.wikiRoot, stagingPath, {
      hardlink: true,
      excludeNames: CONTROL_DIRS,
    });
    return stagingPath;
  }

  async commitStaging(runId: string, options: CommitStagingOptions = {}): Promise<WikiHistoryEntry> {
    const stagingPath = this.stagingPath(runId);
    if (!(await this.existsAbsolute(stagingPath))) {
      throw new Error(`Staging run not found: ${runId}`);
    }

    await this.validateStaging(stagingPath);

    const ts = this.nowIso();
    const backupName = safeTimestamp(ts);
    const backupDir = `.bak/${backupName}`;
    const backupPath = path.join(this.wikiRoot, backupDir);
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await copyTree(this.wikiRoot, backupPath, {
      hardlink: true,
      excludeNames: CONTROL_DIRS,
    });

    const diff = await diffTrees(this.wikiRoot, stagingPath);
    const replacementPath = path.join(path.dirname(this.wikiRoot), `.wiki-commit-${runId}`);
    await fs.rm(replacementPath, { recursive: true, force: true });
    await copyTree(stagingPath, replacementPath, { hardlink: false });
    await this.copyControlState(replacementPath);

    const entry: WikiHistoryEntry = {
      run_id: runId,
      ts,
      chapter_id: options.chapterId,
      run_type: options.runType ?? 'ingest',
      files_changed: diff.filesChanged,
      file_hashes_before: diff.before,
      file_hashes_after: diff.after,
      backup_dir: backupDir,
    };
    await appendHistory(path.join(replacementPath, 'wiki-history.jsonl'), entry);

    await this.swapReplacement(replacementPath);
    await this.pruneBackups();

    return entry;
  }

  async rollbackStaging(runId: string): Promise<WikiHistoryEntry> {
    await this.ensureBase();
    const history = await this.readHistory();
    const target = [...history].reverse().find((entry) => entry.run_id === runId && entry.backup_dir);
    if (!target?.backup_dir) {
      throw new Error(`No backup found for run: ${runId}`);
    }

    const backupPath = path.join(this.wikiRoot, target.backup_dir);
    if (!(await this.existsAbsolute(backupPath))) {
      throw new Error(`Backup directory missing for run: ${runId}`);
    }

    const rollbackRunId = `rollback-${runId}-${safeTimestamp(this.nowIso())}`;
    const replacementPath = path.join(path.dirname(this.wikiRoot), `.wiki-rollback-${rollbackRunId}`);
    await fs.rm(replacementPath, { recursive: true, force: true });
    await copyTree(backupPath, replacementPath, { hardlink: false });
    await this.copyControlState(replacementPath);

    const diff = await diffTrees(this.wikiRoot, backupPath);
    const entry: WikiHistoryEntry = {
      run_id: rollbackRunId,
      ts: this.nowIso(),
      run_type: 'rollback',
      rollback_of: runId,
      files_changed: diff.filesChanged,
      file_hashes_before: diff.before,
      file_hashes_after: diff.after,
      backup_dir: target.backup_dir,
    };
    await appendHistory(path.join(replacementPath, 'wiki-history.jsonl'), entry);

    await this.swapReplacement(replacementPath);
    return entry;
  }

  async resolveLink(linkText: string): Promise<string> {
    await this.ensureBase();
    const normalized = normalizeLink(linkText);
    const direct = await this.firstExistingPath(this.candidatesForLink(normalized));
    if (direct) return direct;

    const byEntityId = await this.findPageByBibleEntityId(normalized);
    if (byEntityId) return byEntityId;

    const bySlug = await this.findPageBySlug(path.posix.basename(normalized));
    if (bySlug) return bySlug;

    const redirects = await this.readRedirects();
    const slug = path.posix.basename(normalized);
    const redirect = redirects.find((entry) =>
      entry.oldSlug === normalized || entry.oldSlug === slug || entry.bibleEntityId === normalized
    );
    if (redirect) {
      const redirected = replaceSlug(normalized, redirect.newSlug);
      const resolved = await this.firstExistingPath(this.candidatesForLink(redirected));
      if (resolved) return resolved;

      const byRedirectSlug = await this.findPageBySlug(redirect.newSlug);
      if (byRedirectSlug) return byRedirectSlug;
    }

    throw new Error(`Wiki link not found: ${linkText}`);
  }

  async readHistory(): Promise<WikiHistoryEntry[]> {
    const historyPath = path.join(this.wikiRoot, 'wiki-history.jsonl');
    try {
      const content = await fs.readFile(historyPath, 'utf-8');
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as WikiHistoryEntry);
    } catch {
      return [];
    }
  }

  private resolveRoot(runId?: string): string {
    return runId ? this.stagingPath(runId) : this.wikiRoot;
  }

  private resolveRelative(relativePath: string, runId?: string): string {
    return path.join(this.resolveRoot(runId), normalizeWikiPath(relativePath));
  }

  private stagingPath(runId: string): string {
    if (!/^[a-zA-Z0-9._-]+$/.test(runId)) {
      throw new Error(`Invalid run id: ${runId}`);
    }
    return path.join(this.wikiRoot, '.staging', runId);
  }

  private async validateStaging(stagingPath: string): Promise<void> {
    const required = ['index/_root.md', 'log.md', 'tracking/divergences-pending.md'];
    const missing: string[] = [];
    for (const relativePath of required) {
      if (!(await this.existsAbsolute(path.join(stagingPath, relativePath)))) {
        missing.push(relativePath);
      }
    }
    if (missing.length > 0) {
      throw new Error(`Invalid wiki staging; missing ${missing.join(', ')}`);
    }
  }

  private async copyControlState(replacementPath: string): Promise<void> {
    const controlPaths = ['.bak', '.meta'];
    for (const controlPath of controlPaths) {
      const source = path.join(this.wikiRoot, controlPath);
      if (await this.existsAbsolute(source)) {
        await copyTree(source, path.join(replacementPath, controlPath), { hardlink: true });
      }
    }

    const historyPath = path.join(this.wikiRoot, 'wiki-history.jsonl');
    if (await this.existsAbsolute(historyPath)) {
      await fs.copyFile(historyPath, path.join(replacementPath, 'wiki-history.jsonl'));
    }
  }

  private async swapReplacement(replacementPath: string): Promise<void> {
    const parent = path.dirname(this.wikiRoot);
    const oldPath = path.join(parent, `.wiki-old-${safeTimestamp(this.nowIso())}-${crypto.randomUUID()}`);
    await fs.rename(this.wikiRoot, oldPath);
    try {
      await fs.rename(replacementPath, this.wikiRoot);
      await fs.rm(oldPath, { recursive: true, force: true });
    } catch (error) {
      await fs.rename(oldPath, this.wikiRoot).catch(() => {});
      throw error;
    }
  }

  private async pruneBackups(): Promise<void> {
    const bakRoot = path.join(this.wikiRoot, '.bak');
    const entries = await fs.readdir(bakRoot, { withFileTypes: true }).catch(() => []);
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();

    await Promise.all(dirs.slice(this.backupLimit).map((name) =>
      fs.rm(path.join(bakRoot, name), { recursive: true, force: true })
    ));
  }

  private candidatesForLink(link: string): string[] {
    const clean = stripMarkdownExt(link);
    const candidates = new Set<string>();
    candidates.add(`${clean}.md`);

    if (clean.startsWith('characters/')) candidates.add(`entities/${clean}.md`);
    if (clean.startsWith('locations/')) candidates.add(`entities/${clean}.md`);
    if (clean.startsWith('organizations/')) candidates.add(`entities/${clean}.md`);
    if (clean.startsWith('items/')) candidates.add(`entities/${clean}.md`);
    if (clean.startsWith('concepts/')) candidates.add(`${clean}.md`);
    if (!clean.includes('/')) {
      candidates.add(`entities/characters/${clean}.md`);
      candidates.add(`entities/locations/${clean}.md`);
      candidates.add(`entities/organizations/${clean}.md`);
      candidates.add(`entities/items/${clean}.md`);
      candidates.add(`concepts/${clean}.md`);
      candidates.add(`index/${clean}.md`);
      candidates.add(`tracking/${clean}.md`);
    }

    return [...candidates];
  }

  private async firstExistingPath(candidates: string[]): Promise<string | null> {
    for (const candidate of candidates) {
      const relativePath = normalizeWikiPath(candidate);
      if (await this.existsAbsolute(path.join(this.wikiRoot, relativePath))) {
        return relativePath;
      }
    }
    return null;
  }

  private async findPageByBibleEntityId(entityId: string): Promise<string | null> {
    const files = await this.list('', { recursive: true });
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const raw = await this.read(file);
      const parsed = matter(raw);
      if (parsed.data.bible_entity_id === entityId) return file;
    }
    return null;
  }

  private async findPageBySlug(slug: string): Promise<string | null> {
    const files = await this.list('', { recursive: true });
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const raw = await this.read(file);
      const parsed = matter(raw);
      if (parsed.data.slug === slug) return file;
    }
    return null;
  }

  private async readRedirects(): Promise<RedirectEntry[]> {
    const content = await this.read('tracking/redirects.md').catch(() => '');
    const rows = content.split('\n').filter((line) => line.trim().startsWith('|'));
    const redirects: RedirectEntry[] = [];

    for (const row of rows) {
      const cells = row.split('|').map((cell) => cell.trim()).filter(Boolean);
      if (cells.length < 2 || cells[0] === '原 slug' || cells[0].startsWith('-')) continue;
      redirects.push({
        oldSlug: cells[0],
        newSlug: cells[1],
        bibleEntityId: cells[2] && cells[2] !== '-' ? cells[2] : undefined,
      });
    }

    return redirects;
  }

  private async existsAbsolute(absolutePath: string): Promise<boolean> {
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private page(title: string, slug: string, pageType: string, content: string): string {
    return `---\ntitle: "${title}"\nslug: "${slug}"\npage_type: "${pageType}"\nupdated_at: "{{updated_at}}"\n---\n\n${content}`;
  }
}

async function appendHistory(historyPath: string, entry: WikiHistoryEntry): Promise<void> {
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.appendFile(historyPath, `${JSON.stringify(entry)}\n`, 'utf-8');
}

async function copyTree(source: string, target: string, options: CopyOptions = {}): Promise<void> {
  const sourceStat = await fs.stat(source);
  if (sourceStat.isDirectory()) {
    await fs.mkdir(target, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      if (options.excludeNames?.has(entry.name)) continue;
      await copyTree(path.join(source, entry.name), path.join(target, entry.name), options);
    }
    return;
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  if (options.hardlink) {
    try {
      await fs.link(source, target);
      return;
    } catch {
      // Cross-device temp roots cannot hardlink; copy keeps the transaction valid.
    }
  }
  await fs.copyFile(source, target);
}

async function collectFiles(
  root: string,
  options: { excludeNames?: Set<string>; recursive?: boolean } = {},
): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (options.excludeNames?.has(entry.name)) continue;
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (options.recursive ?? true) {
        files.push(...await collectFiles(absolutePath, options));
      }
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function diffTrees(beforeRoot: string, afterRoot: string) {
  const [beforeHashes, afterHashes] = await Promise.all([
    treeHashes(beforeRoot),
    treeHashes(afterRoot),
  ]);
  const paths = new Set([...Object.keys(beforeHashes), ...Object.keys(afterHashes)]);
  const filesChanged = [...paths].filter((file) => beforeHashes[file] !== afterHashes[file]).sort();

  return {
    filesChanged,
    before: Object.fromEntries(filesChanged.map((file) => [file, beforeHashes[file] ?? null])),
    after: Object.fromEntries(filesChanged.map((file) => [file, afterHashes[file] ?? null])),
  };
}

async function treeHashes(root: string): Promise<Record<string, string>> {
  const exists = await fs.access(root).then(() => true).catch(() => false);
  if (!exists) return {};

  const files = await collectFiles(root, {
    excludeNames: CONTENT_EXCLUDES,
    recursive: true,
  });
  const entries = await Promise.all(files.map(async (file) => {
    const content = await fs.readFile(file);
    const relativePath = path.relative(root, file).replaceAll(path.sep, '/');
    return [relativePath, crypto.createHash('sha256').update(content).digest('hex')] as const;
  }));

  return Object.fromEntries(entries);
}

function normalizeLink(linkText: string): string {
  const withoutBrackets = linkText.trim().replace(/^\[\[/, '').replace(/\]\]$/, '');
  const withoutAlias = withoutBrackets.split('|')[0].trim();
  return stripMarkdownExt(withoutAlias).replace(/^\/+/, '');
}

function replaceSlug(link: string, newSlug: string): string {
  const parts = stripMarkdownExt(link).split('/');
  parts[parts.length - 1] = newSlug;
  return parts.join('/');
}

function safeTimestamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
