'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ReadingItem } from '@/lib/types';
import { ReadingSummaryCard } from '@/components/ReadingSummaryCard';

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

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchReadingItems();
    setItems(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

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

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Business':
        return 'bg-blue-500/20 text-blue-400';
      case 'Tech':
        return 'bg-purple-500/20 text-purple-400';
      case 'Life':
        return 'bg-green-500/20 text-green-400';
      case 'Creative':
        return 'bg-orange-500/20 text-orange-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
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
    <div className="mx-auto max-w-2xl px-5 pb-24 pt-6">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] text-lg">
              📰
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">Reading</h1>
              <p className="text-sm text-[var(--text-muted)]">{items.length} articles saved</p>
            </div>
          </div>
          <button
            onClick={loadItems}
            disabled={isLoading}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-elevated)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <svg
              className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Filter tabs */}
        <div className="mt-4 flex gap-2">
          {(['all', 'today', 'week'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-[#10b981] text-white'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {f === 'all' ? 'All' : f === 'today' ? 'Today' : 'This Week'}
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

      {/* Empty state */}
      {!isLoading && filteredItems.length === 0 && (
        <div className="glass-card p-8 text-center">
          <div className="mb-4 text-4xl">📚</div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">No articles yet</h3>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Paste a URL in the Capture page to save and summarize articles.
          </p>
        </div>
      )}

      {/* Article list */}
      {!isLoading && filteredItems.length > 0 && (
        <div className="space-y-4">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="glass-card overflow-hidden transition-all duration-200 hover:border-[var(--border-subtle)]"
            >
              {/* Card header */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h2 className="font-semibold text-[var(--text-primary)] line-clamp-2">
                      {item.title}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                      {item.source && <span>{getHostname(item.source)}</span>}
                      <span>•</span>
                      <span className={`rounded-full px-2 py-0.5 ${getCategoryColor(item.category)}`}>
                        {item.category}
                      </span>
                      <span>•</span>
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

                {/* Expand button */}
                <button
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  className="mt-3 flex items-center gap-1 text-sm font-medium text-[#10b981] transition-colors hover:text-[#059669]"
                >
                  <svg
                    className={`h-4 w-4 transition-transform ${expandedId === item.id ? 'rotate-90' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {expandedId === item.id ? 'Hide Summary' : 'Read Summary'}
                </button>
              </div>

              {/* Expanded content - Use rich ReadingSummaryCard */}
              {expandedId === item.id && (
                <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
                  <ReadingSummaryCard item={item} />

                  {/* Actions */}
                  <div className="mt-4 flex items-center gap-2">
                    {item.source && (
                      <a
                        href={item.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-[#10b981] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#059669]"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M10 14L21 3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Open Original
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
  );
}
