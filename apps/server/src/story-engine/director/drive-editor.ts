import type {
  CreateDriveInput,
  DirectorDriveEditorInput,
  Drive,
  UpdateDriveInput,
} from '@grid-story/schema';
import type { StoryEngineStore } from '../store';

export interface DriveEditorResult {
  action: 'created' | 'updated';
  drive: Drive;
}

export class DriveEditor {
  constructor(private readonly store: StoryEngineStore) {}

  async edit(bookId: string, input: DirectorDriveEditorInput): Promise<DriveEditorResult> {
    if (!input.driveId) {
      const created = await this.store.createDrive(bookId, {
        characterId: input.characterId,
        horizon: must(input.horizon, 'horizon'),
        description: must(input.description, 'description'),
        goalState: must(input.goalState, 'goalState'),
        motivation: must(input.motivation, 'motivation'),
        priority: must(input.priority, 'priority'),
        progress: must(input.progress, 'progress'),
        status: must(input.status, 'status'),
        blockers: input.blockers ?? [],
        evolvedFrom: input.evolvedFrom ?? null,
        createdChapter: input.createdChapter ?? null,
        resolvedChapter: input.resolvedChapter ?? null,
        notes: appendDirectorNote(input.notes ?? null, input.reason),
      } satisfies Omit<CreateDriveInput, 'bookId'>);
      return { action: 'created', drive: created };
    }

    const existing = (await this.store.listDrives(bookId, { characterId: input.characterId })).find(
      (row) => row.id === input.driveId,
    );
    if (!existing) throw new Error(`Drive not found: ${input.driveId}`);

    const update: UpdateDriveInput = {
      notes: appendDirectorNote(input.notes ?? existing.notes, input.reason),
    };
    if (input.horizon !== undefined) update.horizon = input.horizon;
    if (input.description !== undefined) update.description = input.description;
    if (input.goalState !== undefined) update.goalState = input.goalState;
    if (input.motivation !== undefined) update.motivation = input.motivation;
    if (input.priority !== undefined) update.priority = input.priority;
    if (input.progress !== undefined) update.progress = input.progress;
    if (input.status !== undefined) update.status = input.status;
    if (input.blockers !== undefined) update.blockers = input.blockers;
    if (input.evolvedFrom !== undefined) update.evolvedFrom = input.evolvedFrom;
    if (input.createdChapter !== undefined) update.createdChapter = input.createdChapter;
    if (input.resolvedChapter !== undefined) update.resolvedChapter = input.resolvedChapter;

    const updated = await this.store.updateDrive(bookId, input.driveId, update);
    if (!updated) throw new Error(`Drive not found: ${input.driveId}`);
    return { action: 'updated', drive: updated };
  }
}

function appendDirectorNote(notes: string | null, reason: string): string {
  const fragments = [notes?.trim(), `[Director] ${new Date().toISOString()} ${reason}`].filter(
    (item): item is string => Boolean(item),
  );
  return fragments.join('\n\n');
}

function must<T>(value: T | undefined, key: string): T {
  if (value === undefined) throw new Error(`${key} is required`);
  return value;
}
