'use client';

import type { WeeklyDigestResponse } from '@/lib/types';
import { DigestContent } from './DigestContent';
import { DigestSkeleton } from './DigestSkeleton';

interface WeeklyDigestViewProps {
  digest: WeeklyDigestResponse | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function WeeklyDigestView({ digest, isLoading, error, onRefresh }: WeeklyDigestViewProps) {
  return (
    <div className="glass-card p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Weekly Review</h2>
        <p className="text-sm text-[var(--text-muted)]/70">
          Week of {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
        </p>
      </div>

      {digest && digest.status === 'success' && (
        <div className="flex flex-wrap gap-2 mb-4">
          {digest.counts.completedTasks > 0 && (
            <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
              {digest.counts.completedTasks} task{digest.counts.completedTasks !== 1 ? 's' : ''} done
            </span>
          )}
          {digest.counts.completedProjects > 0 && (
            <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
              {digest.counts.completedProjects} project{digest.counts.completedProjects !== 1 ? 's' : ''} complete
            </span>
          )}
          {digest.counts.totalInbox > 0 && (
            <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
              {digest.counts.totalInbox} new entr{digest.counts.totalInbox !== 1 ? 'ies' : 'y'}
            </span>
          )}
        </div>
      )}

      {isLoading && <DigestSkeleton />}

      {error && !isLoading && (
        <div className="rounded-xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] p-4 text-center">
          <p className="text-sm text-[#ef4444] mb-2">{error}</p>
          <button onClick={onRefresh} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            Try again
          </button>
        </div>
      )}

      {digest && digest.status === 'success' && !isLoading && (
        <div className="rounded-xl bg-[var(--bg-elevated)] p-4">
          <DigestContent content={digest.aiSummary} />
        </div>
      )}

      {digest && digest.status === 'success' && (
        <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
          Generated {new Date(digest.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}
