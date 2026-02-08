'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReadingItem } from '@/lib/types';
import { ReadingSummaryCard } from '@/components/ReadingSummaryCard';
import { PullToRefresh } from '@/features/tasks/components/PullToRefresh';

// Fetch ideas with source URL from Notion
async function fetchReadingItems(): Promise<ReadingItem[]> {
  try {
    const response = await fetch('/api/reading');
    if (!response.ok) throw new Error('Failed to fetch');
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Fetch reading items error:', error);
    return [];
  }
}

export default function ReadingPage() {
  const [items, setItems] = useState<ReadingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'today' | 'week'>('all');
  const hasFetched = useRef(false);

  const loadItems = useCallback(async (showLoadingState = true) => {
    if (showLoadingState) setIsLoading(true);
    const data = await fetchReadingItems();
    setItems(data);
    if (showLoadingState) setIsLoading(false);
  }, []);

  const handleRefresh = useCallback(async () => {
    await loadItems(false);
  }, [loadItems]);

  // Initial data fetch - only runs once
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    fetchReadingItems().then((data) => {
      setItems(data);
      setIsLoading(false);
    });
  }, []);

  // Filter items by date
  const filteredItems = items.filter((item) => {
    if (filter === 'all') return true;

    const itemDate = new Date(item.created_time);
    const now = new Date();

    if (filter === 'today') {
      return itemDate.toDateString() === now.toDateString();
    }

    if (filter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return itemDate >= weekAgo;
    }

    return true;
  });

  // Zen styling - neutral category colors
  const getCategoryColor = () => {
    return 'text-[var(--text-muted)]/60';
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getHostname = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="mx-auto max-w-2xl px-5 pb-24 pt-6">
      {/* Header - zen styling */}
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Reading</h1>
            <p className="text-xs text-[var(--text-muted)]/60">{items.length} saved</p>
          </div>
        </div>

        {/* Filter tabs - zen styling */}
        <div className="mt-4 flex gap-1">
          {(['all', 'today', 'week'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)]/60 hover:text-[var(--text-secondary)]'
              }`}
            >
              {f === 'all' ? 'All' : f === 'today' ? 'Today' : 'Week'}
            </button>
          ))}
        </div>
      </header>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-card animate-pulse p-4">
              <div className="h-5 w-3/4 rounded bg-[var(--bg-elevated)]" />
              <div className="mt-2 h-4 w-1/2 rounded bg-[var(--bg-elevated)]" />
              <div className="mt-3 h-16 rounded bg-[var(--bg-elevated)]" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state - zen styling */}
      {!isLoading && filteredItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <span className="text-sm text-[var(--text-muted)]/60">No articles yet</span>
          <span className="mt-1 text-xs text-[var(--text-muted)]/40">Paste a URL to save articles</span>
        </div>
      )}

      {/* Article list */}
      {!isLoading && filteredItems.length > 0 && (
        <div className="space-y-4">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-subtle)]/50 overflow-hidden transition-all duration-200"
            >
              {/* Card header */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h2 className="font-semibold text-[var(--text-primary)] line-clamp-2">
                      {item.title}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]/60">
                      {item.source && <span>{getHostname(item.source)}</span>}
                      <span className="opacity-40">·</span>
                      <span className={getCategoryColor()}>
                        {item.category}
                      </span>
                      <span className="opacity-40">·</span>
                      <span>{formatDate(item.created_time)}</span>
                    </div>
                  </div>
                </div>

                {/* One-liner preview */}
                {item.one_liner && (
                  <p className="mt-3 text-sm italic text-[var(--text-secondary)] line-clamp-2">
                    &ldquo;{item.one_liner}&rdquo;
                  </p>
                )}

                {/* Expand button - zen styling */}
                <button
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  className="mt-3 flex items-center gap-1 text-xs text-[var(--text-muted)]/60 transition-colors hover:text-[var(--text-secondary)]"
                >
                  <svg
                    className={`h-3.5 w-3.5 transition-transform ${expandedId === item.id ? 'rotate-90' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {expandedId === item.id ? 'Hide' : 'Summary'}
                </button>
              </div>

              {/* Expanded content - Use rich ReadingSummaryCard */}
              {expandedId === item.id && (
                <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
                  <ReadingSummaryCard item={item} />

                  {/* Actions - zen styling */}
                  <div className="mt-4 flex items-center gap-2">
                    {item.source && (
                      <a
                        href={item.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]/60 transition-colors hover:text-[var(--text-secondary)]"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M10 14L21 3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Open original
                      </a>
                    )}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
