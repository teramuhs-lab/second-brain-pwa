'use client';

import { useState } from 'react';
import type { UrlProcessResult } from '@/lib/types';

interface LinkSummaryCardProps {
  result: UrlProcessResult;
  onDismiss: () => void;
  onSendSlack?: () => Promise<void>;
}

export function LinkSummaryCard({ result, onDismiss, onSendSlack }: LinkSummaryCardProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['tldr', 'main_ideas', 'takeaways'])
  );
  const [isSendingSlack, setIsSendingSlack] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

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
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'Tech':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'Life':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'Creative':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getComplexityColor = () => {
    switch (result.complexity) {
      case 'Beginner':
        return 'bg-green-500/10 text-green-400';
      case 'Intermediate':
        return 'bg-yellow-500/10 text-yellow-400';
      case 'Advanced':
        return 'bg-red-500/10 text-red-400';
      default:
        return 'bg-gray-500/10 text-gray-400';
    }
  };

  // Collapsible section component
  const Section = ({
    id,
    title,
    icon,
    children,
    count,
  }: {
    id: string;
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    count?: number;
  }) => {
    const isExpanded = expandedSections.has(id);
    return (
      <div className="border-b border-[var(--border-subtle)] last:border-0">
        <button
          onClick={() => toggleSection(id)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-elevated)]"
        >
          <span className="text-[var(--text-muted)]">{icon}</span>
          <span className="flex-1 font-medium text-[var(--text-primary)]">{title}</span>
          {count !== undefined && (
            <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
              {count}
            </span>
          )}
          <svg
            className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {isExpanded && <div className="px-4 pb-4">{children}</div>}
      </div>
    );
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
      <div className="border-b border-[var(--border-subtle)] bg-gradient-to-r from-[#10b981]/10 to-transparent px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10b981]/20">
            {getUrlTypeIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] leading-tight">
              {result.title}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-[var(--text-muted)]">{hostname}</span>
              {result.readTime && (
                <>
                  <span className="text-[var(--text-muted)]">•</span>
                  <span className="text-[var(--text-muted)]">{result.readTime}</span>
                </>
              )}
              {result.author && (
                <>
                  <span className="text-[var(--text-muted)]">•</span>
                  <span className="text-[var(--text-secondary)]">{result.author}</span>
                </>
              )}
            </div>
            {/* Tags */}
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${getCategoryColor()}`}>
                {result.category}
              </span>
              {result.complexity && (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getComplexityColor()}`}>
                  {result.complexity}
                </span>
              )}
              {result.content_type && (
                <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-0.5 text-xs text-[var(--text-muted)]">
                  {result.content_type}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* One-liner */}
        <div className="mt-4 rounded-lg bg-[var(--bg-elevated)] p-3">
          <p className="text-sm italic text-[var(--text-secondary)] leading-relaxed">
            &ldquo;{result.one_liner}&rdquo;
          </p>
        </div>
      </div>

      {/* Rich Content Sections */}
      <div className="divide-y divide-[var(--border-subtle)]">
        {/* TL;DR */}
        {result.tldr && (
          <Section
            id="tldr"
            title="TL;DR"
            icon={
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          >
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{result.tldr}</p>
          </Section>
        )}

        {/* Main Ideas */}
        {result.main_ideas && result.main_ideas.length > 0 && (
          <Section
            id="main_ideas"
            title="Main Ideas"
            icon={
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01" strokeLinecap="round"/>
              </svg>
            }
            count={result.main_ideas.length}
          >
            <div className="space-y-3">
              {result.main_ideas.map((idea, i) => (
                <div key={i} className="rounded-lg bg-[var(--bg-elevated)] p-3">
                  <h5 className="font-medium text-[var(--text-primary)] text-sm">{idea.title}</h5>
                  <p className="mt-1 text-sm text-[var(--text-muted)] leading-relaxed">{idea.explanation}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Key Takeaways */}
        {result.key_takeaways && result.key_takeaways.length > 0 && (
          <Section
            id="takeaways"
            title="Key Takeaways"
            icon={
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            count={result.key_takeaways.length}
          >
            <ul className="space-y-2">
              {result.key_takeaways.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#10b981]" />
                  <span className="leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Notable Quotes */}
        {result.notable_quotes && result.notable_quotes.length > 0 && (
          <Section
            id="quotes"
            title="Notable Quotes"
            icon={
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
            count={result.notable_quotes.length}
          >
            <div className="space-y-3">
              {result.notable_quotes.map((quote, i) => (
                <blockquote key={i} className="border-l-2 border-[#10b981]/50 pl-3 text-sm italic text-[var(--text-secondary)]">
                  &ldquo;{quote}&rdquo;
                </blockquote>
              ))}
            </div>
          </Section>
        )}

        {/* Action Items */}
        {result.action_items && result.action_items.length > 0 && (
          <Section
            id="actions"
            title="Action Items"
            icon={
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
              </svg>
            }
            count={result.action_items.length}
          >
            <ul className="space-y-2">
              {result.action_items.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-[var(--border-subtle)]">
                    <span className="h-2 w-2 rounded-sm bg-transparent" />
                  </span>
                  <span className="leading-relaxed">{action}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Questions to Consider */}
        {result.questions_to_consider && result.questions_to_consider.length > 0 && (
          <Section
            id="questions"
            title="Questions to Consider"
            icon={
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 17h.01" strokeLinecap="round"/>
              </svg>
            }
            count={result.questions_to_consider.length}
          >
            <ul className="space-y-2">
              {result.questions_to_consider.map((question, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="text-[var(--accent-cyan)]">?</span>
                  <span className="leading-relaxed">{question}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Related Topics */}
        {result.related_topics && result.related_topics.length > 0 && (
          <Section
            id="related"
            title="Related Topics"
            icon={
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="5" r="3"/>
                <line x1="12" y1="22" x2="12" y2="8" strokeLinecap="round"/>
                <path d="M5 12H2a10 10 0 0 0 20 0h-3" strokeLinecap="round"/>
              </svg>
            }
            count={result.related_topics.length}
          >
            <div className="flex flex-wrap gap-2">
              {result.related_topics.map((topic, i) => (
                <span
                  key={i}
                  className="rounded-full bg-[var(--bg-elevated)] px-3 py-1 text-xs text-[var(--text-secondary)]"
                >
                  {topic}
                </span>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Actions Footer */}
      <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-[#10b981] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#059669]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 14L21 3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Read Original
          </a>

          {onSendSlack && (
            <button
              onClick={handleSendSlack}
              disabled={isSendingSlack}
              className="flex items-center gap-1.5 rounded-lg bg-[#4A154B] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#611f69] disabled:opacity-50"
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
            className="ml-auto rounded-lg bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-secondary)]"
          >
            Dismiss
          </button>
        </div>

        {/* Saved indicator */}
        {result.page_id && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#10b981]/10 px-3 py-2 text-sm text-[#10b981]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Saved to Ideas in Notion
          </div>
        )}
      </div>
    </div>
  );
}
