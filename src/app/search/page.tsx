'use client';

import { useState, useCallback, KeyboardEvent, useEffect } from 'react';
import { searchEntries, markDone, snoozeEntry, updateEntry } from '@/lib/api';
import type { SearchResult, Category, SavedSearch } from '@/lib/types';
import { useToast } from '@/components/Toast';
import { SearchDetailModal } from '@/components/SearchDetailModal';
import { formatRelativeDate } from '@/lib/utils/date';

// Zen styling - muted, neutral colors
const CATEGORY_COLORS: Record<Category, string> = {
  People: 'bg-[var(--bg-elevated)]',
  Project: 'bg-[var(--bg-elevated)]',
  Idea: 'bg-[var(--bg-elevated)]',
  Admin: 'bg-[var(--bg-elevated)]',
};

// Priority dots instead of badges
const PRIORITY_DOT: Record<string, string> = {
  High: 'bg-red-400/80',
  Medium: 'bg-amber-400/70',
  Low: '',
};

// Priority button active colors - zen muted style
const PRIORITY_COLORS: Record<string, string> = {
  High: 'bg-[var(--bg-deep)] text-[var(--text-primary)] ring-1 ring-[var(--border-subtle)]',
  Medium: 'bg-[var(--bg-deep)] text-[var(--text-primary)] ring-1 ring-[var(--border-subtle)]',
  Low: 'bg-[var(--bg-deep)] text-[var(--text-primary)] ring-1 ring-[var(--border-subtle)]',
};

// Category to database mapping
const CATEGORY_TO_DB: Record<string, string> = {
  People: 'people',
  Project: 'projects',
  Idea: 'ideas',
  Admin: 'admin',
};

// ============================================
// PHASE 5: SAVED SEARCHES
// ============================================

// Zen saved searches - no emojis
const DEFAULT_SAVED_SEARCHES: SavedSearch[] = [
  { id: '1', name: 'Active Projects', query: 'active projects', createdAt: '' },
  { id: '2', name: 'Urgent Tasks', query: 'high priority tasks', createdAt: '' },
  { id: '3', name: 'Recent People', query: 'people I met recently', createdAt: '' },
  { id: '4', name: 'AI Ideas', query: 'ideas about AI', createdAt: '' },
];

function useSavedSearches() {
  // Initialize with lazy function to read from localStorage
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_SAVED_SEARCHES;
    const stored = localStorage.getItem('savedSearches');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return [...DEFAULT_SAVED_SEARCHES, ...parsed];
      } catch {
        return DEFAULT_SAVED_SEARCHES;
      }
    }
    return DEFAULT_SAVED_SEARCHES;
  });

  const saveSearch = useCallback((name: string, query: string) => {
    const newSearch: SavedSearch = {
      id: Date.now().toString(),
      name,
      query,
      createdAt: new Date().toISOString(),
    };

    setSavedSearches(prev => {
      const custom = prev.filter(s => !DEFAULT_SAVED_SEARCHES.find(d => d.id === s.id));
      const updated = [...custom, newSearch];
      localStorage.setItem('savedSearches', JSON.stringify(updated));
      return [...DEFAULT_SAVED_SEARCHES, ...updated];
    });
  }, []);

  const removeSearch = useCallback((id: string) => {
    setSavedSearches(prev => {
      const updated = prev.filter(s => s.id !== id);
      const custom = updated.filter(s => !DEFAULT_SAVED_SEARCHES.find(d => d.id === s.id));
      localStorage.setItem('savedSearches', JSON.stringify(custom));
      return updated;
    });
  }, []);

  return { savedSearches, saveSearch, removeSearch };
}

// ============================================
// SEARCH RESULT CARD WITH QUICK ACTIONS
// ============================================

interface SearchResultCardProps {
  result: SearchResult;
  onAction: () => void;
  onViewDetails: () => void;
  formatDate: (date: string) => string;
}

