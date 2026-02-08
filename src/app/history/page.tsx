'use client';

import { useState, useEffect } from 'react';
import { fetchEntries } from '@/lib/api';
import type { Entry, Category } from '@/lib/types';

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  People: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  Project: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  Idea: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  Admin: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
};

export default function HistoryPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<Category | 'all'>('all');

  useEffect(() => {
    async function loadEntries() {
      setIsLoading(true);
      try {
        // Load from all databases
        const [admin, projects, people, ideas] = await Promise.all([
          fetchEntries('admin'),
          fetchEntries('projects'),
          fetchEntries('people'),
          fetchEntries('ideas'),
        ]);

        // Combine and sort by created date
        const all = [
          ...admin.map((e) => ({ ...e, category: 'Admin' as const })),
          ...projects.map((e) => ({ ...e, category: 'Project' as const })),
          ...people.map((e) => ({ ...e, category: 'People' as const })),
          ...ideas.map((e) => ({ ...e, category: 'Idea' as const })),
        ].sort((a, b) => new Date(b.created || '').getTime() - new Date(a.created || '').getTime());

        setEntries(all);
      } catch (error) {
        console.error('Failed to load entries:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadEntries();
  }, []);

  const filteredEntries = filter === 'all'
    ? entries
    : entries.filter((e) => (e as Entry & { category: Category }).category === filter);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="mx-auto max-w-lg px-5 pt-8">
      {/* Header */}
      <header className="mb-8 animate-fade-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-purple)] to-pink-600 text-lg">
            📜
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            History
          </h1>
        </div>
        <p className="text-base text-[var(--text-muted)] ml-[52px]">
          Recent entries from your inbox
        </p>
      </header>

      {/* Filter tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2 animate-fade-up delay-1">
        {(['all', 'Admin', 'Project', 'People', 'Idea'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              filter === cat
                ? 'bg-[var(--accent-cyan)] text-[var(--bg-deep)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
            }`}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* Entries list */}
      <div className="space-y-3 animate-fade-up delay-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="spinner mb-3" />
            <span className="text-sm text-[var(--text-muted)]">Loading history...</span>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl bg-[var(--bg-elevated)] py-12">
            <span className="text-4xl mb-3">📭</span>
            <span className="text-sm text-[var(--text-muted)]">No entries yet</span>
          </div>
        ) : (
          filteredEntries.slice(0, 50).map((entry) => {
            const category = (entry as Entry & { category: Category }).category;
            const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.Admin;

            return (
              <div
                key={entry.id}
                className="glass-card p-4 transition-all hover:bg-[var(--bg-surface)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {entry.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-md border px-2 py-0.5 text-xs ${colors.bg} ${colors.text} ${colors.border}`}>
                        {category}
                      </span>
                      {entry.status && (
                        <span className="text-xs text-[var(--text-muted)]">
                          {entry.status}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">
                    {formatDate(entry.created)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
