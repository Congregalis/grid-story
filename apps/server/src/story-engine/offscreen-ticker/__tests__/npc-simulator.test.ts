import type {
  ChekhovHook,
  Drive,
  OffscreenAction,
  Relationship,
  UpdateDriveInput,
} from '@grid-story/schema';
import { describe, expect, it } from 'vitest';
import type { StoryEngineStore } from '../../store';
import { NpcSimulator, type OffscreenCharacter } from '../npc-simulator';

const ts = '2026-05-07T00:00:00.000Z';

function makeDrive(id: string, characterId: string, progress = 30): Drive {
  return {
    id,
    bookId: 'book-1',
    characterId,
    horizon: 'medium',
    description: `${characterId} 想做的事`,
    goalState: '达成目标',
    motivation: '理由',
    priority: 1,
    progress,
    status: 'active',
    blockers: [],
    evolvedFrom: null,
    createdChapter: 1,
    resolvedChapter: null,
    notes: null,
    createdAt: ts,
    updatedAt: ts,
  };
}

function makeStubStore(drives: Drive[]) {
  const calls: { appended: number; driveUpdates: Array<{ id: string; input: UpdateDriveInput }> } = {
    appended: 0,
    driveUpdates: [],
  };
  const store = {
    appendOffscreenActions: async (
      bookId: string,
      inputs: Array<Omit<OffscreenAction, 'id' | 'bookId' | 'createdAt'>>,
    ) => {
      calls.appended = inputs.length;
      return inputs.map((input, idx) => ({
        ...input,
        id: `act-${idx}`,
        bookId,
        createdAt: ts,
      })) as OffscreenAction[];
    },
    updateDrive: async (_bookId: string, id: string, input: UpdateDriveInput) => {
      calls.driveUpdates.push({ id, input });
      const drive = drives.find((d) => d.id === id);
      return drive ? { ...drive, ...input } : null;
    },
  } as Partial<StoryEngineStore> as StoryEngineStore;
  return { store, calls };
}

function tier1Router(payload: object) {
  return {
    generate: async () => ({
      content: JSON.stringify(payload),
      usage: { inputTokens: 10, outputTokens: 20 },
    }),
  };
}

const promptStub = {
  render: () => 'rendered',
};

const characters: OffscreenCharacter[] = [
  { id: 'c1', name: '主角', importance: 'tier1' },
  { id: 'c2', name: '配角A', importance: 'tier2' },
  { id: 'c3', name: '配角B', importance: 'tier2' },
  { id: 'c4', name: '群众', importance: 'tier3' },
  { id: 'c5', name: '幕后大佬', importance: 'tier1' },
];

const relationships: Relationship[] = [];
const hooks: ChekhovHook[] = [];

describe('NpcSimulator', () => {
  it('skips tier3 and only ticks offstage tier1/tier2 characters', async () => {
    const drives = [makeDrive('d1', 'c1'), makeDrive('d5', 'c5')];
    const { store, calls } = makeStubStore(drives);

    let callCount = 0;
    const router = {
      generate: async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            content: JSON.stringify({
              summary: 'c5 在幕后筹谋',
              driveDeltas: [{ driveId: 'd5', progressDelta: 5, rationale: '推进' }],
              hookIds: [],
            }),
            usage: { inputTokens: 10, outputTokens: 20 },
          };
        }
        return {
          content: JSON.stringify({
            actions: [
              { characterId: 'c2', summary: 'c2 等候', driveDeltas: [], hookIds: [] },
              { characterId: 'c3', summary: 'c3 闲逛', driveDeltas: [], hookIds: [] },
            ],
          }),
          usage: { inputTokens: 5, outputTokens: 15 },
        };
      },
    };

    const simulator = new NpcSimulator(store, router, promptStub);
    const result = await simulator.tick({
      bookId: 'book-1',
      chapterId: 'chapter-3',
      chapterNumber: 3,
      onstageCharacterIds: ['c1'], // c1 onstage; c5 is offstage tier1
      characters,
      drives,
      relationships,
      hooks,
    });

    // c5 (tier1 offstage) → 1 detailed call
    // c2 + c3 (tier2 offstage) → 1 batch call
    // c4 (tier3) → skipped
    // c1 (onstage) → skipped
    expect(callCount).toBe(2);
    expect(calls.appended).toBe(3);
    expect(result.actions.map((a) => a.characterId).sort()).toEqual(['c2', 'c3', 'c5']);

    // d5 progress 30 + 5 = 35
    const update = calls.driveUpdates.find((u) => u.id === 'd5');
    expect(update?.input.progress).toBe(35);
  });

  it('drops invalid drive/hook ids returned by the model', async () => {
    const drives = [makeDrive('d-real', 'c5')];
    const { store, calls } = makeStubStore(drives);

    const router = tier1Router({
      summary: 'c5 在幕后',
      driveDeltas: [
        { driveId: 'd-real', progressDelta: 4, rationale: 'ok' },
        { driveId: 'd-fake', progressDelta: 10, rationale: 'hallucinated' },
      ],
      hookIds: ['hook-fake'],
    });

    const simulator = new NpcSimulator(store, router, promptStub);
    await simulator.tick({
      bookId: 'book-1',
      chapterId: 'chapter-3',
      chapterNumber: 3,
      onstageCharacterIds: ['c1'],
      characters: [characters[0], characters[4]], // c1 onstage tier1, c5 offstage tier1
      drives,
      relationships,
      hooks,
    });

    expect(calls.driveUpdates.length).toBe(1);
    expect(calls.driveUpdates[0].id).toBe('d-real');
    expect(calls.driveUpdates[0].input.progress).toBe(34); // 30 + 4, hallucinated drive dropped
  });
});
