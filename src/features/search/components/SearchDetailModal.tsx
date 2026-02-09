'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchEntry, markDone, snoozeEntry, deleteEntry, captureThought } from '@/lib/api';
import { useToast } from '@/shared/components/Toast';
import { NotesEditor } from '@/features/tasks/components/NotesEditor';
import type { StructuredSummary, Category } from '@/lib/types';

interface EntryDetails {
  id: string;
  title: string;
  type: 'Idea' | 'Admin' | 'Project' | 'People';
  status?: string;
  priority?: string;
  created_time: string;
  last_edited_time: string;
  // Idea fields
  one_liner?: string;
  raw_insight?: string;
  source?: string;
  category?: string;
  maturity?: string;
  structured_summary?: StructuredSummary;
  // Admin/Project fields
  due_date?: string;
  notes?: string;
  next_action?: string;
  area?: string;
  // People fields
  company?: string;
  role?: string;
  context?: string;
  last_contact?: string;
  next_followup?: string;
}

interface SearchDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  entryId: string;
  entryCategory: Category;
  onAction?: () => void;
}

const CATEGORY_TO_DB: Record<string, string> = {
  People: 'people',
  Project: 'projects',
  Idea: 'ideas',
  Admin: 'admin',
};

// Helper to safely render items that might be strings or objects
function formatItem(item: unknown): string {
  if (typeof item === 'string') return item;
  if (typeof item === 'object' && item !== null) {
    const obj = item as Record<string, unknown>;
    const parts: string[] = [];
    if (obj.What) parts.push(String(obj.What));
    if (obj.How) parts.push(`How: ${obj.How}`);
    if (obj.Specifics) parts.push(`Details: ${obj.Specifics}`);
    if (obj.Tips) parts.push(`Tips: ${obj.Tips}`);
    if (obj.Result) parts.push(`Expected result: ${obj.Result}`);
    if (parts.length > 0) return parts.join('\n');
    return JSON.stringify(item);
  }
  return String(item);
}

