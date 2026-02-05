'use client';

import { useState } from 'react';
import type { UrlProcessResult } from '@/lib/types';

interface LinkSummaryCardProps {
  result: UrlProcessResult;
  onDismiss: () => void;
  onSendSlack?: () => Promise<void>;
}

export function LinkSummaryCard({ result, onDismiss, onSendSlack }: LinkSummaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isSendingSlack, setIsSendingSlack] = useState(false);

  const hostname = (() => {
    try {
      return new URL(result.url).hostname.replace('www.', '');
    } catch {
      return result.url;
    }
  })();

  const handleSendSlack = async () => {
    if (!onSendSlack) return;
    setIsSendingSlack(true);
    try {
      await onSendSlack();
    } finally {
      setIsSendingSlack(false);
    }
  };

  const getUrlTypeIcon = () => {
    switch (result.urlType) {
      case 'youtube':
        return (
          <svg className="h-5 w-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        );
      case 'twitter':
        return (
          <svg className="h-5 w-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        );
      default:
        return (
          <svg className="h-5 w-5 text-[var(--accent-cyan)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
    }
  };

  const getCategoryColor = () => {
    switch (result.category) {
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

  if (result.status === 'error') {
    return (
      <div className="glass-card border border-red-500/30 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-red-400">Failed to process link</h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{result.error}</p>
            <button
              onClick={onDismiss}
              className="mt-3 rounded-lg bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)]"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden border border-[#10b981]/30">
      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] bg-[#10b981]/10 px-4 py-3">
        <div className="flex items-center gap-2">
          {getUrlTypeIcon()}
          <span className="font-medium text-[#10b981]">Link Captured</span>
          <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${getCategoryColor()}`}>
            {result.category}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title & Meta */}
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">{result.title}</h3>
        <div className="mt-1 flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <span>{hostname}</span>
          {result.readTime && (
            <>
              <span>•</span>
              <span>{result.readTime}</span>
            </>
          )}
          {result.author && (
            <>
              <span>•</span>
              <span>{result.author}</span>
            </>
          )}
        </div>

        {/* One-liner */}
        <p className="mt-3 text-sm italic text-[var(--text-secondary)]">
          &ldquo;{result.one_liner}&rdquo;
        </p>

        {/* Expandable Summary */}
        <div className="mt-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex w-full items-center gap-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <svg
              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {isExpanded ? 'Hide Summary' : 'Show Full Summary'}
          </button>

          {isExpanded && (
            <div className="mt-3 space-y-4 rounded-lg bg-[var(--bg-elevated)] p-4">
              {/* Full Summary */}
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Summary
                </h4>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
                  {result.full_summary}
                </p>
              </div>

              {/* Key Points */}
              {result.key_points.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Key Points
                  </h4>
                  <ul className="space-y-1.5">
                    {result.key_points.map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#10b981]" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 14L21 3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Open Original
          </a>

          {onSendSlack && (
            <button
              onClick={handleSendSlack}
              disabled={isSendingSlack}
              className="flex items-center gap-1.5 rounded-lg bg-[#4A154B] px-3 py-2 text-sm text-white transition-colors hover:bg-[#611f69] disabled:opacity-50"
            >
              {isSendingSlack ? (
                <div className="spinner h-4 w-4" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                </svg>
              )}
              Send to Slack
            </button>
          )}

          <button
            onClick={onDismiss}
            className="ml-auto rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-secondary)]"
          >
            Dismiss
          </button>
        </div>

        {/* Saved indicator */}
        {result.page_id && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#10b981]/10 px-3 py-2 text-sm text-[#10b981]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Saved to Ideas
          </div>
        )}
      </div>
    </div>
  );
}
