import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import type { SaveState } from './SaveIndicator';

const LOCAL_KEY_PREFIX = 'grid-story:autosave:';

interface UseAutoSaveOptions {
  bookId: string;
  chapterRootId: string | null;
  title: string;
  content: string;
  /** Version number of the current latest — skip save if it hasn't changed */
  currentVersion: number | null;
  /** Chapter status — auto-save only applies to 'draft' status */
  status?: string | null;
  /** Called after a successful auto-save so the parent can refresh queries */
  onSaved?: () => void;
}

export function useAutoSave({ bookId, chapterRootId, title, content, currentVersion, status, onSaved }: UseAutoSaveOptions) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ title: string; content: string } | null>(null);
  const versionOnMount = useRef<number | null>(currentVersion);

  // Update tracked version when currentVersion changes (e.g. after manual save)
  useEffect(() => {
    if (currentVersion !== null && currentVersion !== versionOnMount.current) {
      versionOnMount.current = currentVersion;
    }
  }, [currentVersion]);

  const saveToServer = useCallback(
    async (t: string, c: string) => {
      if (!chapterRootId) return;
      // Auto-save (PUT /draft) only works for chapters in 'draft' status
      if (status && status !== 'draft') return;
      const localKey = `${LOCAL_KEY_PREFIX}${bookId}/${chapterRootId}`;

      // Always save to localStorage as fallback
      try {
        localStorage.setItem(localKey, JSON.stringify({ title: t, content: c, at: Date.now() }));
      } catch {
        // localStorage full — ignore
      }

      if (!navigator.onLine) {
        setSaveState('offline');
        return;
      }

      setSaveState('saving');
      try {
        await api.put(`/chapter/${chapterRootId}/draft`, { title: t, content: c });
        setSaveState('saved');
        setLastSavedAt(new Date());
        localStorage.removeItem(localKey);
        onSaved?.();
      } catch (e: unknown) {
        // 409 = chapter is no longer draft (e.g. sent to review), silently skip
        if (e instanceof ApiError && e.status === 409) {
          setSaveState('saved');
          return;
        }
        setSaveState('error');
      }
    },
    [bookId, chapterRootId, status],
  );

  // Debounced auto-save
  useEffect(() => {
    if (!chapterRootId) return;
    if (currentVersion === null) return;
    if (status && status !== 'draft') return;

    // Skip if nothing has changed since mount/last version bump
    pendingRef.current = { title, content };

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const p = pendingRef.current;
      if (p) saveToServer(p.title, p.content);
    }, 5000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [title, content, chapterRootId, currentVersion, status, saveToServer]);

  // Online/offline detection
  useEffect(() => {
    const onOnline = () => {
      const p = pendingRef.current;
      if (p) saveToServer(p.title, p.content);
    };
    const onOffline = () => setSaveState('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [saveToServer]);

  // Recover local draft on mount
  useEffect(() => {
    if (!chapterRootId) return;
    const localKey = `${LOCAL_KEY_PREFIX}${bookId}/${chapterRootId}`;
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.content) {
          // Auto-save recovered from local — just report, content is already set by parent
          setSaveState('saved');
        }
      }
    } catch {
      // ignore
    }
    // Set version on mount
    versionOnMount.current = currentVersion;
  }, [bookId, chapterRootId]); // eslint-disable-line react-hooks/exhaustive-deps

  const forceSave = useCallback(async () => {
    if (!chapterRootId) return;
    // Force a full version save — caller handles this via newVersion mutation
    // Just clear the timer
    if (timerRef.current) clearTimeout(timerRef.current);
    const p = pendingRef.current;
    if (p) await saveToServer(p.title, p.content);
  }, [chapterRootId, saveToServer]);

  return { saveState, lastSavedAt, forceSave };
}
