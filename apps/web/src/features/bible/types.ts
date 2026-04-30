import type { Character } from '@grid-story/schema';

export type CharacterRow = Character;

export function emptyCharacter(bookId: string): Omit<Character, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    bookId,
    name: '',
    aliases: [],
    gender: null,
    age: null,
    species: null,
    appearance: null,
    personality: null,
    background: null,
    motivation: null,
    abilities: [],
    relationships: [],
    locationId: null,
    organizationIds: [],
    notes: null,
  };
}

export function csvToArray(s: string): string[] {
  return s
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function arrayToCsv(a: string[]): string {
  return a.join(', ');
}
