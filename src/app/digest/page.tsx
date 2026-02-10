'use client';

import { useState, useEffect, useCallback, ReactNode } from 'react';
import { fetchDigest, markDone, snoozeEntry, updateEntry, recategorize, deleteEntry } from '@/lib/api';
import type { DailyDigestResponse, WeeklyDigestResponse, Category } from '@/lib/types';

interface StaleItem {
  id: string;
  title: string;
  category: string;
  status?: string;
  maturity?: string;
  rawInsight?: string;
  notes?: string;
  daysSinceEdit: number;
  lastEdited: string;
}

// Map plural category names (from API) to singular (for recategorize)
const CATEGORY_SINGULAR: Record<string, Category> = {
  People: 'People',
  Projects: 'Project',
  Ideas: 'Idea',
  Admin: 'Admin',
};

interface DueTodayItem {
  id: string;
  title: string;
  category: string;
  time?: string;
}

interface InsightsData {
  status: string;
  staleItems: StaleItem[];
  dueToday: DueTodayItem[];
  weeklyStats: {
    totalCaptures: number;
    byCategory: Record<string, number>;
    completedTasks: number;
    newIdeas: number;
  };
  aiInsights: string | null;
}

// Map category to database name for API calls
const CATEGORY_TO_DB: Record<string, string> = {
  People: 'people',
  Projects: 'projects',
  Ideas: 'ideas',
  Admin: 'admin',
};

// Helper to format inline markdown (bold, etc.)
function formatInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) {
    return [text];
  }
  return parts.map((part, j) =>
    j % 2 === 1 ? (
      <strong key={j} className="font-semibold text-[var(--text-primary)]">
        {part}
      </strong>
    ) : (
      <span key={j}>{part}</span>
    )
  );
}

// Format AI summary with markdown support
function DigestContent({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div className="space-y-2 text-sm text-[var(--text-secondary)]">
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Handle bullet points (• or -)
        if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
          const bulletContent = trimmed.substring(1).trim();
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-[var(--accent-cyan)]">•</span>
              <span>{formatInlineMarkdown(bulletContent)}</span>
            </div>
          );
        }

        // Handle headers (bold text at start of line)
        if (trimmed.startsWith('**') && trimmed.includes('**')) {
          return (
            <p key={i} className="mt-3 first:mt-0">
              {formatInlineMarkdown(trimmed)}
            </p>
          );
        }

        // Regular text
        if (trimmed) {
          return (
            <p key={i}>{formatInlineMarkdown(line)}</p>
          );
        }

        // Empty line = spacing
        return <div key={i} className="h-1" />;
      })}
    </div>
  );
}

// Loading skeleton
function DigestSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 bg-[var(--bg-elevated)] rounded w-3/4" />
      <div className="h-4 bg-[var(--bg-elevated)] rounded w-full" />
      <div className="h-4 bg-[var(--bg-elevated)] rounded w-5/6" />
      <div className="h-4 bg-[var(--bg-elevated)] rounded w-2/3" />
      <div className="h-8" />
      <div className="h-4 bg-[var(--bg-elevated)] rounded w-1/2" />
      <div className="h-4 bg-[var(--bg-elevated)] rounded w-full" />
      <div className="h-4 bg-[var(--bg-elevated)] rounded w-4/5" />
    </div>
  );
}

