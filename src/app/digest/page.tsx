'use client';

import { useState, useEffect, useCallback, ReactNode } from 'react';
import { fetchDigest } from '@/lib/api';
import type { DailyDigestResponse, WeeklyDigestResponse } from '@/lib/types';

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
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>('daily');
  const [dailyDigest, setDailyDigest] = useState<DailyDigestResponse | null>(null);
  const [weeklyDigest, setWeeklyDigest] = useState<WeeklyDigestResponse | null>(null);
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

  // Load digest on mount and tab change
  useEffect(() => {
    const currentDigest = activeTab === 'daily' ? dailyDigest : weeklyDigest;
    if (!currentDigest) {
      loadDigest(activeTab);
    }
  }, [activeTab, dailyDigest, weeklyDigest, loadDigest]);

  const handleRefresh = () => {
    if (activeTab === 'daily') {
      setDailyDigest(null);
    } else {
      setWeeklyDigest(null);
    }
    loadDigest(activeTab);
  };

  const currentDigest = activeTab === 'daily' ? dailyDigest : weeklyDigest;

  return (
    <div className="mx-auto max-w-lg px-5 pt-8 pb-24">
      {/* Header */}
      <header className="mb-8 animate-fade-up">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-cyan)] to-blue-600 text-lg">
              📊
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Digest
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                AI-generated summaries
              </p>
            </div>
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] disabled:opacity-50"
            title="Refresh digest"
          >
            <svg
              className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 animate-fade-up delay-1" style={{ opacity: 0 }}>
        <button
          onClick={() => setActiveTab('daily')}
          className={`flex-1 rounded-xl py-3 text-sm font-medium transition-all ${
            activeTab === 'daily'
              ? 'bg-[var(--accent-cyan)] text-[var(--bg-deep)]'
              : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
          }`}
        >
          Daily Briefing
        </button>
        <button
          onClick={() => setActiveTab('weekly')}
          className={`flex-1 rounded-xl py-3 text-sm font-medium transition-all ${
            activeTab === 'weekly'
              ? 'bg-[var(--accent-cyan)] text-[var(--bg-deep)]'
              : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
          }`}
        >
          Weekly Review
        </button>
      </div>

      {/* Content */}
      <div className="animate-fade-up delay-2" style={{ opacity: 0 }}>
        {activeTab === 'daily' ? (
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">☀️</span>
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Daily Briefing</h2>
                <p className="text-xs text-[var(--text-muted)]">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>

            {/* Stats badges */}
            {dailyDigest && dailyDigest.status === 'success' && (
              <div className="flex flex-wrap gap-2 mb-4">
                {dailyDigest.counts.projects > 0 && (
                  <span className="rounded-full bg-[rgba(0,212,255,0.15)] px-2.5 py-1 text-xs text-[var(--accent-cyan)]">
                    {dailyDigest.counts.projects} project{dailyDigest.counts.projects !== 1 ? 's' : ''}
                  </span>
                )}
                {dailyDigest.counts.tasks > 0 && (
                  <span className="rounded-full bg-[rgba(168,85,247,0.15)] px-2.5 py-1 text-xs text-[#a855f7]">
                    {dailyDigest.counts.tasks} task{dailyDigest.counts.tasks !== 1 ? 's' : ''}
                  </span>
                )}
                {dailyDigest.counts.followups > 0 && (
                  <span className="rounded-full bg-[rgba(34,197,94,0.15)] px-2.5 py-1 text-xs text-[#22c55e]">
                    {dailyDigest.counts.followups} follow-up{dailyDigest.counts.followups !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {/* Loading state */}
            {isLoading && <DigestSkeleton />}

            {/* Error state */}
            {error && !isLoading && (
              <div className="rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] p-4 text-center">
                <p className="text-sm text-[#ef4444] mb-2">{error}</p>
                <button
                  onClick={handleRefresh}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  Try again
                </button>
              </div>
            )}

            {/* AI Summary */}
            {dailyDigest && dailyDigest.status === 'success' && !isLoading && (
              <div className="rounded-xl bg-[var(--bg-elevated)] p-4">
                <DigestContent content={dailyDigest.aiSummary} />
              </div>
            )}

            {/* Generated timestamp */}
            {dailyDigest && dailyDigest.status === 'success' && (
              <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
                Generated {new Date(dailyDigest.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
          </div>
        ) : (
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">📅</span>
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Weekly Review</h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Week of {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>

            {/* Stats badges */}
            {weeklyDigest && weeklyDigest.status === 'success' && (
              <div className="flex flex-wrap gap-2 mb-4">
                {weeklyDigest.counts.completedTasks > 0 && (
                  <span className="rounded-full bg-[rgba(34,197,94,0.15)] px-2.5 py-1 text-xs text-[#22c55e]">
                    {weeklyDigest.counts.completedTasks} task{weeklyDigest.counts.completedTasks !== 1 ? 's' : ''} done
                  </span>
                )}
                {weeklyDigest.counts.completedProjects > 0 && (
                  <span className="rounded-full bg-[rgba(0,212,255,0.15)] px-2.5 py-1 text-xs text-[var(--accent-cyan)]">
                    {weeklyDigest.counts.completedProjects} project{weeklyDigest.counts.completedProjects !== 1 ? 's' : ''} complete
                  </span>
                )}
                {weeklyDigest.counts.totalInbox > 0 && (
                  <span className="rounded-full bg-[rgba(168,85,247,0.15)] px-2.5 py-1 text-xs text-[#a855f7]">
                    {weeklyDigest.counts.totalInbox} new entr{weeklyDigest.counts.totalInbox !== 1 ? 'ies' : 'y'}
                  </span>
                )}
              </div>
            )}

            {/* Loading state */}
            {isLoading && <DigestSkeleton />}

            {/* Error state */}
            {error && !isLoading && (
              <div className="rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] p-4 text-center">
                <p className="text-sm text-[#ef4444] mb-2">{error}</p>
                <button
                  onClick={handleRefresh}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  Try again
                </button>
              </div>
            )}

            {/* AI Summary */}
            {weeklyDigest && weeklyDigest.status === 'success' && !isLoading && (
              <div className="rounded-xl bg-[var(--bg-elevated)] p-4">
                <DigestContent content={weeklyDigest.aiSummary} />
              </div>
            )}

            {/* Generated timestamp */}
            {weeklyDigest && weeklyDigest.status === 'success' && (
              <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
                Generated {new Date(weeklyDigest.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
