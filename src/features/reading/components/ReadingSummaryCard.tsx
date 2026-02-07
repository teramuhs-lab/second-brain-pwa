'use client';

import { useState } from 'react';
import type { ReadingItem } from '@/lib/types';

interface ReadingSummaryCardProps {
  item: ReadingItem;
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

export function ReadingSummaryCard({ item }: ReadingSummaryCardProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['tldr', 'full_summary', 'main_ideas', 'takeaways', 'actions'])
  );

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
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-surface)]"
        >
          <span className="text-[var(--text-muted)]">{icon}</span>
          <span className="flex-1 font-medium text-[var(--text-primary)]">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
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

  // If no structured_summary, fall back to raw_insight
  if (!item.structured_summary) {
    return (
      <div className="prose prose-sm prose-invert max-w-none">
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
          {item.raw_insight || 'No summary available.'}
        </div>
      </div>
    );
  }

  const summary = item.structured_summary;

  return (
    <div>
      {/* Expand/Collapse All */}
      <div className="mb-3 flex gap-2">
        <button onClick={expandAll} className="text-xs text-[var(--accent-cyan)] hover:underline">Expand All</button>
        <span className="text-[var(--text-muted)]">|</span>
        <button onClick={collapseAll} className="text-xs text-[var(--text-muted)] hover:underline">Collapse All</button>
      </div>

      {/* Content Sections */}
      <div className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] overflow-hidden">
        {/* TL;DR */}
        {summary.tldr && (
          <Section id="tldr" title="TL;DR" highlight icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round"/></svg>}>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{summary.tldr}</p>
          </Section>
        )}

        {/* Full Summary */}
        {summary.full_summary && (
          <Section id="full_summary" title="Complete Summary" icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}>
            <div className="prose prose-sm prose-invert max-w-none">
              <p className="text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">{summary.full_summary}</p>
            </div>
          </Section>
        )}

        {/* Main Ideas */}
        {summary.main_ideas && summary.main_ideas.length > 0 && (
          <Section id="main_ideas" title="Main Ideas" count={summary.main_ideas.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01" strokeLinecap="round"/></svg>}>
            <div className="space-y-4">
              {summary.main_ideas.map((idea, i) => (
                <div key={i} className="rounded-lg bg-[var(--bg-surface)] p-3">
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
        {summary.key_takeaways && summary.key_takeaways.length > 0 && (
          <Section id="takeaways" title="Key Takeaways" count={summary.key_takeaways.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round"/></svg>}>
            <ul className="space-y-2">
              {summary.key_takeaways.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#10b981]" />
                  <span className="leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Statistics & Data */}
        {summary.statistics_and_data && summary.statistics_and_data.length > 0 && (
          <Section id="stats" title="Statistics & Data" count={summary.statistics_and_data.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}>
            <ul className="space-y-2">
              {summary.statistics_and_data.map((stat, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="text-blue-400">📊</span>
                  <span className="leading-relaxed">{stat}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Examples & Cases */}
        {summary.examples_and_cases && summary.examples_and_cases.length > 0 && (
          <Section id="examples" title="Examples & Case Studies" count={summary.examples_and_cases.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}>
            <ul className="space-y-2">
              {summary.examples_and_cases.map((example, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="text-orange-400">💡</span>
                  <span className="leading-relaxed">{example}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Frameworks & Models */}
        {summary.frameworks_and_models && summary.frameworks_and_models.length > 0 && (
          <Section id="frameworks" title="Frameworks & Models" count={summary.frameworks_and_models.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>}>
            <div className="space-y-4">
              {summary.frameworks_and_models.map((fw, i) => (
                <div key={i} className="rounded-lg bg-[var(--bg-surface)] p-3">
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
        {summary.tools_and_resources && summary.tools_and_resources.length > 0 && (
          <Section id="tools" title="Tools & Resources" count={summary.tools_and_resources.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>}>
            <div className="flex flex-wrap gap-2">
              {summary.tools_and_resources.map((tool, i) => (
                <span key={i} className="rounded-full bg-purple-500/20 px-3 py-1 text-xs text-purple-300">{tool}</span>
              ))}
            </div>
          </Section>
        )}

        {/* Definitions */}
        {summary.definitions && summary.definitions.length > 0 && (
          <Section id="definitions" title="Key Definitions" count={summary.definitions.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>}>
            <dl className="space-y-3">
              {summary.definitions.map((def, i) => (
                <div key={i}>
                  <dt className="font-medium text-[var(--text-primary)] text-sm">{def.term}</dt>
                  <dd className="mt-0.5 text-sm text-[var(--text-muted)]">{def.definition}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {/* Notable Quotes */}
        {summary.notable_quotes && summary.notable_quotes.length > 0 && (
          <Section id="quotes" title="Notable Quotes" count={summary.notable_quotes.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3" strokeLinecap="round" strokeLinejoin="round"/></svg>}>
            <div className="space-y-3">
              {summary.notable_quotes.map((quote, i) => (
                <blockquote key={i} className="border-l-2 border-[#10b981]/50 pl-3 text-sm italic text-[var(--text-secondary)]">&ldquo;{quote}&rdquo;</blockquote>
              ))}
            </div>
          </Section>
        )}

        {/* Timestamps (for videos) */}
        {summary.timestamps && summary.timestamps.length > 0 && (
          <Section id="timestamps" title="Video Chapters" count={summary.timestamps.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}>
            <ul className="space-y-1">
              {summary.timestamps.map((ts, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-[var(--accent-cyan)] text-xs bg-[var(--bg-surface)] px-1.5 py-0.5 rounded">{ts.time}</span>
                  <span className="text-[var(--text-secondary)]">{ts.topic}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Action Items */}
        {summary.action_items && summary.action_items.length > 0 && (
          <Section id="actions" title="Action Items" count={summary.action_items.length} highlight icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/></svg>}>
            <ul className="space-y-3">
              {summary.action_items.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-[#10b981]/50 text-[#10b981] text-xs">☐</span>
                  <span className="leading-relaxed whitespace-pre-wrap">{formatItem(action)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Questions to Consider */}
        {summary.questions_to_consider && summary.questions_to_consider.length > 0 && (
          <Section id="questions" title="Questions to Consider" count={summary.questions_to_consider.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 17h.01" strokeLinecap="round"/></svg>}>
            <ul className="space-y-2">
              {summary.questions_to_consider.map((q, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="text-yellow-400">❓</span>
                  <span className="leading-relaxed">{q}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Related Topics */}
        {summary.related_topics && summary.related_topics.length > 0 && (
          <Section id="related" title="Related Topics" count={summary.related_topics.length} icon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8" strokeLinecap="round"/><path d="M5 12H2a10 10 0 0 0 20 0h-3" strokeLinecap="round"/></svg>}>
            <div className="flex flex-wrap gap-2">
              {summary.related_topics.map((topic, i) => (
                <span key={i} className="rounded-full bg-[var(--bg-surface)] px-3 py-1 text-xs text-[var(--text-secondary)]">{topic}</span>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