export default function DigestPage() {
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'insights'>('daily');
  const [dailyDigest, setDailyDigest] = useState<DailyDigestResponse | null>(null);
  const [weeklyDigest, setWeeklyDigest] = useState<WeeklyDigestResponse | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [revisitNote, setRevisitNote] = useState('');

  // Handle completing a stale item
  const handleComplete = async (item: StaleItem) => {
    const db = CATEGORY_TO_DB[item.category];
    if (!db) return;

    setActionLoading(item.id);
    try {
      await markDone(item.id, db);
      // Remove from local state
      setInsights(prev => prev ? {
        ...prev,
        staleItems: prev.staleItems.filter(i => i.id !== item.id)
      } : null);
    } catch (err) {
      console.warn('Failed to complete item:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle snoozing a stale item (1 week from now)
  const handleSnooze = async (item: StaleItem) => {
    const db = CATEGORY_TO_DB[item.category];
    if (!db) return;

    setActionLoading(item.id);
    try {
      const oneWeekFromNow = new Date();
      oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
      await snoozeEntry(item.id, db, oneWeekFromNow);
      // Remove from local state
      setInsights(prev => prev ? {
        ...prev,
        staleItems: prev.staleItems.filter(i => i.id !== item.id)
      } : null);
    } catch (err) {
      console.warn('Failed to snooze item:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle completing a due today item
  const handleCompleteDueToday = async (item: DueTodayItem) => {
    const db = CATEGORY_TO_DB[item.category];
    if (!db) return;

    setActionLoading(item.id);
    try {
      await markDone(item.id, db);
      // Remove from local state
      setInsights(prev => prev ? {
        ...prev,
        dueToday: prev.dueToday.filter(i => i.id !== item.id)
      } : null);
    } catch (err) {
      console.warn('Failed to complete item:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle revisiting an item (add note, which updates last_edited_time)
  const handleRevisit = async (item: StaleItem) => {
    if (!revisitNote.trim()) return;
    const db = CATEGORY_TO_DB[item.category];
    if (!db) return;

    setActionLoading(item.id);
    try {
      const result = await updateEntry(item.id, db, { notes: revisitNote.trim() });
      if (result.status === 'error') {
        console.warn('Failed to revisit item:', result.error);
      } else {
        setInsights(prev => prev ? {
          ...prev,
          staleItems: prev.staleItems.filter(i => i.id !== item.id)
        } : null);
        setRevisitNote('');
        setExpandedItem(null);
      }
    } catch (err) {
      console.warn('Failed to revisit item:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle converting an Idea to Project or Task
  const handleConvert = async (item: StaleItem, targetCategory: Category) => {
    const currentCategory = CATEGORY_SINGULAR[item.category];
    if (!currentCategory) return;

    setActionLoading(item.id);
    try {
      await recategorize(item.id, currentCategory, targetCategory, item.title);
      setInsights(prev => prev ? {
        ...prev,
        staleItems: prev.staleItems.filter(i => i.id !== item.id)
      } : null);
    } catch (err) {
      console.warn('Failed to convert item:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle dismissing (archiving) a stale item
  const handleDismiss = async (item: StaleItem) => {
    setActionLoading(item.id);
    try {
      await deleteEntry(item.id);
      setInsights(prev => prev ? {
        ...prev,
        staleItems: prev.staleItems.filter(i => i.id !== item.id)
      } : null);
    } catch (err) {
      console.warn('Failed to dismiss item:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const loadDigest = useCallback(async (type: 'daily' | 'weekly') => {
    setIsLoading(true);
    setError(null);

    try {
      if (type === 'daily') {
        const data = await fetchDigest('daily');
        if (data.status === 'error') {
          setError(data.error || 'Failed to load digest');
        } else {
          setDailyDigest(data);
        }
      } else {
        const data = await fetchDigest('weekly');
        if (data.status === 'error') {
          setError(data.error || 'Failed to load digest');
        } else {
          setWeeklyDigest(data);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadInsights = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/insights');
      const data = await response.json();
      if (data.status === 'error') {
        setError(data.error || 'Failed to load insights');
      } else {
        setInsights(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load digest on mount and tab change
  useEffect(() => {
    if (activeTab === 'insights') {
      if (!insights) loadInsights();
    } else {
      const currentDigest = activeTab === 'daily' ? dailyDigest : weeklyDigest;
      if (!currentDigest) {
        loadDigest(activeTab);
      }
    }
  }, [activeTab, dailyDigest, weeklyDigest, insights, loadDigest, loadInsights]);

  const handleRefresh = () => {
    if (activeTab === 'daily') {
      setDailyDigest(null);
      loadDigest('daily');
    } else if (activeTab === 'weekly') {
      setWeeklyDigest(null);
      loadDigest('weekly');
    } else {
      setInsights(null);
      loadInsights();
    }
  };

  const currentDigest = activeTab === 'daily' ? dailyDigest : weeklyDigest;

  return (
    <div className="mx-auto max-w-lg px-5 pt-8 pb-24">
      {/* Header - zen styling */}
      <header className="mb-8 animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              Digest
            </h1>
            <p className="text-sm text-[var(--text-muted)]/70">
              AI-generated summaries
            </p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 animate-fade-up delay-1">
        <button
          onClick={() => setActiveTab('daily')}
          className={`flex-1 rounded-xl py-3 text-sm font-medium transition-all ${
            activeTab === 'daily'
              ? 'bg-[var(--accent-cyan)] text-[var(--bg-deep)]'
              : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
          }`}
        >
          Daily
        </button>
        <button
          onClick={() => setActiveTab('weekly')}
          className={`flex-1 rounded-xl py-3 text-sm font-medium transition-all ${
            activeTab === 'weekly'
              ? 'bg-[var(--accent-cyan)] text-[var(--bg-deep)]'
              : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
          }`}
        >
          Weekly
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`flex-1 rounded-xl py-3 text-sm font-medium transition-all ${
            activeTab === 'insights'
              ? 'bg-[var(--accent-cyan)] text-[var(--bg-deep)]'
              : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
          }`}
        >
          Insights
        </button>
      </div>

      {/* Content */}
      <div className="animate-fade-up delay-2">
        {activeTab === 'daily' && (
          <div className="glass-card p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Daily Briefing</h2>
              <p className="text-sm text-[var(--text-muted)]/70">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>

            {dailyDigest && dailyDigest.status === 'success' && (
              <div className="flex flex-wrap gap-2 mb-4">
                {dailyDigest.counts.projects > 0 && (
                  <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                    {dailyDigest.counts.projects} project{dailyDigest.counts.projects !== 1 ? 's' : ''}
                  </span>
                )}
                {dailyDigest.counts.tasks > 0 && (
                  <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                    {dailyDigest.counts.tasks} task{dailyDigest.counts.tasks !== 1 ? 's' : ''}
                  </span>
                )}
                {dailyDigest.counts.followups > 0 && (
                  <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                    {dailyDigest.counts.followups} follow-up{dailyDigest.counts.followups !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {isLoading && <DigestSkeleton />}

            {error && !isLoading && (
              <div className="rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] p-4 text-center">
                <p className="text-sm text-[#ef4444] mb-2">{error}</p>
                <button onClick={handleRefresh} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                  Try again
                </button>
              </div>
            )}

            {dailyDigest && dailyDigest.status === 'success' && !isLoading && (
              <div className="rounded-xl bg-[var(--bg-elevated)] p-4">
                <DigestContent content={dailyDigest.aiSummary} />
              </div>
            )}

            {dailyDigest && dailyDigest.status === 'success' && (
              <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
                Generated {new Date(dailyDigest.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
          </div>
        )}

        {activeTab === 'weekly' && (
          <div className="glass-card p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Weekly Review</h2>
              <p className="text-sm text-[var(--text-muted)]/70">
                Week of {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              </p>
            </div>

            {weeklyDigest && weeklyDigest.status === 'success' && (
              <div className="flex flex-wrap gap-2 mb-4">
                {weeklyDigest.counts.completedTasks > 0 && (
                  <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                    {weeklyDigest.counts.completedTasks} task{weeklyDigest.counts.completedTasks !== 1 ? 's' : ''} done
                  </span>
                )}
                {weeklyDigest.counts.completedProjects > 0 && (
                  <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                    {weeklyDigest.counts.completedProjects} project{weeklyDigest.counts.completedProjects !== 1 ? 's' : ''} complete
                  </span>
                )}
                {weeklyDigest.counts.totalInbox > 0 && (
                  <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                    {weeklyDigest.counts.totalInbox} new entr{weeklyDigest.counts.totalInbox !== 1 ? 'ies' : 'y'}
                  </span>
                )}
              </div>
            )}

            {isLoading && <DigestSkeleton />}

            {error && !isLoading && (
              <div className="rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] p-4 text-center">
                <p className="text-sm text-[#ef4444] mb-2">{error}</p>
                <button onClick={handleRefresh} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                  Try again
                </button>
              </div>
            )}

            {weeklyDigest && weeklyDigest.status === 'success' && !isLoading && (
              <div className="rounded-xl bg-[var(--bg-elevated)] p-4">
                <DigestContent content={weeklyDigest.aiSummary} />
              </div>
            )}

            {weeklyDigest && weeklyDigest.status === 'success' && (
              <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
                Generated {new Date(weeklyDigest.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
          </div>
        )}

        {activeTab === 'insights' && (
          /* Insights Tab */
          <div className="space-y-4">
            {isLoading && (
              <div className="glass-card p-6">
                <DigestSkeleton />
              </div>
            )}

            {error && !isLoading && (
              <div className="glass-card p-6">
                <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-4 text-center">
                  <p className="text-sm text-[var(--text-secondary)] mb-2">{error}</p>
                  <button onClick={handleRefresh} className="text-sm text-[var(--text-muted)]/70 hover:text-[var(--text-secondary)]">
                    Try again
                  </button>
                </div>
              </div>
            )}

            {/* Due Today Section */}
            {insights && insights.dueToday && insights.dueToday.length > 0 && !isLoading && (
              <div className="glass-card p-6 border-l-4 border-l-[var(--accent-cyan)]">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Due Today</h2>
                  <p className="text-sm text-[var(--text-muted)]/70">{insights.dueToday.length} item{insights.dueToday.length !== 1 ? 's' : ''} to focus on</p>
                </div>

                <div className="space-y-2">
                  {insights.dueToday.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between rounded-lg bg-[var(--bg-elevated)] p-3 ${actionLoading === item.id ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-[var(--accent-cyan)] shrink-0">
                          {item.category}
                        </span>
                        <span className="text-sm text-[var(--text-primary)] truncate">{item.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {item.time && (
                          <span className="text-xs text-[var(--text-muted)]">{item.time}</span>
                        )}
                        <button
                          onClick={() => handleCompleteDueToday(item)}
                          disabled={actionLoading === item.id}
                          className="p-1.5 rounded-lg bg-green-900/30 text-green-400 hover:bg-green-900/50 transition-colors"
                          title="Mark done"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Insights Card */}
            {insights && !isLoading && (
              <div className="glass-card p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">AI Insights</h2>
                  <p className="text-sm text-[var(--text-muted)]/70">Patterns and observations</p>
                </div>

                {/* Weekly Stats */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                    {insights.weeklyStats.totalCaptures} captures this week
                  </span>
                  <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                    {insights.weeklyStats.completedTasks} completed
                  </span>
                  <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                    {insights.weeklyStats.newIdeas} new ideas
                  </span>
                </div>

                {/* Category breakdown - clickable for future drill-down */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {Object.entries(insights.weeklyStats.byCategory).map(([cat, count]) => (
                    <button
                      key={cat}
                      className="text-center rounded-lg bg-[var(--bg-elevated)] p-2 hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                      onClick={() => {
                        // TODO: Add category drill-down modal
                        console.log('Drill down to:', cat);
                      }}
                    >
                      <span className="text-sm font-medium text-[var(--text-secondary)] block">
                        {count}
                      </span>
                      <span className="text-sm text-[var(--text-muted)]/70">{cat}</span>
                    </button>
                  ))}
                </div>

                {/* AI Analysis */}
                {insights.aiInsights && (
                  <div className="rounded-xl bg-[var(--bg-elevated)] p-4">
                    <DigestContent content={insights.aiInsights} />
                  </div>
                )}
              </div>
            )}

            {/* Stale Items Alert with Actions */}
            {insights && insights.staleItems.length > 0 && !isLoading && (
              <div className="glass-card p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Needs Attention</h2>
                  <p className="text-sm text-[var(--text-muted)]/70">{insights.staleItems.length} item{insights.staleItems.length !== 1 ? 's' : ''} not touched in 2+ weeks</p>
                </div>

                <div className="space-y-2">
                  {insights.staleItems.slice(0, 5).map((item) => {
                    const isExpanded = expandedItem === item.id;
                    const contentText = item.rawInsight || item.notes;

                    return (
                      <div
                        key={item.id}
                        className={`rounded-lg bg-[var(--bg-elevated)] overflow-hidden transition-all ${actionLoading === item.id ? 'opacity-50' : ''}`}
                      >
                        {/* Header - tappable to expand */}
                        <button
                          className="w-full flex items-center justify-between p-3 text-left"
                          onClick={() => {
                            setExpandedItem(isExpanded ? null : item.id);
                            if (!isExpanded) setRevisitNote('');
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-[var(--text-muted)]/70 shrink-0">
                              {item.category}
                              {item.maturity && <span className="ml-1 text-[var(--accent-cyan)]">/ {item.maturity}</span>}
                            </span>
                            <span className="text-sm text-[var(--text-primary)] truncate">{item.title}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-xs text-[var(--text-muted)]">{item.daysSinceEdit}d</span>
                            <svg
                              className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        </button>

                        {/* Expanded content */}
                        {isExpanded && (
                          <div className="px-3 pb-3 space-y-3">
                            {/* Show existing notes/raw insight */}
                            {contentText && (
                              <p className="text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] rounded-lg p-2.5 leading-relaxed">
                                {contentText}
                              </p>
                            )}

                            {/* Note input */}
                            <textarea
                              value={revisitNote}
                              onChange={(e) => setRevisitNote(e.target.value)}
                              placeholder="Add a note..."
                              rows={3}
                              className="w-full resize-none rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/50 focus:outline-none focus:border-[var(--accent-cyan)]/40"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey && revisitNote.trim()) {
                                  e.preventDefault();
                                  handleRevisit(item);
                                }
                              }}
                            />

                            {/* Action buttons */}
                            <div className="flex gap-1.5">
                              {/* Revisit (save note) */}
                              <button
                                onClick={() => handleRevisit(item)}
                                disabled={actionLoading === item.id || !revisitNote.trim()}
                                className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                                  revisitNote.trim()
                                    ? 'bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/25'
                                    : 'bg-[var(--bg-surface)] text-[var(--text-muted)]/50 cursor-not-allowed'
                                }`}
                              >
                                Revisit
                              </button>

                              {item.category === 'Ideas' ? (
                                <>
                                  <button
                                    onClick={() => handleConvert(item, 'People')}
                                    disabled={actionLoading === item.id}
                                    className="flex-1 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-deep)] transition-colors"
                                  >
                                    People
                                  </button>
                                  <button
                                    onClick={() => handleConvert(item, 'Project')}
                                    disabled={actionLoading === item.id}
                                    className="flex-1 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-deep)] transition-colors"
                                  >
                                    Project
                                  </button>
                                  <button
                                    onClick={() => handleConvert(item, 'Admin')}
                                    disabled={actionLoading === item.id}
                                    className="flex-1 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-deep)] transition-colors"
                                  >
                                    Task
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleSnooze(item)}
                                    disabled={actionLoading === item.id}
                                    className="flex-1 rounded-lg bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-deep)] transition-colors"
                                  >
                                    Snooze 1w
                                  </button>
                                  <button
                                    onClick={() => handleComplete(item)}
                                    disabled={actionLoading === item.id}
                                    className="flex-1 rounded-lg bg-green-900/20 px-2.5 py-1.5 text-xs text-green-400 hover:bg-green-900/30 transition-colors"
                                  >
                                    Done
                                  </button>
                                </>
                              )}

                              <button
                                onClick={() => handleDismiss(item)}
                                disabled={actionLoading === item.id}
                                className="rounded-lg bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-red-400/70 hover:bg-red-900/20 transition-colors"
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {insights.staleItems.length > 5 && (
                  <p className="mt-3 text-center text-sm text-[var(--text-muted)]/70">
                    +{insights.staleItems.length - 5} more items
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
