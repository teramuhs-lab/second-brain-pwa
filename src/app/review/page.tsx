'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { markDone, deleteEntry, snoozeEntry } from '@/lib/api';
import { useToast } from '@/shared/components/Toast';
import { CATEGORY_ICONS, CATEGORY_GRADIENTS } from '@/config/ui';

interface ReviewItem {
  id: string;
  title: string;
  category: string;
  status?: string;
  snippet?: string;
  created: string;
  source?: string;
}


const CATEGORY_TO_DB: Record<string, string> = {
  People: 'people',
  Projects: 'projects',
  Ideas: 'ideas',
  Admin: 'admin',
};

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [stats, setStats] = useState({ reviewed: 0, completed: 0, archived: 0, snoozed: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const { showSuccess, showError } = useToast();

  // Fetch recent items
  useEffect(() => {
    async function fetchRecentItems() {
      setIsLoading(true);
      try {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'everything from the past 3 days',
            semantic: false,
          }),
        });
        const data = await response.json();
        if (data.status === 'success' && data.results) {
          setItems(data.results.slice(0, 20)); // Max 20 items to review
        }
      } catch (error) {
        console.error('Failed to fetch items:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchRecentItems();
  }, []);

  const currentItem = items[currentIndex];
  const progress = items.length > 0 ? ((currentIndex) / items.length) * 100 : 0;
  const isComplete = currentIndex >= items.length;

  // Handle swipe gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    currentXRef.current = e.touches[0].clientX;
    const diff = currentXRef.current - startXRef.current;

    if (cardRef.current) {
      const rotation = diff * 0.05;
      cardRef.current.style.transform = `translateX(${diff}px) rotate(${rotation}deg)`;

      if (diff > 50) {
        setSwipeDirection('right');
      } else if (diff < -50) {
        setSwipeDirection('left');
      } else {
        setSwipeDirection(null);
      }
    }
  };

  const handleTouchEnd = async () => {
    const diff = currentXRef.current - startXRef.current;

    if (cardRef.current) {
      cardRef.current.style.transform = '';
    }

    if (diff > 100) {
      // Swipe right = Mark as done/Keep
      await handleKeep();
    } else if (diff < -100) {
      // Swipe left = Archive
      await handleArchive();
    }

    setSwipeDirection(null);
    startXRef.current = 0;
    currentXRef.current = 0;
  };

  const handleKeep = useCallback(async () => {
    if (!currentItem || actionLoading) return;

    setActionLoading(true);
    try {
      const db = CATEGORY_TO_DB[currentItem.category] || 'admin';
      if (currentItem.category === 'Admin' && currentItem.status !== 'Done') {
        await markDone(currentItem.id, db);
        setStats(s => ({ ...s, completed: s.completed + 1 }));
        showSuccess('Marked as done!');
      } else {
        setStats(s => ({ ...s, reviewed: s.reviewed + 1 }));
        showSuccess('Kept!');
      }
      setCurrentIndex(i => i + 1);
    } catch {
      showError('Action failed');
    } finally {
      setActionLoading(false);
    }
  }, [currentItem, actionLoading, showSuccess, showError]);

  const handleArchive = useCallback(async () => {
    if (!currentItem || actionLoading) return;

    setActionLoading(true);
    try {
      await deleteEntry(currentItem.id);
      setStats(s => ({ ...s, archived: s.archived + 1 }));
      showSuccess('Archived!');
      setCurrentIndex(i => i + 1);
    } catch {
      showError('Archive failed');
    } finally {
      setActionLoading(false);
    }
  }, [currentItem, actionLoading, showSuccess, showError]);

  const handleSnooze = useCallback(async () => {
    if (!currentItem || actionLoading) return;

    setActionLoading(true);
    try {
      const db = CATEGORY_TO_DB[currentItem.category] || 'admin';
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      await snoozeEntry(currentItem.id, db, nextWeek);
      setStats(s => ({ ...s, snoozed: s.snoozed + 1 }));
      showSuccess('Snoozed for 1 week!');
      setCurrentIndex(i => i + 1);
    } catch {
      showError('Snooze failed');
    } finally {
      setActionLoading(false);
    }
  }, [currentItem, actionLoading, showSuccess, showError]);

  const handleSkip = () => {
    setCurrentIndex(i => i + 1);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-[var(--text-muted)]">Loading items to review...</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <span className="text-6xl mb-4 block">🎉</span>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">All caught up!</h2>
          <p className="text-[var(--text-muted)]">No recent items to review.</p>
        </div>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <span className="text-6xl mb-4 block">✨</span>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Review Complete!</h2>
          <p className="text-[var(--text-muted)] mb-6">You reviewed {items.length} items.</p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-xl bg-[var(--bg-elevated)] p-3 text-center">
              <span className="text-2xl block mb-1">✅</span>
              <span className="text-lg font-semibold text-[var(--text-primary)]">{stats.completed}</span>
              <span className="text-xs text-[var(--text-muted)] block">Completed</span>
            </div>
            <div className="rounded-xl bg-[var(--bg-elevated)] p-3 text-center">
              <span className="text-2xl block mb-1">📦</span>
              <span className="text-lg font-semibold text-[var(--text-primary)]">{stats.archived}</span>
              <span className="text-xs text-[var(--text-muted)] block">Archived</span>
            </div>
            <div className="rounded-xl bg-[var(--bg-elevated)] p-3 text-center">
              <span className="text-2xl block mb-1">⏰</span>
              <span className="text-lg font-semibold text-[var(--text-primary)]">{stats.snoozed}</span>
              <span className="text-xs text-[var(--text-muted)] block">Snoozed</span>
            </div>
            <div className="rounded-xl bg-[var(--bg-elevated)] p-3 text-center">
              <span className="text-2xl block mb-1">👀</span>
              <span className="text-lg font-semibold text-[var(--text-primary)]">{stats.reviewed}</span>
              <span className="text-xs text-[var(--text-muted)] block">Reviewed</span>
            </div>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-[var(--accent-cyan)] px-6 py-3 text-[var(--bg-deep)] font-medium"
          >
            Review More
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pt-8 pb-24">
      {/* Header */}
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Daily Review</h1>
        <p className="text-sm text-[var(--text-muted)]">
          {currentIndex + 1} of {items.length} items
        </p>
      </header>

      {/* Progress bar */}
      <div className="mb-8 h-1 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Swipe indicators */}
      <div className="flex justify-between mb-4 px-4">
        <div className={`text-sm transition-opacity ${swipeDirection === 'left' ? 'opacity-100 text-red-400' : 'opacity-30'}`}>
          ← Archive
        </div>
        <div className={`text-sm transition-opacity ${swipeDirection === 'right' ? 'opacity-100 text-green-400' : 'opacity-30'}`}>
          Keep →
        </div>
      </div>

      {/* Card */}
      <div
        ref={cardRef}
        className="glass-card p-6 mx-auto max-w-sm touch-pan-y transition-transform"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Category badge */}
        <div className="flex items-center gap-2 mb-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${CATEGORY_GRADIENTS[currentItem.category] || 'from-gray-500 to-gray-600'}`}>
            <span className="text-lg">{CATEGORY_ICONS[currentItem.category] || '📄'}</span>
          </div>
          <div>
            <span className="text-sm text-[var(--text-muted)]">{currentItem.category}</span>
            {currentItem.status && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                {currentItem.status}
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">
          {currentItem.title}
        </h2>

        {/* Snippet */}
        {currentItem.snippet && (
          <p className="text-sm text-[var(--text-secondary)] mb-4 line-clamp-4">
            {currentItem.snippet}
          </p>
        )}

        {/* Source indicator */}
        {currentItem.source && (
          <div className="flex items-center gap-2 text-xs text-[var(--accent-cyan)]">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Has source link
          </div>
        )}

        {/* Created date */}
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Added {new Date(currentItem.created).toLocaleDateString()}
        </p>
      </div>

      {/* Action buttons */}
      <div className="mt-8 flex justify-center gap-4">
        {/* Archive */}
        <button
          onClick={handleArchive}
          disabled={actionLoading}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 text-red-400 transition-all hover:bg-red-500/30 disabled:opacity-50"
          title="Archive"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>

        {/* Snooze */}
        <button
          onClick={handleSnooze}
          disabled={actionLoading}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500/20 text-yellow-400 transition-all hover:bg-yellow-500/30 disabled:opacity-50"
          title="Snooze 1 week"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </button>

        {/* Skip */}
        <button
          onClick={handleSkip}
          disabled={actionLoading}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)] transition-all hover:bg-[var(--bg-surface)] disabled:opacity-50"
          title="Skip"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="13 17 18 12 13 7" />
            <polyline points="6 17 11 12 6 7" />
          </svg>
        </button>

        {/* Keep / Done */}
        <button
          onClick={handleKeep}
          disabled={actionLoading}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20 text-green-400 transition-all hover:bg-green-500/30 disabled:opacity-50"
          title={currentItem.category === 'Admin' ? 'Mark Done' : 'Keep'}
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>

      {/* Instructions */}
      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
        Swipe right to keep, left to archive, or use buttons below
      </p>
    </div>
  );
}
