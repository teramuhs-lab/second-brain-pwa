'use client';

import type { InsightsData } from '../types';
import { DigestContent } from './DigestContent';
import { DigestSkeleton } from './DigestSkeleton';
import { useDigestActions } from '../hooks/useDigestActions';

interface InsightsViewProps {
  insights: InsightsData | null;
  setInsights: React.Dispatch<React.SetStateAction<InsightsData | null>>;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function InsightsView({ insights, setInsights, isLoading, error, onRefresh }: InsightsViewProps) {
  const {
    actionLoading,
    expandedItem,
    setExpandedItem,
    revisitNote,
    setRevisitNote,
    drillDownCategory,
    drillDownItems,
    drillDownLoading,
    handleComplete,
    handleSnooze,
    handleCompleteDueToday,
    handleCategoryDrillDown,
    handleRevisit,
    handleConvert,
    handleDismiss,
  } = useDigestActions({ setInsights });

  return (
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
            <button onClick={onRefresh} className="text-sm text-[var(--text-muted)]/70 hover:text-[var(--text-secondary)]">
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
                  <span className="text-xs text-[var(--accent-cyan)] shrink-0">{item.category}</span>
                  <span className="text-sm text-[var(--text-primary)] truncate">{item.title}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {item.time && <span className="text-xs text-[var(--text-muted)]">{item.time}</span>}
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

      {/* Email Pulse */}
      {insights && !isLoading && insights.emailPulse && insights.emailPulse.totalEmails > 0 && (
        <div className="glass-card p-6 border-l-4 border-l-amber-400/60">
          <div className="mb-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Email Pulse</h2>
              <span className="text-xs text-[var(--text-muted)]">yesterday</span>
            </div>
            <p className="text-sm text-[var(--text-muted)]/70">
              {insights.emailPulse.totalEmails} email{insights.emailPulse.totalEmails !== 1 ? 's' : ''}
              {(insights.emailPulse.urgentCount + insights.emailPulse.deadlineCount) > 0
                ? ` · ${insights.emailPulse.urgentCount + insights.emailPulse.deadlineCount} need attention`
                : ' · inbox clear'}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {insights.emailPulse.urgentCount > 0 && (
              <span className="text-[10px] font-medium text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded">
                {insights.emailPulse.urgentCount} urgent
              </span>
            )}
            {insights.emailPulse.deadlineCount > 0 && (
              <span className="text-[10px] font-medium text-amber-400 bg-amber-900/20 px-1.5 py-0.5 rounded">
                {insights.emailPulse.deadlineCount} deadline
              </span>
            )}
            {insights.emailPulse.totalEmails - insights.emailPulse.urgentCount - insights.emailPulse.deadlineCount > 0 && (
              <span className="text-[10px] font-medium text-[var(--text-muted)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded">
                {insights.emailPulse.totalEmails - insights.emailPulse.urgentCount - insights.emailPulse.deadlineCount} other
              </span>
            )}
          </div>

          {insights.emailPulse.topSenders.length > 0 && (
            <div className="rounded-xl bg-[var(--bg-elevated)] p-3">
              <p className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">Top senders</p>
              <div className="space-y-1">
                {insights.emailPulse.topSenders.slice(0, 3).map((sender) => (
                  <div key={sender.name} className="flex items-center justify-between">
                    <span className="text-sm text-[var(--text-primary)]">{sender.name}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {sender.count} email{sender.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Google connect prompt */}
      {insights && !isLoading && insights.emailPulse && !insights.emailPulse.googleConnected && (
        <a
          href="/api/google/auth"
          className="glass-card p-4 flex items-center justify-between group hover:bg-[var(--bg-surface)] transition-colors block"
        >
          <span className="text-xs text-[var(--text-muted)]">Connect Gmail to see your email pulse</span>
          <span className="text-xs text-[var(--accent-cyan)] group-hover:underline">Connect Google</span>
        </a>
      )}

      {/* AI Insights Card */}
      {insights && !isLoading && (
        <div className="glass-card p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">AI Insights</h2>
            <p className="text-sm text-[var(--text-muted)]/70">Patterns and observations</p>
          </div>

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

          {/* Category breakdown - clickable drill-down */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {Object.entries(insights.weeklyStats.byCategory).map(([cat, count]) => (
              <button
                key={cat}
                className={`text-center rounded-lg p-2 transition-colors cursor-pointer ${
                  drillDownCategory === cat
                    ? 'bg-[var(--accent-cyan-dim)] ring-1 ring-[var(--accent-cyan)]/30'
                    : 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)]'
                }`}
                onClick={() => handleCategoryDrillDown(cat)}
              >
                <span className="text-sm font-medium text-[var(--text-secondary)] block">{count}</span>
                <span className="text-sm text-[var(--text-muted)]/70">{cat}</span>
              </button>
            ))}
          </div>

          {/* Category drill-down list */}
          {drillDownCategory && (
            <div className="rounded-xl bg-[var(--bg-elevated)] p-3 mb-4 animate-fade-up">
              <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                {drillDownCategory} this week · {drillDownLoading ? '...' : drillDownItems.length}
              </p>
              {drillDownLoading ? (
                <p className="text-xs text-[var(--text-muted)]">Loading...</p>
              ) : drillDownItems.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">No items this week</p>
              ) : (
                <div className="space-y-1.5">
                  {drillDownItems.slice(0, 8).map(item => (
                    <div key={item.id} className="flex items-center justify-between py-1">
                      <span className="text-sm text-[var(--text-primary)] truncate">{item.title}</span>
                      <span className="text-xs text-[var(--text-muted)] shrink-0 ml-2">
                        {item.status || item.maturity || ''}
                      </span>
                    </div>
                  ))}
                  {drillDownItems.length > 8 && (
                    <p className="text-xs text-[var(--text-muted)] pt-1">+{drillDownItems.length - 8} more</p>
                  )}
                </div>
              )}
            </div>
          )}

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
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      >
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3">
                      {contentText && (
                        <p className="text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] rounded-lg p-2.5 leading-relaxed">
                          {contentText}
                        </p>
                      )}

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

                      <div className="flex gap-1.5">
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
  );
}
