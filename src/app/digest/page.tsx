'use client';

import { useState, useEffect, useCallback, ReactNode } from 'react';
import { fetchDigest } from '@/lib/api';
import type { DailyDigestResponse, WeeklyDigestResponse } from '@/lib/types';

interface StaleItem {
  id: string;
  title: string;
  category: string;
  status?: string;
  daysSinceEdit: number;
  lastEdited: string;
}

interface InsightsData {
  status: string;
  staleItems: StaleItem[];
  weeklyStats: {
    totalCaptures: number;
    byCategory: Record<string, number>;
    completedTasks: number;
    newIdeas: number;
  };
  aiInsights: string | null;
}

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
            {/* AI Insights Card */}
            <div className="glass-card p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">AI Insights</h2>
                <p className="text-sm text-[var(--text-muted)]/70">Patterns and observations</p>
              </div>

              {isLoading && <DigestSkeleton />}

              {error && !isLoading && (
                <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-4 text-center">
                  <p className="text-sm text-[var(--text-secondary)] mb-2">{error}</p>
                  <button onClick={handleRefresh} className="text-sm text-[var(--text-muted)]/70 hover:text-[var(--text-secondary)]">
                    Try again
                  </button>
                </div>
              )}

              {insights && !isLoading && (
                <>
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

                  {/* Category breakdown - text only, no emojis */}
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {Object.entries(insights.weeklyStats.byCategory).map(([cat, count]) => (
                      <div key={cat} className="text-center rounded-lg bg-[var(--bg-elevated)] p-2">
                        <span className="text-sm font-medium text-[var(--text-secondary)] block">
                          {count}
                        </span>
                        <span className="text-sm text-[var(--text-muted)]/70">{cat}</span>
                      </div>
                    ))}
                  </div>

                  {/* AI Analysis */}
                  {insights.aiInsights && (
                    <div className="rounded-xl bg-[var(--bg-elevated)] p-4">
                      <DigestContent content={insights.aiInsights} />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Stale Items Alert */}
            {insights && insights.staleItems.length > 0 && (
              <div className="glass-card p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Needs Attention</h2>
                  <p className="text-sm text-[var(--text-muted)]/70">{insights.staleItems.length} items not touched in 2+ weeks</p>
                </div>

                <div className="space-y-2">
                  {insights.staleItems.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg bg-[var(--bg-elevated)] p-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-[var(--text-muted)]/70 shrink-0">
                          {item.category}
                        </span>
                        <span className="text-sm text-[var(--text-primary)] truncate">{item.title}</span>
                      </div>
                      <span className="shrink-0 text-sm text-[var(--text-muted)]/70 ml-2">
                        {item.daysSinceEdit}d ago
                      </span>
                    </div>
                  ))}
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
