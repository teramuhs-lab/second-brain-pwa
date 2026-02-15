'use client';

import { useState, useCallback } from 'react';
import { markDone, snoozeEntry, deleteEntry } from '@/lib/api';

const CATEGORY_TO_DB: Record<string, string> = {
  People: 'people',
  Projects: 'projects',
  Ideas: 'ideas',
  Admin: 'admin',
};

interface UseEntryActionsOptions {
  onSuccess?: (id: string, action: string) => void;
  onError?: (id: string, action: string, error: unknown) => void;
}

export function useEntryActions(options: UseEntryActionsOptions = {}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleMarkDone = useCallback(async (id: string, category: string) => {
    const db = CATEGORY_TO_DB[category];
    if (!db) return;
    setLoadingId(id);
    try {
      await markDone(id, db);
      options.onSuccess?.(id, 'done');
    } catch (err) {
      console.warn('Failed to mark done:', err);
      options.onError?.(id, 'done', err);
    } finally {
      setLoadingId(null);
    }
  }, [options]);

  const handleSnooze = useCallback(async (id: string, category: string, days = 7) => {
    const db = CATEGORY_TO_DB[category];
    if (!db) return;
    setLoadingId(id);
    try {
      const target = new Date();
      target.setDate(target.getDate() + days);
      await snoozeEntry(id, db, target);
      options.onSuccess?.(id, 'snooze');
    } catch (err) {
      console.warn('Failed to snooze:', err);
      options.onError?.(id, 'snooze', err);
    } finally {
      setLoadingId(null);
    }
  }, [options]);

  const handleDelete = useCallback(async (id: string) => {
    setLoadingId(id);
    try {
      await deleteEntry(id);
      options.onSuccess?.(id, 'delete');
    } catch (err) {
      console.warn('Failed to delete:', err);
      options.onError?.(id, 'delete', err);
    } finally {
      setLoadingId(null);
    }
  }, [options]);

  return { loadingId, handleMarkDone, handleSnooze, handleDelete };
}
