import { eq } from 'drizzle-orm';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import * as t from '../db/bible-tables';
import { normalizeWikiPath } from './path';
import type { WikiStore } from './wiki-store';

// ── type mapping ──────────────────────────────────────────────────────────

const PAGE_TYPE_TO_ENTITY: Record<string, string> = {
  character: 'characters',
  location: 'locations',
  organization: 'organizations',
  item: 'items',
  concept: 'concepts',
};

const WIKI_ENTITY_TYPES = new Set(Object.values(PAGE_TYPE_TO_ENTITY));

function isWikiEntityType(s: string): s is keyof typeof t & string {
  return WIKI_ENTITY_TYPES.has(s);
}

function getTable(entityType: string) {
  switch (entityType) {
    case 'characters': return t.characters;
    case 'locations': return t.locations;
    case 'organizations': return t.organizations;
    case 'items': return t.items;
    case 'concepts': return t.concepts;
    default: throw new MountError(`未知实体类型: ${entityType}`, 'UNKNOWN_TYPE');
  }
}

function pageTypeToEntityPath(pageType: string): string | null {
  return PAGE_TYPE_TO_ENTITY[pageType] ?? null;
}

// ── result types ──────────────────────────────────────────────────────────

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

export interface EntityMounterOptions {
  wikiStoreFactory: (bookId: string) => WikiStore;
}

// ── EntityMounter ─────────────────────────────────────────────────────────

export class EntityMounter {
  private wikiStoreFactory: (bookId: string) => WikiStore;

  constructor(options: EntityMounterOptions) {
    this.wikiStoreFactory = options.wikiStoreFactory;
  }

  /** List Bible entities that a wiki page can be mounted to. */
  async getBibleCandidates(
    bookId: string,
    pagePath: string,
  ): Promise<BibleCandidate[]> {
    const wikiStore = this.wikiStoreFactory(bookId);
    await wikiStore.ensureBase();

    const entityPath = await this.resolveEntityPath(wikiStore, pagePath);
    if (!entityPath) return [];

    const table = getTable(entityPath);
    const rows = await db
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(eq(table.bookId, bookId));

    const candidates: BibleCandidate[] = [];
    for (const row of rows) {
      const mountedPages = await wikiStore.findAllPagesByBibleEntityId(row.id);
      const alreadyMounted = mountedPages.length > 0;
      const selfMounted =
        alreadyMounted &&
        mountedPages.some((p) => normalizeWikiPath(p) === normalizeWikiPath(pagePath));
      candidates.push({
        id: row.id,
        name: row.name,
        alreadyMounted: alreadyMounted && !selfMounted,
        mountedPagePath: alreadyMounted && !selfMounted ? mountedPages[0] : null,
      });
    }

    return candidates;
  }

  /** Mount a wiki entity page to an existing Bible entity. */
  async mountToExisting(
    bookId: string,
    pagePath: string,
    entityType: string,
    entityId: string,
  ): Promise<MountResult> {
    const wikiStore = this.wikiStoreFactory(bookId);
    await wikiStore.ensureBase();

    // 1. validate page_type matches entityType
    const raw = await wikiStore.read(pagePath);
    const fm = matter(raw).data as Record<string, unknown>;
    const pageType = (fm.page_type as string | undefined) ?? '';
    const expectedEntityPath = pageTypeToEntityPath(pageType);
    if (!expectedEntityPath || expectedEntityPath !== entityType) {
      throw new MountError(
        `类型不匹配：wiki 页类型为 "${pageType}"，不能挂载到 "${entityType}"`,
        'TYPE_MISMATCH',
      );
    }

    // 2. verify Bible entity exists
    if (!isWikiEntityType(entityType)) {
      throw new MountError(`未知实体类型: ${entityType}`, 'UNKNOWN_TYPE');
    }

    const table = getTable(entityType);
    const rows = await db
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(eq(table.id, entityId));
    if (rows.length === 0) {
      throw new MountError(
        `实体不存在: ${entityType}/${entityId}`,
        'ENTITY_NOT_FOUND',
      );
    }

    // 3. uniqueness — this entity must not already be mounted to another page
    const mountedPages = await wikiStore.findAllPagesByBibleEntityId(entityId);
    const otherPages = mountedPages.filter(
      (p) => normalizeWikiPath(p) !== normalizeWikiPath(pagePath),
    );
    if (otherPages.length > 0) {
      throw new MountError(
        `此实体已挂载到 wiki 页 "${otherPages[0]}"，一个 Bible 实体只能挂载到一个 wiki 页`,
        'ALREADY_MOUNTED',
      );
    }

    // 4. update the wiki page frontmatter
    await wikiStore.patchFrontmatter(pagePath, {
      bible_entity_id: entityId,
      updated_at: new Date().toISOString(),
    });

    return {
      ok: true,
      pagePath,
      bibleEntityId: entityId,
      bibleEntityName: rows[0].name,
      newlyCreated: false,
    };
  }

  /** Create a new Bible entity from wiki page info and mount the page to it. */
  async createAndMount(
    bookId: string,
    pagePath: string,
    entityType: string,
    data: { name: string },
  ): Promise<MountResult> {
    const wikiStore = this.wikiStoreFactory(bookId);
    await wikiStore.ensureBase();

    if (!isWikiEntityType(entityType)) {
      throw new MountError(`未知实体类型: ${entityType}`, 'UNKNOWN_TYPE');
    }

    const table = getTable(entityType);
    const id = uuidv4();
    const ts = new Date().toISOString();
    const name = data.name.trim();

    const base: Record<string, unknown> = {
      id,
      bookId,
      name,
      createdAt: ts,
      updatedAt: ts,
    };

    // Fill in type-specific defaults
    switch (entityType) {
      case 'characters':
        Object.assign(base, {
          aliases: [],
          abilities: [],
          relationships: [],
          organizationIds: [],
          isProtagonist: false,
        });
        break;
      case 'organizations':
        Object.assign(base, { type: 'generic', memberIds: [] });
        break;
      case 'locations':
        Object.assign(base, { type: 'generic' });
        break;
      case 'items':
        Object.assign(base, { type: 'generic', abilities: [] });
        break;
      case 'concepts':
        Object.assign(base, { category: 'general' });
        break;
    }

    await db.insert(table).values(base as never);

    await wikiStore.patchFrontmatter(pagePath, {
      bible_entity_id: id,
      updated_at: ts,
    });

    return {
      ok: true,
      pagePath,
      bibleEntityId: id,
      bibleEntityName: name,
      newlyCreated: true,
    };
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private async resolveEntityPath(
    wikiStore: WikiStore,
    pagePath: string,
  ): Promise<string | null> {
    let raw: string;
    try {
      raw = await wikiStore.read(pagePath);
    } catch {
      return null;
    }
    const fm = matter(raw).data as Record<string, unknown>;
    const pageType = (fm.page_type as string | undefined) ?? '';
    return pageTypeToEntityPath(pageType);
  }
}

export class MountError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'MountError';
    this.code = code;
  }
}