function SearchResultCard({ result, onAction, onViewDetails, formatDate }: SearchResultCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { showSuccess, showError } = useToast();

  const database = CATEGORY_TO_DB[result.category] || 'admin';

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      await markDone(result.id, database);
      showSuccess('Marked as done!');
      onAction();
    } catch {
      showError('Failed to mark as done');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSnooze = async (days: number) => {
    setIsLoading(true);
    try {
      const date = new Date();
      date.setDate(date.getDate() + days);
      await snoozeEntry(result.id, database, date);
      showSuccess(`Snoozed ${days} day${days > 1 ? 's' : ''}`);
      onAction();
    } catch {
      showError('Failed to snooze');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePriorityChange = async (priority: string) => {
    setIsLoading(true);
    try {
      await updateEntry(result.id, database, { priority });
      showSuccess(`Priority set to ${priority}`);
      onAction();
    } catch {
      showError('Failed to update priority');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-card overflow-hidden transition-all">
      {/* Main card content */}
      <div
        className="p-4 cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-3">
          {/* Priority dot */}
          {result.priority && result.priority !== 'Low' && (
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[result.priority]}`} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium text-[var(--text-primary)] leading-tight">{result.title}</h3>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]/70">
              <span>{result.category}</span>
              {result.status && (
                <>
                  <span className="opacity-40">·</span>
                  <span>{result.status}</span>
                </>
              )}
              <span className="opacity-40">·</span>
              <span>{formatDate(result.lastEdited)}</span>
            </div>

            {/* Related items */}
            {result.relatedTo && result.relatedTo.length > 0 && (
              <div className="mt-2 flex items-center gap-1 text-xs">
                <span className="text-[var(--text-muted)]">Related:</span>
                {result.relatedTo.map((related, i) => (
                  <span key={i} className="rounded bg-[var(--bg-surface)] px-1.5 py-0.5 text-[var(--accent-cyan)]">
                    {related}
                  </span>
                ))}
              </div>
            )}
          </div>
          <svg
            className={`h-5 w-5 shrink-0 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Expanded quick actions (Phase 4) */}
      {isExpanded && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
          {result.snippet && (
            <p className="text-sm text-[var(--text-muted)] mb-4 line-clamp-2">{result.snippet}</p>
          )}

          {/* View Details button */}
          <div className="mb-4">
            <button
              onClick={(e) => { e.stopPropagation(); onViewDetails(); }}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-cyan)] px-3 py-2 text-sm font-medium text-white transition-all hover:opacity-90"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              View Details
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Complete action */}
            <button
              onClick={(e) => { e.stopPropagation(); handleComplete(); }}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg bg-[#10b981] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#059669] disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Done
            </button>

            {/* Snooze options */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-[var(--text-muted)] mr-1">Snooze:</span>
              {[1, 3, 7].map(days => (
                <button
                  key={days}
                  onClick={(e) => { e.stopPropagation(); handleSnooze(days); }}
                  disabled={isLoading}
                  className="rounded-lg bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-deep)] disabled:opacity-50"
                >
                  {days}d
                </button>
              ))}
            </div>

            {/* Priority change */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-[var(--text-muted)] mr-1">Priority:</span>
              {['High', 'Medium', 'Low'].map(p => (
                <button
                  key={p}
                  onClick={(e) => { e.stopPropagation(); handlePriorityChange(p); }}
                  disabled={isLoading}
                  className={`rounded-lg px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
                    result.priority === p
                      ? PRIORITY_COLORS[p]
                      : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-deep)]'
                  }`}
                >
                  {p[0]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// MAIN SEARCH PAGE
// ============================================

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [grouped, setGrouped] = useState<Record<string, number> | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<{ id: string; category: Category } | null>(null);

  const { savedSearches, saveSearch, removeSearch } = useSavedSearches();
  const { showSuccess } = useToast();

  const handleSearch = useCallback(async (searchQuery?: string) => {
    const q = searchQuery || query;
    if (!q.trim() || isSearching) return;

    setIsSearching(true);
    setHasSearched(true);

    try {
      const response = await searchEntries(q.trim());
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

  const handleSavedSearchClick = (savedQuery: string) => {
    setQuery(savedQuery);
    handleSearch(savedQuery);
  };

  const handleSaveSearch = () => {
    if (saveName.trim() && query.trim()) {
      saveSearch(saveName.trim(), query.trim());
      setShowSaveDialog(false);
      setSaveName('');
      showSuccess('Search saved!');
    }
  };

  const formatDate = formatRelativeDate;

  return (
    <div className="mx-auto max-w-lg px-5 pt-8 pb-24">
      {/* Header - zen styling */}
      <header className="mb-8 animate-fade-up">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Search</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]/70">
          Find anything in your brain
        </p>
      </header>

      <div className="space-y-6">

      {/* Search Input */}
      <div className="relative">
        <div className="relative glass-card p-1">
          <div className="flex items-center gap-2">
            <div className="flex h-12 flex-1 items-center rounded-xl bg-[var(--bg-elevated)] px-4">
              <svg
                className="h-5 w-5 text-[var(--accent-cyan)]"
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
                placeholder="What did I discuss with Sarah last week?"
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
              onClick={() => handleSearch()}
              disabled={!query.trim() || isSearching}
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--text-primary)] text-[var(--bg-deep)] transition-all duration-200 hover:opacity-80 disabled:opacity-20"
            >
              {isSearching ? (
                <div className="spinner" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Save search button (only when query exists and searched) */}
        {hasSearched && query && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => setShowSaveDialog(true)}
              className="text-xs text-[var(--accent-cyan)] hover:underline flex items-center gap-1"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save this search
            </button>
          </div>
        )}
      </div>

      {/* Save Search Dialog */}
      {showSaveDialog && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">Save Search</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Name this search..."
              className="flex-1 rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleSaveSearch}
              disabled={!saveName.trim()}
              className="rounded-lg bg-[var(--accent-cyan)] px-4 py-2 text-sm font-medium text-[var(--bg-deep)] disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => { setShowSaveDialog(false); setSaveName(''); }}
              className="rounded-lg bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text-muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Saved Searches - zen styling */}
      {!hasSearched && (
        <div className="space-y-4 pt-4">
          <p className="text-sm text-[var(--text-muted)]/60">Quick searches</p>
          <div className="flex flex-wrap gap-2">
            {savedSearches.map((saved) => (
              <button
                key={saved.id}
                onClick={() => handleSavedSearchClick(saved.query)}
                className="group flex items-center gap-2 rounded-lg px-3 py-2 text-base text-[var(--text-secondary)]/80 transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/30"
              >
                <span>{saved.name}</span>
                {saved.createdAt && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSearch(saved.id); }}
                    className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-all"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {hasSearched && (
        <div className="space-y-4">
          {/* Summary - zen styling */}
          {summary && (
            <div className="rounded-xl bg-[var(--bg-surface)]/30 border border-[var(--border-subtle)]/30 p-4">
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{summary}</p>
            </div>
          )}

          {/* Category breakdown - zen styling */}
          {grouped && results.length > 0 && (
            <div className="flex gap-3 text-sm text-[var(--text-muted)]/70">
              {(Object.entries(grouped) as [Category, number][])
                .filter(([, count]) => count > 0)
                .map(([category, count]) => (
                  <span key={category}>
                    {category} · {count}
                  </span>
                ))}
            </div>
          )}

          {/* Results list with quick actions */}
          {results.length > 0 ? (
            <div className="space-y-3">
              {results.map((result) => (
                <SearchResultCard
                  key={result.id}
                  result={result}
                  onAction={() => handleSearch()}
                  onViewDetails={() => setSelectedEntry({ id: result.id, category: result.category })}
                  formatDate={formatDate}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16">
              <span className="text-base text-[var(--text-secondary)]/70">No results found</span>
              <span className="mt-1 text-sm text-[var(--text-muted)]/60">Try rephrasing your question</span>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      <SearchDetailModal
        isOpen={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        entryId={selectedEntry?.id || ''}
        entryCategory={selectedEntry?.category || 'Admin'}
        onAction={() => handleSearch()}
      />
      </div>
    </div>
  );
}
