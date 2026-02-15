'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchDigest } from '@/lib/api';
import type { DailyDigestResponse, WeeklyDigestResponse, CalendarEvent, EmailDashboard } from '@/lib/types';
import type { InsightsData } from '@/features/digest/types';
import { CollapsibleSection } from '@/shared/components/CollapsibleSection';
import { DigestContent } from '@/features/digest/components/DigestContent';
import { DigestSkeleton } from '@/features/digest/components/DigestSkeleton';
import { CalendarSection } from '@/features/digest/components/CalendarSection';
import { EmailDigestSection } from '@/features/digest/components/EmailDigestSection';
import { GoogleTasksSection } from '@/features/digest/components/GoogleTasksSection';
import { WeeklyDigestView } from '@/features/digest/components/WeeklyDigestView';
import { InsightsView } from '@/features/digest/components/InsightsView';

export default function DigestPage() {
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'insights'>('daily');
  const [dailyDigest, setDailyDigest] = useState<DailyDigestResponse | null>(null);
  const [weeklyDigest, setWeeklyDigest] = useState<WeeklyDigestResponse | null>(null);
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(['schedule', 'emails', 'googleTasks'])
  );

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  };

  const loadDigest = useCallback(async (type: 'daily' | 'weekly', refresh?: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      if (type === 'daily') {
        const data = await fetchDigest('daily', refresh);
        if (data.status === 'error') {
          setError(data.error || 'Failed to load digest');
        } else {
          setDailyDigest(data);
        }
      } else {
        const data = await fetchDigest('weekly', refresh);
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

  // Fetch calendar events on mount (non-blocking)
  useEffect(() => {
    fetch('/api/calendar/events')
      .then((r) => r.json())
      .then((data) => {
        setGoogleConnected(data.connected);
        setCalendarEvents(data.events || []);
      })
      .catch(() => setGoogleConnected(false));
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
      loadDigest('daily', true);
    } else if (activeTab === 'weekly') {
      setWeeklyDigest(null);
      loadDigest('weekly', true);
    } else {
      setInsights(null);
      loadInsights();
    }
  };

  return (
    <div className="mx-auto max-w-lg px-5 pt-8 pb-24">
      {/* Header */}
      <header className="mb-8 animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Digest</h1>
            <p className="text-sm text-[var(--text-muted)]/70">AI-generated summaries</p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 animate-fade-up delay-1">
        {(['daily', 'weekly', 'insights'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-xl py-3 text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-[var(--accent-cyan)] text-[var(--bg-deep)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
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
                {(dailyDigest.counts.googleTasks ?? 0) > 0 && (
                  <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                    {dailyDigest.counts.googleTasks} Google task{dailyDigest.counts.googleTasks !== 1 ? 's' : ''}
                  </span>
                )}
                {(dailyDigest.counts.emailDigestTotal ?? 0) > 0 && (
                  <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                    {dailyDigest.counts.emailDigestTotal} email{dailyDigest.counts.emailDigestTotal !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {/* Calendar Schedule */}
            {googleConnected && calendarEvents.length > 0 && (
              <CalendarSection
                events={calendarEvents}
                collapsed={collapsedSections.has('schedule')}
                onToggle={() => toggleSection('schedule')}
              />
            )}

            {/* Google Tasks scope missing */}
            {googleConnected && dailyDigest?.googleTasksScopeNeeded && (
              <a
                href="/api/google/auth"
                className="flex items-center justify-between rounded-lg bg-[var(--bg-elevated)] px-3 py-2.5 mb-4 group hover:bg-[var(--bg-surface)] transition-colors"
              >
                <span className="text-xs text-[var(--text-muted)]">Reconnect Google to enable Tasks</span>
                <span className="text-xs text-[var(--accent-cyan)] group-hover:underline">Reconnect →</span>
              </a>
            )}

            {/* Connect Google prompt */}
            {googleConnected === false && (
              <a
                href="/api/google/auth"
                className="flex items-center justify-between rounded-lg bg-[var(--bg-elevated)] px-3 py-2.5 mb-4 group hover:bg-[var(--bg-surface)] transition-colors"
              >
                <span className="text-xs text-[var(--text-muted)]">See your schedule & tasks here</span>
                <span className="text-xs text-[var(--accent-cyan)] group-hover:underline">Connect Google →</span>
              </a>
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

            {/* AI Summary */}
            {dailyDigest && dailyDigest.status === 'success' && !isLoading && (
              <CollapsibleSection
                title="AI Summary"
                collapsed={collapsedSections.has('aiSummary')}
                onToggle={() => toggleSection('aiSummary')}
              >
                <DigestContent content={dailyDigest.aiSummary} />
              </CollapsibleSection>
            )}

            {/* Email Digest */}
            {dailyDigest?.data?.emailDigest && dailyDigest.data.emailDigest.length > 0 && (
              <EmailDigestSection
                emails={dailyDigest.data.emailDigest}
                dashboard={dailyDigest.data.emailDashboard as EmailDashboard | undefined}
                collapsed={collapsedSections.has('emails')}
                onToggle={() => toggleSection('emails')}
              />
            )}

            {/* Google Tasks */}
            {googleConnected && dailyDigest?.data?.googleTasks && dailyDigest.data.googleTasks.length > 0 && (
              <GoogleTasksSection
                tasks={dailyDigest.data.googleTasks}
                collapsed={collapsedSections.has('googleTasks')}
                onToggle={() => toggleSection('googleTasks')}
              />
            )}

            {dailyDigest && dailyDigest.status === 'success' && (
              <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
                Generated {new Date(dailyDigest.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
          </div>
        )}

        {activeTab === 'weekly' && (
          <WeeklyDigestView
            digest={weeklyDigest}
            isLoading={isLoading}
            error={error}
            onRefresh={handleRefresh}
          />
        )}

        {activeTab === 'insights' && (
          <InsightsView
            insights={insights}
            setInsights={setInsights}
            isLoading={isLoading}
            error={error}
            onRefresh={handleRefresh}
          />
        )}
      </div>
    </div>
  );
}
