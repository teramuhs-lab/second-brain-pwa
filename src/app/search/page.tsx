'use client';

import { useState, useCallback, KeyboardEvent } from 'react';
import { searchEntries } from '@/lib/api';
import type { SearchResult, Category } from '@/lib/types';

const CATEGORY_COLORS: Record<Category, string> = {
  People: 'from-blue-500 to-cyan-500',
  Project: 'from-green-500 to-emerald-500',
  Idea: 'from-purple-500 to-pink-500',
  Admin: 'from-orange-500 to-amber-500',
};

const CATEGORY_ICONS: Record<Category, string> = {
  People: '👤',
  Project: '🚀',
  Idea: '💡',
  Admin: '📋',
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [grouped, setGrouped] = useState<Record<string, number> | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || isSearching) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const response = await searchEntries(query.trim());
      if (response.status === 'success') {
        setResults(response.results);
        setSummary(response.summary || null);
        setGrouped(response.grouped);
      } else {
        setResults([]);
        setSummary(null);
        setGrouped(null);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
      setSummary(null);
    } finally {
      setIsSearching(false);
    }
  }, [query, isSearching]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Search</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Find anything in your Second Brain
        </p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="relative glass-card p-1">
          <div className="flex items-center gap-2">
            <div className="flex h-12 flex-1 items-center rounded-xl bg-[var(--bg-elevated)] px-4">
              <svg
                className="h-5 w-5 text-[var(--text-muted)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What are you looking for?"
                className="flex-1 bg-transparent px-3 py-2 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={handleSearch}
              disabled={!query.trim() || isSearching}
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-cyan)] to-[#00a8cc] text-[var(--bg-deep)] shadow-lg transition-all duration-200 hover:scale-105 disabled:opacity-30 disabled:hover:scale-100"
            >
              {isSearching ? (
                <div className="spinner" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Search suggestions */}
        {!hasSearched && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {['AI', 'Sarah', 'project ideas', 'urgent tasks', 'last week'].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  setQuery(suggestion);
                }}
                className="rounded-full bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {hasSearched && (
        <div className="space-y-4">
          {/* Summary */}
          {summary && (
            <div className="glass-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-purple)] to-[var(--accent-cyan)]">
                  <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a10 10 0 1 0 10 10H12V2Z" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--accent-cyan)]">AI Summary</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{summary}</p>
                </div>
              </div>
            </div>
          )}

          {/* Category breakdown */}
          {grouped && results.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {(Object.entries(grouped) as [Category, number][])
                .filter(([, count]) => count > 0)
                .map(([category, count]) => (
                  <div
                    key={category}
                    className={`flex items-center gap-2 rounded-xl bg-gradient-to-r ${CATEGORY_COLORS[category]} px-3 py-1.5`}
                  >
                    <span className="text-sm">{CATEGORY_ICONS[category]}</span>
                    <span className="text-xs font-medium text-white">
                      {count} {category}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Results list */}
          {results.length > 0 ? (
            <div className="space-y-2">
              {results.map((result) => (
                <div key={result.id} className="glass-card p-4 transition-all hover:bg-[var(--bg-elevated)]">
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${CATEGORY_COLORS[result.category]}`}
                    >
                      <span className="text-sm">{CATEGORY_ICONS[result.category]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-[var(--text-primary)] truncate">{result.title}</h3>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span>{result.category}</span>
                        {result.status && (
                          <>
                            <span>•</span>
                            <span>{result.status}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>{formatDate(result.lastEdited)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl bg-[var(--bg-elevated)] py-12">
              <span className="text-4xl mb-3">🔍</span>
              <span className="text-sm text-[var(--text-muted)]">No results found</span>
              <span className="mt-1 text-xs text-[var(--text-muted)]">Try different keywords</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
