import type { ChekhovHook, SceneInitialConditions } from '@grid-story/schema';

export interface PayoffSelectorInput {
  hooks: ChekhovHook[];
  initialConditions: SceneInitialConditions;
  currentChapter: number;
  limit?: number;
}

export interface RankedHook {
  hook: ChekhovHook;
  score: number;
  reasons: string[];
}

export class PayoffSelector {
  select(input: PayoffSelectorInput): RankedHook[] {
    const limit = input.limit ?? 3;
    return input.hooks
      .filter((hook) => hook.status === 'planted' || hook.status === 'developing')
      .map((hook) => rankHook(hook, input.initialConditions, input.currentChapter))
      .sort((a, b) => b.score - a.score || b.hook.urgency - a.hook.urgency)
      .slice(0, limit);
  }
}

function rankHook(
  hook: ChekhovHook,
  initialConditions: SceneInitialConditions,
  currentChapter: number,
): RankedHook {
  const reasons: string[] = [];
  let score = hook.urgency * 10;

  const presentCharacters = new Set(initialConditions.presentCharacterIds);
  const matchedCharacters = hook.involvedCharacters.filter((id) => presentCharacters.has(id));
  if (matchedCharacters.length > 0) {
    score += matchedCharacters.length * 18;
    reasons.push('present-character');
  }

  if (
    initialConditions.locationId &&
    hook.involvedEntities.includes(initialConditions.locationId)
  ) {
    score += 12;
    reasons.push('location');
  }

  const { earliestChapter, latestChapter } = hook.preferredPayoffWindow;
  if (currentChapter >= earliestChapter && currentChapter <= latestChapter) {
    score += 24;
    reasons.push('inside-window');
  } else if (currentChapter < earliestChapter) {
    score += Math.max(0, 12 - (earliestChapter - currentChapter) * 3);
    reasons.push('before-window');
  } else {
    score += 30 + Math.min(20, (currentChapter - latestChapter) * 5);
    reasons.push('overdue');
  }

  const latestDistance = Math.abs(latestChapter - currentChapter);
  score += Math.max(0, 20 - latestDistance * 4);

  return { hook, score, reasons };
}
