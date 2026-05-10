import type {
  Book,
  Chapter,
  Character,
  Outline,
} from '@grid-story/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { storyEngineApi } from '../story-engine/api';
import { api } from '../../lib/api';
import type { StageContext } from './types';

interface UseStageContextResult {
  ctx: StageContext | null;
  loading: boolean;
  error: unknown;
}

/** 从一组 React Query 拉取构建 StageContext 所需的全部数据。 */
export function useStageContext(bookId: string): UseStageContextResult {
  const bookQuery = useQuery<Book>({
    queryKey: ['book', bookId],
    queryFn: () => api.get<Book>(`/book/${encodeURIComponent(bookId)}`),
    staleTime: 60_000,
    retry: false,
  });
  const charactersQuery = useQuery<Character[]>({
    queryKey: ['bible', 'characters', bookId],
    queryFn: () =>
      api.get<Character[]>(`/bible/characters?bookId=${encodeURIComponent(bookId)}`),
    staleTime: 60_000,
  });
  const decisionProfilesQuery = useQuery({
    queryKey: ['story-engine', 'decision-profiles', bookId],
    queryFn: () => storyEngineApi.listDecisionProfiles(bookId),
    staleTime: 60_000,
  });
  const drivesQuery = useQuery({
    queryKey: ['story-engine', 'drives', bookId],
    queryFn: () => storyEngineApi.listDrives(bookId),
    staleTime: 60_000,
  });
  const relationshipsQuery = useQuery({
    queryKey: ['story-engine', 'relationships', bookId],
    queryFn: () => storyEngineApi.listRelationships(bookId),
    staleTime: 60_000,
  });
  const worldVariablesQuery = useQuery({
    queryKey: ['story-engine', 'world-variables', bookId],
    queryFn: () => storyEngineApi.listWorldVariables(bookId),
    staleTime: 60_000,
  });
  const outlinesQuery = useQuery<Outline[]>({
    queryKey: ['bible', 'outlines', bookId],
    queryFn: () =>
      api.get<Outline[]>(`/bible/outlines?bookId=${encodeURIComponent(bookId)}`),
    staleTime: 60_000,
  });
  const chaptersQuery = useQuery<Chapter[]>({
    queryKey: ['chapters', bookId],
    queryFn: () =>
      api.get<Chapter[]>(`/bible/chapters?bookId=${encodeURIComponent(bookId)}`),
    staleTime: 30_000,
  });

  const loading =
    bookQuery.isLoading ||
    charactersQuery.isLoading ||
    decisionProfilesQuery.isLoading ||
    drivesQuery.isLoading ||
    relationshipsQuery.isLoading ||
    worldVariablesQuery.isLoading ||
    outlinesQuery.isLoading ||
    chaptersQuery.isLoading;

  const error =
    bookQuery.error ??
    charactersQuery.error ??
    decisionProfilesQuery.error ??
    drivesQuery.error ??
    relationshipsQuery.error ??
    worldVariablesQuery.error ??
    outlinesQuery.error ??
    chaptersQuery.error ??
    null;

  const ctx = useMemo<StageContext | null>(() => {
    if (!bookQuery.data) return null;
    return {
      book: bookQuery.data,
      characters: charactersQuery.data ?? [],
      decisionProfiles: decisionProfilesQuery.data ?? [],
      drives: drivesQuery.data ?? [],
      relationships: relationshipsQuery.data ?? [],
      worldVariables: worldVariablesQuery.data ?? [],
      outlines: outlinesQuery.data ?? [],
      chapters: chaptersQuery.data ?? [],
    };
  }, [
    bookQuery.data,
    charactersQuery.data,
    decisionProfilesQuery.data,
    drivesQuery.data,
    relationshipsQuery.data,
    worldVariablesQuery.data,
    outlinesQuery.data,
    chaptersQuery.data,
  ]);

  return { ctx, loading, error };
}