export function SearchDetailModal({
  isOpen,
  onClose,
  entryId,
  entryCategory,
  onAction,
}: SearchDetailModalProps) {
  const [entry, setEntry] = useState<EntryDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNotesEditor, setShowNotesEditor] = useState(false);
  const [showSourceInput, setShowSourceInput] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen && entryId) {
      setIsLoading(true);
      fetchEntry(entryId)
        .then((res) => {
          if (res.status === 'success' && res.entry) {
            // Map the generic record to EntryDetails
            const e = res.entry;
            setEntry({
              id: String(e.id || ''),
              title: String(e.title || ''),
              type: (e.type as EntryDetails['type']) || 'Idea',
              created_time: String(e.created_time || ''),
              last_edited_time: String(e.last_edited_time || ''),
              status: e.status as string | undefined,
              priority: e.priority as string | undefined,
              one_liner: e.one_liner as string | undefined,
              raw_insight: e.raw_insight as string | undefined,
              source: e.source as string | undefined,
              category: e.category as string | undefined,
              maturity: e.maturity as string | undefined,
              structured_summary: e.structured_summary as StructuredSummary | undefined,
              due_date: e.due_date as string | undefined,
              notes: e.notes as string | undefined,
              next_action: e.next_action as string | undefined,
              area: e.area as string | undefined,
              company: e.company as string | undefined,
              role: e.role as string | undefined,
              context: e.context as string | undefined,
              last_contact: e.last_contact as string | undefined,
              next_followup: e.next_followup as string | undefined,
            });
          }
        })
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, entryId]);

  const database = CATEGORY_TO_DB[entryCategory] || 'admin';

  const handleComplete = async () => {
    if (!entry) return;
    setActionLoading(true);
    try {
      await markDone(entry.id, database);
      showSuccess('Marked as done!');
      onAction?.();
      onClose();
    } catch {
      showError('Failed to mark as done');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSnooze = async (days: number) => {
    if (!entry) return;
    setActionLoading(true);
    try {
      const date = new Date();
      date.setDate(date.getDate() + days);
      await snoozeEntry(entry.id, database, date);
      showSuccess(`Snoozed ${days} day${days > 1 ? 's' : ''}`);
      onAction?.();
    } catch {
      showError('Failed to snooze');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePriorityChange = async (priority: string) => {
    if (!entry) return;
    setActionLoading(true);
    try {
      const response = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_id: entry.id,
          database,
          updates: { priority },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      setEntry({ ...entry, priority });
      showSuccess(`Priority set to ${priority}`);
      onAction?.();
    } catch {
      showError('Failed to update priority');
    } finally {
      setActionLoading(false);
    }
  };

  // Parse date string as local time for date-only strings
  const parseLocalDate = (dateStr: string) => {
    if (dateStr.includes('T')) {
      return new Date(dateStr);
    }
    // Date-only string like "2026-02-10" - parse as LOCAL midnight
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const formatDate = (dateStr: string) => {
    return parseLocalDate(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Copy to clipboard
  const handleCopy = async () => {
    if (!entry) return;
    const text = [
      entry.title,
      entry.one_liner,
      entry.raw_insight,
      entry.notes,
    ].filter(Boolean).join('\n\n');
    await navigator.clipboard.writeText(text.trim());
    showSuccess('Copied to clipboard!');
  };

  // Delete entry
  const handleDelete = async () => {
    if (!entry) return;
    setActionLoading(true);
    try {
      await deleteEntry(entry.id);
      showSuccess('Entry deleted');
      onAction?.();
      onClose();
    } catch {
      showError('Failed to delete entry');
    } finally {
      setActionLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  // Create follow-up task
  const handleCreateTask = async () => {
    if (!entry) return;
    setActionLoading(true);
    try {
      const taskText = `Follow up on: ${entry.title}`;
      await captureThought(taskText);
      showSuccess('Task created!');
    } catch {
      showError('Failed to create task');
    } finally {
      setActionLoading(false);
    }
  };

  // Save notes (uses local API for direct Notion update)
  const handleNotesSave = async (notes: string) => {
    if (!entry) return;
    try {
      const response = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_id: entry.id,
          database,
          updates: { notes },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      setEntry({ ...entry, notes });
      showSuccess('Notes saved!');
    } catch {
      showError('Failed to save notes');
    }
  };

  // Save source URL (for Ideas)
  const handleSaveSource = async () => {
    if (!entry || !sourceUrl.trim()) return;
    setActionLoading(true);
    try {
      const response = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_id: entry.id,
          database,
          updates: { source: sourceUrl.trim() },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      setEntry({ ...entry, source: sourceUrl.trim() });
      setShowSourceInput(false);
      setSourceUrl('');
      showSuccess('Source URL saved!');
      onAction?.();
    } catch {
      showError('Failed to save source URL');
    } finally {
      setActionLoading(false);
    }
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[90vh] bg-[var(--bg-deep)] rounded-t-2xl sm:rounded-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-deep)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate pr-4">
            {entry?.title || 'Loading...'}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-4 space-y-4" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="spinner" />
            </div>
          ) : entry ? (
            <>
              {/* Type Badge & Meta */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`px-2 py-1 rounded-full ${
                  entry.type === 'Idea' ? 'bg-purple-500/20 text-purple-400' :
                  entry.type === 'Admin' ? 'bg-orange-500/20 text-orange-400' :
                  entry.type === 'Project' ? 'bg-green-500/20 text-green-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}>
                  {entry.type}
                </span>
                {entry.status && (
                  <span className="px-2 py-1 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                    {entry.status}
                  </span>
                )}
                {entry.priority && (
                  <span className={`px-2 py-1 rounded-full ${
                    entry.priority === 'High' ? 'bg-red-500/20 text-red-400' :
                    entry.priority === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-green-500/20 text-green-400'
                  }`}>
                    {entry.priority}
                  </span>
                )}
                <span className="text-[var(--text-muted)]">
                  Updated {formatDate(entry.last_edited_time)}
                </span>
              </div>

              {/* IDEA: Rich Summary */}
              {entry.type === 'Idea' && entry.structured_summary && (
                <div className="space-y-4">
                  {/* TL;DR */}
                  {entry.structured_summary.tldr && (
                    <div className="p-3 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
                      <p className="text-xs font-medium text-purple-400 mb-1">TL;DR</p>
                      <p className="text-sm text-[var(--text-secondary)]">{entry.structured_summary.tldr}</p>
                    </div>
                  )}

                  {/* Key Takeaways */}
                  {entry.structured_summary.key_takeaways && entry.structured_summary.key_takeaways.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Key Takeaways</p>
                      <ul className="space-y-2">
                        {entry.structured_summary.key_takeaways.map((takeaway, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                            <span className="text-[var(--accent-cyan)]">•</span>
                            <span>{formatItem(takeaway)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action Items */}
                  {entry.structured_summary.action_items && entry.structured_summary.action_items.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Action Items</p>
                      <ul className="space-y-2">
                        {entry.structured_summary.action_items.map((action, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                            <span className="text-[#10b981]">☐</span>
                            <span className="whitespace-pre-wrap">{formatItem(action)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Full Summary (collapsed by default) */}
                  {entry.structured_summary.full_summary && (
                    <details className="group">
                      <summary className="text-xs font-medium text-[var(--accent-cyan)] cursor-pointer hover:underline">
                        Show full summary
                      </summary>
                      <p className="mt-2 text-sm text-[var(--text-muted)] leading-relaxed">
                        {entry.structured_summary.full_summary}
                      </p>
                    </details>
                  )}

                  {/* Source Link */}
                  {entry.source && (
                    <a
                      href={entry.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-cyan)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      Open Source
                    </a>
                  )}

                  {/* Add Source (for Ideas without source) */}
                  {!entry.source && !showSourceInput && (
                    <button
                      onClick={() => setShowSourceInput(true)}
                      className="inline-flex items-center gap-2 rounded-lg bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-surface)] transition-colors"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Add Source URL
                    </button>
                  )}

                  {/* Source URL Input */}
                  {!entry.source && showSourceInput && (
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={sourceUrl}
                        onChange={(e) => setSourceUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-cyan)]"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveSource}
                        disabled={actionLoading || !sourceUrl.trim()}
                        className="rounded-lg bg-[var(--accent-cyan)] px-3 py-2 text-sm font-medium text-[var(--bg-deep)] disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setShowSourceInput(false); setSourceUrl(''); }}
                        className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-muted)]"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Notes for Ideas with structured summary */}
                  {entry.notes && (
                    <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
                      <p className="text-xs text-[var(--text-muted)] mb-1">Notes</p>
                      <p className="text-sm text-[var(--text-muted)] whitespace-pre-wrap">{entry.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* IDEA: Fallback to raw insight */}
              {entry.type === 'Idea' && !entry.structured_summary && (
                <div className="space-y-3">
                  {entry.one_liner && (
                    <p className="text-sm text-[var(--text-secondary)] italic">{entry.one_liner}</p>
                  )}
                  {entry.raw_insight && (
                    <p className="text-sm text-[var(--text-muted)] whitespace-pre-wrap">{entry.raw_insight}</p>
                  )}
                  {/* Source Link for Ideas without structured summary */}
                  {entry.source && (
                    <a
                      href={entry.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-cyan)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      Open Source
                    </a>
                  )}

                  {/* Add Source (for Ideas without source) */}
                  {!entry.source && !showSourceInput && (
                    <button
                      onClick={() => setShowSourceInput(true)}
                      className="inline-flex items-center gap-2 rounded-lg bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-surface)] transition-colors"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Add Source URL
                    </button>
                  )}

                  {/* Source URL Input */}
                  {!entry.source && showSourceInput && (
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={sourceUrl}
                        onChange={(e) => setSourceUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-cyan)]"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveSource}
                        disabled={actionLoading || !sourceUrl.trim()}
                        className="rounded-lg bg-[var(--accent-cyan)] px-3 py-2 text-sm font-medium text-[var(--bg-deep)] disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setShowSourceInput(false); setSourceUrl(''); }}
                        className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-muted)]"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {entry.notes && (
                    <div>
                      <p className="text-xs text-[var(--text-muted)] mb-1">Notes</p>
                      <p className="text-sm text-[var(--text-muted)] whitespace-pre-wrap">{entry.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ADMIN/PROJECT: Details */}
              {(entry.type === 'Admin' || entry.type === 'Project') && (
                <div className="space-y-3">
                  {entry.due_date && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-[var(--text-muted)]">Due:</span>
                      <span className="text-[var(--text-secondary)]">{formatDate(entry.due_date)}</span>
                    </div>
                  )}
                  {entry.next_action && (
                    <div>
                      <p className="text-xs text-[var(--text-muted)] mb-1">Next Action</p>
                      <p className="text-sm text-[var(--text-secondary)]">{entry.next_action}</p>
                    </div>
                  )}
                  {entry.notes && (
                    <div>
                      <p className="text-xs text-[var(--text-muted)] mb-1">Notes</p>
                      <p className="text-sm text-[var(--text-muted)] whitespace-pre-wrap">{entry.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* PEOPLE: Details */}
              {entry.type === 'People' && (
                <div className="space-y-3">
                  {(entry.company || entry.role) && (
                    <div className="text-sm text-[var(--text-secondary)]">
                      {entry.role && <span>{entry.role}</span>}
                      {entry.role && entry.company && <span> at </span>}
                      {entry.company && <span className="font-medium">{entry.company}</span>}
                    </div>
                  )}
                  {entry.context && (
                    <div>
                      <p className="text-xs text-[var(--text-muted)] mb-1">Context</p>
                      <p className="text-sm text-[var(--text-muted)]">{entry.context}</p>
                    </div>
                  )}
                  {entry.last_contact && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-[var(--text-muted)]">Last contact:</span>
                      <span className="text-[var(--text-secondary)]">{formatDate(entry.last_contact)}</span>
                    </div>
                  )}
                  {entry.next_followup && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-[var(--text-muted)]">Follow-up:</span>
                      <span className="text-[var(--text-secondary)]">{formatDate(entry.next_followup)}</span>
                    </div>
                  )}
                  {entry.notes && (
                    <div>
                      <p className="text-xs text-[var(--text-muted)] mb-1">Notes</p>
                      <p className="text-sm text-[var(--text-muted)] whitespace-pre-wrap">{entry.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Quick Actions - Row 1: Mark Done + Snooze */}
              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleComplete}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-[#10b981] px-3 py-2 text-sm font-medium text-white hover:bg-[#059669] disabled:opacity-50"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Done
                  </button>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-[var(--text-muted)]">Snooze:</span>
                    {[1, 3, 7].map((days) => (
                      <button
                        key={days}
                        onClick={() => handleSnooze(days)}
                        disabled={actionLoading}
                        className="rounded-lg bg-[var(--bg-elevated)] px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] disabled:opacity-50"
                      >
                        {days}d
                      </button>
                    ))}
                  </div>
                </div>

                {/* Priority */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)]">Priority:</span>
                  {['High', 'Medium', 'Low'].map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePriorityChange(p)}
                      disabled={actionLoading}
                      className={`rounded-lg px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
                        entry.priority === p
                          ? p === 'High' ? 'bg-red-500/20 text-red-400' :
                            p === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-green-500/20 text-green-400'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:bg-[var(--bg-surface)]'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {/* New Actions Row: Copy, Notes, Task, Delete */}
                <div className="grid grid-cols-4 gap-2 pt-2">
                  {/* Copy */}
                  <button
                    onClick={handleCopy}
                    disabled={actionLoading}
                    className="flex flex-col items-center gap-1 rounded-lg bg-[var(--bg-elevated)] p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] disabled:opacity-50"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span className="text-xs">Copy</span>
                  </button>

                  {/* Notes - works for all entry types */}
                  <button
                    onClick={() => setShowNotesEditor(true)}
                    disabled={actionLoading}
                    className="flex flex-col items-center gap-1 rounded-lg bg-[var(--bg-elevated)] p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] disabled:opacity-50"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    <span className="text-xs">Notes</span>
                  </button>

                  {/* Create Task */}
                  <button
                    onClick={handleCreateTask}
                    disabled={actionLoading}
                    className="flex flex-col items-center gap-1 rounded-lg bg-[var(--bg-elevated)] p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] disabled:opacity-50"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                    </svg>
                    <span className="text-xs">Task</span>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={actionLoading}
                    className="flex flex-col items-center gap-1 rounded-lg bg-[var(--bg-elevated)] p-2 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    <span className="text-xs">Delete</span>
                  </button>
                </div>

                {/* Delete Confirmation */}
                {showDeleteConfirm && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <p className="text-sm text-red-400 mb-2">Delete this entry?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDelete}
                        disabled={actionLoading}
                        className="flex-1 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        Yes, Delete
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 rounded-lg bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-[var(--text-muted)]">
              Failed to load entry details
            </div>
          )}
        </div>

      </div>

      {/* Notes Editor Modal */}
      {entry && (
        <NotesEditor
          isOpen={showNotesEditor}
          taskTitle={entry.title}
          initialNotes={entry.notes || ''}
          onSave={handleNotesSave}
          onClose={() => setShowNotesEditor(false)}
        />
      )}
    </div>,
    document.body
  );
}
