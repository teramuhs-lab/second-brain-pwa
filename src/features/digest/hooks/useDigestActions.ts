'use client';

import { useState, useCallback } from 'react';
import { fetchEntries, markDone, snoozeEntry, updateEntry, recategorize, deleteEntry } from '@/lib/api';
import type { Category, Entry } from '@/lib/types';
import type { StaleItem, DueTodayItem, InsightsData } from '../types';
import { CATEGORY_SINGULAR, CATEGORY_TO_DB } from '../types';

interface UseDigestActionsOptions {
  setInsights: React.Dispatch<React.SetStateAction<InsightsData | null>>;
}

export function useDigestActions({ setInsights }: UseDigestActionsOptions) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [revisitNote, setRevisitNote] = useState('');
  const [drillDownCategory, setDrillDownCategory] = useState<string | null>(null);
  const [drillDownItems, setDrillDownItems] = useState<Entry[]>([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  const removeStaleItem = useCallback((id: string) => {
    setInsights(prev => prev ? { ...prev, staleItems: prev.staleItems.filter(i => i.id !== id) } : null);
  }, [setInsights]);

  const handleComplete = useCallback(async (item: StaleItem) => {
    const db = CATEGORY_TO_DB[item.category];
    if (!db) return;
    setActionLoading(item.id);
    try {
      await markDone(item.id, db);
      removeStaleItem(item.id);
    } catch (err) {
      console.warn('Failed to complete item:', err);
    } finally {
      setActionLoading(null);
    }
  }, [removeStaleItem]);

  const handleSnooze = useCallback(async (item: StaleItem) => {
    const db = CATEGORY_TO_DB[item.category];
    if (!db) return;
    setActionLoading(item.id);
    try {
      const oneWeekFromNow = new Date();
      oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
      await snoozeEntry(item.id, db, oneWeekFromNow);
      removeStaleItem(item.id);
    } catch (err) {
      console.warn('Failed to snooze item:', err);
    } finally {
      setActionLoading(null);
    }
  }, [removeStaleItem]);

  const handleCompleteDueToday = useCallback(async (item: DueTodayItem) => {
    const db = CATEGORY_TO_DB[item.category];
    if (!db) return;
    setActionLoading(item.id);
    try {
      await markDone(item.id, db);
      setInsights(prev => prev ? { ...prev, dueToday: prev.dueToday.filter(i => i.id !== item.id) } : null);
    } catch (err) {
      console.warn('Failed to complete item:', err);
    } finally {
      setActionLoading(null);
    }
  }, [setInsights]);

  const handleCategoryDrillDown = useCallback(async (category: string) => {
    if (drillDownCategory === category) {
      setDrillDownCategory(null);
      return;
    }
    setDrillDownCategory(category);
    setDrillDownLoading(true);
    try {
      const items = await fetchEntries(category.toLowerCase());
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const recentItems = items.filter(item =>
        item.created && new Date(item.created) >= oneWeekAgo
      );
      setDrillDownItems(recentItems);
    } catch {
      setDrillDownItems([]);
    }
    setDrillDownLoading(false);
  }, [drillDownCategory]);

  const handleRevisit = useCallback(async (item: StaleItem) => {
    if (!revisitNote.trim()) return;
    const db = CATEGORY_TO_DB[item.category];
    if (!db) return;
    setActionLoading(item.id);
    try {
      const result = await updateEntry(item.id, db, { notes: revisitNote.trim() });
      if (result.status === 'error') {
        console.warn('Failed to revisit item:', result.error);
      } else {
        removeStaleItem(item.id);
        setRevisitNote('');
        setExpandedItem(null);
      }
    } catch (err) {
      console.warn('Failed to revisit item:', err);
    } finally {
      setActionLoading(null);
    }
  }, [revisitNote, removeStaleItem]);

  const handleConvert = useCallback(async (item: StaleItem, targetCategory: Category) => {
    const currentCategory = CATEGORY_SINGULAR[item.category];
    if (!currentCategory) return;
    setActionLoading(item.id);
    try {
      await recategorize(item.id, currentCategory, targetCategory, item.title);
      removeStaleItem(item.id);
    } catch (err) {
      console.warn('Failed to convert item:', err);
    } finally {
      setActionLoading(null);
    }
  }, [removeStaleItem]);

  const handleDismiss = useCallback(async (item: StaleItem) => {
    setActionLoading(item.id);
    try {
      await deleteEntry(item.id);
      removeStaleItem(item.id);
    } catch (err) {
      console.warn('Failed to dismiss item:', err);
    } finally {
      setActionLoading(null);
    }
  }, [removeStaleItem]);

  return {
    actionLoading,
    expandedItem,
    setExpandedItem,
    revisitNote,
    setRevisitNote,
    drillDownCategory,
    drillDownItems,
    drillDownLoading,
    handleComplete,
    handleSnooze,
    handleCompleteDueToday,
    handleCategoryDrillDown,
    handleRevisit,
    handleConvert,
    handleDismiss,
  };
}
