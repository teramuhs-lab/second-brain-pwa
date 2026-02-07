'use client';

import { useState } from 'react';
import type { UrlProcessResult } from '@/lib/types';

interface LinkSummaryCardProps {
  result: UrlProcessResult;
  onDismiss: () => void;
  onSendSlack?: () => Promise<void>;
}

// Helper to safely render items that might be strings or objects
function formatItem(item: unknown): string {
  if (typeof item === 'string') return item;
  if (typeof item === 'object' && item !== null) {
    // Handle structured action items with What/How/Specifics/Tips/Result keys
    const obj = item as Record<string, unknown>;
    const parts: string[] = [];
    if (obj.What) parts.push(String(obj.What));
    if (obj.How) parts.push(`How: ${obj.How}`);
    if (obj.Specifics) parts.push(`Details: ${obj.Specifics}`);
    if (obj.Tips) parts.push(`Tips: ${obj.Tips}`);
    if (obj.Result) parts.push(`Expected result: ${obj.Result}`);
    if (parts.length > 0) return parts.join('\n');
    // Fallback: stringify the object
    return JSON.stringify(item);
  }
  return String(item);
}

export function LinkSummaryCard({ result, onDismiss, onSendSlack }: LinkSummaryCardProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['tldr', 'full_summary', 'main_ideas', 'takeaways'])
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

  const expandAll = () => {
    setExpandedSections(new Set([
      'tldr', 'full_summary', 'main_ideas', 'takeaways', 'stats', 'examples',
      'frameworks', 'tools', 'definitions', 'quotes', 'timestamps', 'actions', 'questions', 'related'
    ]));
  };

  const collapseAll = () => {
    setExpandedSections(new Set(['tldr']));
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
      case 'Business': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'Tech': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'Life': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'Creative': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getComplexityColor = () => {
    switch (result.complexity) {
      case 'Beginner': return 'bg-green-500/10 text-green-400';
      case 'Intermediate': return 'bg-yellow-500/10 text-yellow-400';
      case 'Advanced': return 'bg-red-500/10 text-red-400';
      default: return 'bg-gray-500/10 text-gray-400';
    }
  };

  // Section component with expand/collapse
  const Section = ({
    id, title, icon, children, count, highlight = false
  }: {
    id: string;
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    count?: number;
    highlight?: boolean;
  }) => {
    const isExpanded = expandedSections.has(id);
    return (
      <div className={`border-b border-[var(--border-subtle)] last:border-0 ${highlight ? 'bg-[#10b981]/5' : ''}`}>
        <button
          onClick={() => toggleSection(id)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-elevated)]"
        >
          <span className="text-[var(--text-muted)]">{icon}</span>
          <span className="flex-1 font-medium text-[var(--text-primary)]">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
              {count}
            </span>
          )}
          <svg
            className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
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
            <button onClick={onDismiss} className="mt-3 rounded-lg bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text-secondary)]">
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
            <h3 className="text-lg font-semibold text-[var(--text-primary)] leading-tight">{result.title}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-[var(--text-muted)]">{hostname}</span>
              {result.readTime && <><span className="text-[var(--text-muted)]">•</span><span className="text-[var(--text-muted)]">{result.readTime}</span></>}
              {result.author && <><span className="text-[var(--text-muted)]">•</span><span className="text-[var(--text-secondary)]">{result.author}</span></>}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${getCategoryColor()}`}>{result.category}</span>
              {result.complexity && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getComplexityColor()}`}>{result.complexity}</span>}
              {result.content_type && <span className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-0.5 text-xs text-[var(--text-muted)]">{result.content_type}</span>}
            </div>
          </div>
        </div>

        {/* One-liner */}
        <div className="mt-4 rounded-lg bg-[var(--bg-elevated)] p-3">
          <p className="text-sm italic text-[var(--text-secondary)] leading-relaxed">&ldquo;{result.one_liner}&rdquo;</p>
        </div>

        {/* Expand/Collapse All */}
        <div className="mt-3 flex gap-2">
          <button onClick={expandAll} className="text-xs text-[var(--accent-cyan)] hover:underline">Expand All</button>
          <span className="text-[var(--text-muted)]">|</span>
          <button onClick={collapseAll} className="text-xs text-[var(--text-muted)] hover:underline">Collapse All</button>
        </div>
      </div>

      {/* Content Sections */}
      <div className="divide-y divide-[var(--border-subtle)] max-h-[70vh] overflow-y-auto">
        {/* TL;DR */}
        {result.tldr && (
          <Section id="tldr" title="TL;DR" highlight icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round"/></svg>}>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{result.tldr}</p>
          </Section>
        )}

        {/* Full Summary */}
        {result.full_summary && (
          <Section id="full_summary" title="Complete Summary" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>}>
            <div className="prose prose-sm prose-invert max-w-none">
              <p className="text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">{result.full_summary}</p>
            </div>
          </Section>
        )}

        {/* Main Ideas */}
        {result.main_ideas && result.main_ideas.length > 0 && (
          <Section id="main_ideas" title="Main Ideas" count={result.main_ideas.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01" strokeLinecap="round"/></svg>}>
            <div className="space-y-4">
              {result.main_ideas.map((idea, i) => (
                <div key={i} className="rounded-lg bg-[var(--bg-elevated)] p-3">
                  <h5 className="font-medium text-[var(--text-primary)] text-sm">{idea.title}</h5>
                  <p className="mt-1 text-sm text-[var(--text-muted)] leading-relaxed">{idea.explanation}</p>
                  {idea.details && idea.details.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {idea.details.map((detail, j) => (
                        <li key={j} className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                          <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-[var(--accent-cyan)]" />
                          {detail}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Key Takeaways */}
        {result.key_takeaways && result.key_takeaways.length > 0 && (
          <Section id="takeaways" title="Key Takeaways" count={result.key_takeaways.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round"/></svg>}>
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

        {/* Statistics & Data */}
        {result.statistics_and_data && result.statistics_and_data.length > 0 && (
          <Section id="stats" title="Statistics & Data" count={result.statistics_and_data.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}>
            <ul className="space-y-2">
              {result.statistics_and_data.map((stat, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="text-blue-400">📊</span>
                  <span className="leading-relaxed">{stat}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Examples & Cases */}
        {result.examples_and_cases && result.examples_and_cases.length > 0 && (
          <Section id="examples" title="Examples & Case Studies" count={result.examples_and_cases.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}>
            <ul className="space-y-2">
              {result.examples_and_cases.map((example, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="text-orange-400">💡</span>
                  <span className="leading-relaxed">{example}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Frameworks & Models */}
        {result.frameworks_and_models && result.frameworks_and_models.length > 0 && (
          <Section id="frameworks" title="Frameworks & Models" count={result.frameworks_and_models.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>}>
            <div className="space-y-4">
              {result.frameworks_and_models.map((fw, i) => (
                <div key={i} className="rounded-lg bg-[var(--bg-elevated)] p-3">
                  <h5 className="font-medium text-[var(--accent-cyan)] text-sm">{fw.name}</h5>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{fw.description}</p>
                  {fw.steps && fw.steps.length > 0 && (
                    <ol className="mt-2 space-y-1 list-decimal list-inside">
                      {fw.steps.map((step, j) => (
                        <li key={j} className="text-xs text-[var(--text-secondary)]">{step}</li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Tools & Resources */}
        {result.tools_and_resources && result.tools_and_resources.length > 0 && (
          <Section id="tools" title="Tools & Resources" count={result.tools_and_resources.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>}>
            <div className="flex flex-wrap gap-2">
              {result.tools_and_resources.map((tool, i) => (
                <span key={i} className="rounded-full bg-purple-500/20 px-3 py-1 text-xs text-purple-300">{tool}</span>
              ))}
            </div>
          </Section>
        )}

        {/* Definitions */}
        {result.definitions && result.definitions.length > 0 && (
          <Section id="definitions" title="Key Definitions" count={result.definitions.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>}>
            <dl className="space-y-3">
              {result.definitions.map((def, i) => (
                <div key={i}>
                  <dt className="font-medium text-[var(--text-primary)] text-sm">{def.term}</dt>
                  <dd className="mt-0.5 text-sm text-[var(--text-muted)]">{def.definition}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {/* Notable Quotes */}
        {result.notable_quotes && result.notable_quotes.length > 0 && (
          <Section id="quotes" title="Notable Quotes" count={result.notable_quotes.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3" strokeLinecap="round" strokeLinejoin="round"/></svg>}>
            <div className="space-y-3">
              {result.notable_quotes.map((quote, i) => (
                <blockquote key={i} className="border-l-2 border-[#10b981]/50 pl-3 text-sm italic text-[var(--text-secondary)]">&ldquo;{quote}&rdquo;</blockquote>
              ))}
            </div>
          </Section>
        )}

        {/* Timestamps (for videos) */}
        {result.timestamps && result.timestamps.length > 0 && (
          <Section id="timestamps" title="Video Chapters" count={result.timestamps.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}>
            <ul className="space-y-1">
              {result.timestamps.map((ts, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-[var(--accent-cyan)] text-xs bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded">{ts.time}</span>
                  <span className="text-[var(--text-secondary)]">{ts.topic}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Action Items */}
        {result.action_items && result.action_items.length > 0 && (
          <Section id="actions" title="Action Items" count={result.action_items.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/></svg>}>
            <ul className="space-y-2">
              {result.action_items.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-[#10b981]/50 text-[#10b981] text-xs">☐</span>
                  <span className="leading-relaxed whitespace-pre-wrap">{formatItem(action)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Questions to Consider */}
        {result.questions_to_consider && result.questions_to_consider.length > 0 && (
          <Section id="questions" title="Questions to Consider" count={result.questions_to_consider.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 17h.01" strokeLinecap="round"/></svg>}>
            <ul className="space-y-2">
              {result.questions_to_consider.map((q, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="text-yellow-400">❓</span>
                  <span className="leading-relaxed">{q}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Related Topics */}
        {result.related_topics && result.related_topics.length > 0 && (
          <Section id="related" title="Related Topics" count={result.related_topics.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8" strokeLinecap="round"/><path d="M5 12H2a10 10 0 0 0 20 0h-3" strokeLinecap="round"/></svg>}>
            <div className="flex flex-wrap gap-2">
              {result.related_topics.map((topic, i) => (
                <span key={i} className="rounded-full bg-[var(--bg-elevated)] px-3 py-1 text-xs text-[var(--text-secondary)]">{topic}</span>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Actions Footer */}
      <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <a href={result.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-[#10b981] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#059669]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 14L21 3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Read Original
          </a>
          {onSendSlack && (
            <button onClick={handleSendSlack} disabled={isSendingSlack}
              className="flex items-center gap-1.5 rounded-lg bg-[#4A154B] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#611f69] disabled:opacity-50">
              {isSendingSlack ? <div className="spinner h-4 w-4" /> : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/>
                </svg>
              )}
              Send to Slack
            </button>
          )}
          <button onClick={onDismiss} className="ml-auto rounded-lg bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            Dismiss
          </button>
        </div>
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
