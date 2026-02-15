'use client';

import { useState } from 'react';
import type { EmailDigestItem, YesterboxCategory, EmailDashboard } from '@/lib/types';
import { CollapsibleSection } from '@/shared/components/CollapsibleSection';
import { YESTERBOX_STYLES, YESTERBOX_PRIORITY } from '../constants';

interface EmailDigestSectionProps {
  emails: EmailDigestItem[];
  dashboard?: EmailDashboard;
  collapsed: boolean;
  onToggle: () => void;
}

export function EmailDigestSection({ emails, dashboard, collapsed, onToggle }: EmailDigestSectionProps) {
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [showAllEmails, setShowAllEmails] = useState(false);

  if (emails.length === 0) return null;

  // Group by category in priority order
  const grouped = YESTERBOX_PRIORITY.reduce((acc, cat) => {
    const items = emails.filter(e => e.yCategory === cat);
    if (items.length > 0) acc.push({ category: cat, items });
    return acc;
  }, [] as { category: YesterboxCategory; items: EmailDigestItem[] }[]);

  const primaryCategories = grouped.filter(g =>
    ['Urgent & High-Priority', 'Deadline-Driven', 'Routine Updates'].includes(g.category)
  );
  const secondaryCategories = grouped.filter(g =>
    !['Urgent & High-Priority', 'Deadline-Driven', 'Routine Updates'].includes(g.category)
  );
  const secondaryCount = secondaryCategories.reduce((sum, g) => sum + g.items.length, 0);
  const visibleGroups = showAllEmails ? grouped : primaryCategories;
  const isCritical = (cat: string) => cat === 'Urgent & High-Priority' || cat === 'Deadline-Driven';

  return (
    <CollapsibleSection title="Yesterday's Emails" count={emails.length} collapsed={collapsed} onToggle={onToggle} className="mt-4">
            {/* Executive Dashboard */}
            {dashboard && (
              <div className="mb-3 pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {Object.entries(dashboard.categoryCounts).map(([cat, count]) => {
                    const style = YESTERBOX_STYLES[cat];
                    if (!style || count === 0) return null;
                    return (
                      <span key={cat} className={`text-[10px] font-medium ${style.text} ${style.bg} px-1.5 py-0.5 rounded`}>
                        {count} {style.label}
                      </span>
                    );
                  })}
                </div>
                {dashboard.aiConclusion && (
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{dashboard.aiConclusion}</p>
                )}
              </div>
            )}
            <div className="space-y-3">
              {visibleGroups.map((group) => {
                const style = YESTERBOX_STYLES[group.category] || YESTERBOX_STYLES['Non-Urgent Informational'];
                const isSpam = group.category === 'Spam/Unimportant';
                return (
                  <div key={group.category}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] font-semibold tracking-wider ${style.text} ${style.bg} px-1.5 py-0.5 rounded`}>
                        {style.label}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">{group.items.length}</span>
                    </div>
                    <div className="space-y-0.5">
                      {group.items.map((email) => {
                        const isExpanded = expandedEmail === email.id;
                        const hasEnrichment = isCritical(group.category) && !!email.detailedSummary;
                        return (
                          <div key={email.id} className={isSpam ? 'opacity-40' : ''}>
                            <button
                              className="w-full flex items-center gap-2 py-1.5 text-left group"
                              onClick={() => setExpandedEmail(isExpanded ? null : email.id)}
                            >
                              <span className={`text-sm font-medium shrink-0 ${isSpam ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                                {email.senderName}
                              </span>
                              <span className="text-xs text-[var(--text-muted)] truncate flex-1">
                                {email.aiSummary}
                              </span>
                              <svg
                                className={`h-3 w-3 shrink-0 text-[var(--text-muted)]/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                              >
                                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                            {isExpanded && (
                              <div className="ml-0 mb-2 rounded-lg bg-[var(--bg-surface)] p-2.5 space-y-1.5">
                                <p className="text-xs font-medium text-[var(--text-primary)]">{email.subject}</p>
                                {hasEnrichment ? (
                                  <>
                                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{email.detailedSummary}</p>
                                    {email.urgencyReason && (
                                      <div className="flex items-start gap-1.5 rounded bg-red-900/10 px-2 py-1.5">
                                        <span className="text-[10px] text-red-400 font-medium shrink-0">Why urgent:</span>
                                        <span className="text-[10px] text-red-300/80">{email.urgencyReason}</span>
                                      </div>
                                    )}
                                    {email.recommendedSteps && email.recommendedSteps.length > 0 && (
                                      <div className="space-y-0.5">
                                        <span className="text-[10px] text-[var(--accent-cyan)] font-medium">Next steps:</span>
                                        <ol className="list-decimal list-inside space-y-0.5 ml-0.5">
                                          {email.recommendedSteps.map((step, i) => (
                                            <li key={i} className="text-[10px] text-[var(--text-secondary)]">{step}</li>
                                          ))}
                                        </ol>
                                      </div>
                                    )}
                                    {email.responseDraft && (
                                      <div className="rounded bg-[var(--bg-elevated)] px-2.5 py-2 border-l-2 border-[var(--accent-cyan)]/30">
                                        <span className="text-[10px] text-[var(--text-muted)] font-medium block mb-1">Draft reply:</span>
                                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed italic">{email.responseDraft}</p>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">{email.snippet}</p>
                                )}
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-[var(--text-muted)]/60">
                                    {new Date(email.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                    {' · '}{email.from}
                                  </span>
                                  {email.gmailComposeUrl && (
                                    <a
                                      href={email.gmailComposeUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] text-[var(--accent-cyan)] font-medium hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Reply in Gmail →
                                    </a>
                                  )}
                                </div>
                                {!hasEnrichment && email.actionNeeded && (
                                  <div className="flex items-start gap-1.5 mt-1 pt-1.5 border-t border-[var(--border-subtle)]">
                                    <span className="text-[10px] text-[var(--accent-cyan)] font-medium shrink-0">Action:</span>
                                    <span className="text-[10px] text-[var(--text-secondary)]">{email.actionNeeded}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {secondaryCount > 0 && (
              <button
                onClick={() => setShowAllEmails(!showAllEmails)}
                className="mt-3 text-xs text-[var(--accent-cyan)] hover:underline"
              >
                {showAllEmails
                  ? 'Show less'
                  : `Show ${secondaryCount} more (${secondaryCategories.map(g => g.category.split(' ')[0]).join(', ')})`}
              </button>
            )}
    </CollapsibleSection>
  );
}
