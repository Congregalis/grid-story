import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

export interface EntityEntry {
  id: string;
  name: string;
  type: 'character' | 'location' | 'organization' | 'item';
  aliases?: string[];
}

const HIGHLIGHT_COLORS: Record<EntityEntry['type'], { bg: string; border: string }> = {
  character:    { bg: 'rgba(84,104,255,0.10)', border: 'rgba(84,104,255,0.35)' },
  location:     { bg: 'rgba(45,164,78,0.10)',  border: 'rgba(45,164,78,0.35)' },
  organization: { bg: 'rgba(240,160,0,0.10)',  border: 'rgba(240,160,0,0.35)' },
  item:         { bg: 'rgba(207,34,46,0.10)',  border: 'rgba(207,34,46,0.35)' },
};

const TYPE_LABEL: Record<EntityEntry['type'], string> = {
  character: '角色',
  location: '地点',
  organization: '组织',
  item: '物品',
};

const pluginKey = new PluginKey('entityHighlight');

interface Match {
  from: number;
  to: number;
  type: EntityEntry['type'];
  id: string;
  name: string;
}

function findMatches(doc: PMNode, entities: EntityEntry[]): Match[] {
  const matches: Match[] = [];
  const typePriority = { character: 0, organization: 1, location: 2, item: 3 };

  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const text = node.text ?? '';
    if (!text.trim()) return;
    const lower = text.toLowerCase();

    for (const ent of entities) {
      const name = ent.name.trim();
      if (!name) continue;

      const terms = [name.toLowerCase()];
      for (const a of ent.aliases ?? []) {
        const t = a.trim().toLowerCase();
        if (t && !terms.includes(t)) terms.push(t);
      }

      for (const term of terms) {
        let idx = 0;
        while (idx < lower.length) {
          const found = lower.indexOf(term, idx);
          if (found === -1) break;
          matches.push({
            from: pos + found,
            to: pos + found + term.length,
            type: ent.type,
            id: ent.id,
            name,
          });
          idx = found + 1;
        }
      }
    }
  });

  // Sort: by position ascending, longer match first, higher type priority first
  matches.sort((a, b) =>
    a.from - b.from || b.to - a.to || typePriority[a.type] - typePriority[b.type],
  );

  // Remove overlapping matches (keep first = longest/highest priority)
  const filtered: Match[] = [];
  for (const m of matches) {
    const last = filtered[filtered.length - 1];
    if (last && m.from < last.to) continue;
    filtered.push(m);
  }

  return filtered;
}

function buildDecorations(doc: PMNode, entities: EntityEntry[]): DecorationSet {
  if (entities.length === 0) return DecorationSet.empty;

  const matches = findMatches(doc, entities);
  const decos = matches.map((m) => {
    const cfg = HIGHLIGHT_COLORS[m.type];
    return Decoration.inline(m.from, m.to, {
      style: `background:${cfg.bg};border-bottom:2px solid ${cfg.border};border-radius:1px;cursor:pointer`,
      'data-entity-id': m.id,
      'data-entity-type': m.type,
      title: `${TYPE_LABEL[m.type]}：${m.name}`,
      class: 'entity-highlight',
    });
  });

  return DecorationSet.create(doc, decos);
}

const REFRESH_META = 'entityHighlightRefresh';

export const EntityHighlight = Extension.create({
  name: 'entityHighlight',

  addStorage() {
    return { entities: [] as EntityEntry[] };
  },

  addProseMirrorPlugins() {
    const ext = this;

    return [
      new Plugin({
        key: pluginKey,
        state: {
          init(_, state) {
            return buildDecorations(state.doc, ext.storage.entities);
          },
          apply(tr, oldSet, _oldState, newState) {
            if (tr.docChanged || tr.getMeta(REFRESH_META) != null) {
              return buildDecorations(newState.doc, ext.storage.entities);
            }
            return oldSet;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
