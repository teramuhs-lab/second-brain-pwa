'use client';

import { useState, useRef, useEffect } from 'react';
import type { Entry, Category } from '@/lib/types';
import { FloatingCard } from './FloatingCard';
import { NotesEditor } from './NotesEditor';
import { fetchEntry } from '@/lib/api';

interface TaskCardProps {
  task: Entry;
  database: string;
  onStatusChange: (taskId: string, newStatus: string) => Promise<void>;
  onComplete: (taskId: string) => Promise<void>;
  onSnooze: (taskId: string, date: Date) => Promise<void>;
  onRecategorize: (taskId: string, newCategory: Category) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onTaskUpdate?: () => Promise<void>;
}

const CATEGORY_OPTIONS: { value: Category; label: string; icon: string }[] = [
  { value: 'People', label: 'People', icon: '👤' },
  { value: 'Project', label: 'Project', icon: '🚀' },
  { value: 'Idea', label: 'Idea', icon: '💡' },
  { value: 'Admin', label: 'Admin', icon: '📋' },
];

const DATABASE_TO_CATEGORY: Record<string, Category> = {
  admin: 'Admin',
  projects: 'Project',
  people: 'People',
  ideas: 'Idea',
};

const STATUS_OPTIONS: Record<string, string[]> = {
  admin: ['Todo', 'Done'],
  projects: ['Not Started', 'Active', 'Waiting', 'Complete'],
  people: ['New', 'Active', 'Dormant'],
  ideas: ['Spark', 'Developing', 'Actionable'],
};

// Priority dot colors (zen aesthetic - muted tones)
const PRIORITY_DOT_COLORS: Record<string, string> = {
  High: 'bg-red-400/80',
  Medium: 'bg-amber-400/70',
  Low: '', // No dot for low priority
};

export function TaskCard({
  task,
  database,
  onStatusChange,
  onComplete,
  onSnooze,
  onRecategorize,
  onDelete,
  onTaskUpdate,
}: TaskCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showFloatingCard, setShowFloatingCard] = useState(false);
  const [showNotesEditor, setShowNotesEditor] = useState(false);
  const [showNextActionEditor, setShowNextActionEditor] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [localDueDate, setLocalDueDate] = useState(task.due_date || '');
  const [localNotes, setLocalNotes] = useState(task.notes || '');
  const [localContext, setLocalContext] = useState(task.context || '');
  const [localNextAction, setLocalNextAction] = useState('');
  const [localOneLiner, setLocalOneLiner] = useState('');
  const startX = useRef(0);
  const currentX = useRef(0);
  const contextFetchedRef = useRef(false);

  const currentCategory = DATABASE_TO_CATEGORY[database];
  const statusOptions = STATUS_OPTIONS[database] || ['Todo', 'Done'];
  const completedStatus = database === 'ideas' ? null : database === 'projects' ? 'Complete' : database === 'people' ? 'Dormant' : 'Done';
  const isCompleted = completedStatus ? task.status === completedStatus : false;

  // Fetch context for People entries on mount (for display in list)
  useEffect(() => {
    if (database === 'people' && !localContext && !contextFetchedRef.current) {
      contextFetchedRef.current = true;
      fetchEntry(task.id).then((res) => {
        if (res.status === 'success' && res.entry) {
          if (res.entry.context) {
            setLocalContext(res.entry.context as string);
          }
          if (res.entry.notes && !localNotes) {
            setLocalNotes(res.entry.notes as string);
          }
        }
      });
    }
  }, [database, task.id, localContext, localNotes]);

  // Fetch next_action for Projects entries on mount
  useEffect(() => {
    if (database === 'projects' && !localNextAction) {
      fetchEntry(task.id).then((res) => {
        if (res.status === 'success' && res.entry) {
          if (res.entry.next_action) {
            setLocalNextAction(res.entry.next_action as string);
          }
        }
      });
    }
  }, [database, task.id, localNextAction]);

  // Fetch one_liner for Ideas entries on mount
  useEffect(() => {
    if (database === 'ideas') {
      // Use one_liner from task if available (from /api/ideas response)
      if (task.one_liner && !localOneLiner) {
        setLocalOneLiner(task.one_liner);
      } else if (!localOneLiner) {
        fetchEntry(task.id).then((res) => {
          if (res.status === 'success' && res.entry) {
            if (res.entry.one_liner) setLocalOneLiner(res.entry.one_liner as string);
            if (res.entry.notes && !localNotes) setLocalNotes(res.entry.notes as string);
          }
        });
      }
    }
  }, [database, task.id, task.one_liner, localOneLiner, localNotes]);

  // Fetch notes when floating card opens (n8n fetch doesn't return notes)
  useEffect(() => {
    if (showFloatingCard && !localNotes) {
      fetchEntry(task.id).then((res) => {
        if (res.status === 'success' && res.entry?.notes) {
          setLocalNotes(res.entry.notes as string);
        }
      });
    }
  }, [showFloatingCard, task.id, localNotes]);

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (showFloatingCard) return;
    startX.current = e.touches[0].clientX;
    currentX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (showFloatingCard) return;
    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;
    setSwipeOffset(Math.min(Math.max(diff, -100), 100));
  };

  const handleTouchEnd = async () => {
    if (showFloatingCard) return;
    if (swipeOffset > 60) {
      setIsLoading(true);
      await onComplete(task.id);
      setIsLoading(false);
    } else if (swipeOffset < -60) {
      setShowFloatingCard(true);
      setShowSnooze(true);
    }
    setSwipeOffset(0);
  };

  const handleStatusChange = async (newStatus: string) => {
    setIsLoading(true);
    if (database === 'ideas') {
      // Ideas use Maturity instead of Status
      await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_id: task.id,
          database: 'ideas',
          updates: { maturity: newStatus },
        }),
      });
      // Trigger reload via onStatusChange callback
      await onStatusChange(task.id, newStatus);
    } else {
      await onStatusChange(task.id, newStatus);
    }
    setIsLoading(false);
  };

  const handleSnooze = async (days: number) => {
    setIsLoading(true);
    setShowSnooze(false);
    setShowCustomDate(false);
    setShowFloatingCard(false);
    // Create date at noon to avoid timezone boundary issues
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(12, 0, 0, 0); // Set to noon
    await onSnooze(task.id, date);
    setIsLoading(false);
  };

  const handleCustomDateSnooze = async (dateStr: string) => {
    setIsLoading(true);
    setShowSnooze(false);
    setShowCustomDate(false);
    setShowFloatingCard(false);
    // Parse date parts to avoid timezone issues
    // Input format is "YYYY-MM-DD"
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0); // Use noon to avoid timezone boundary issues
    await onSnooze(task.id, date);
    setIsLoading(false);
  };

  const handleRecategorize = async (newCategory: Category) => {
    if (newCategory === currentCategory) return;
    setIsLoading(true);
    setShowFloatingCard(false);
    await onRecategorize(task.id, newCategory);
    setIsLoading(false);
  };

  const handleDelete = async () => {
    setIsLoading(true);
    setShowDeleteConfirm(false);
    setShowFloatingCard(false);
    await onDelete(task.id);
    setIsLoading(false);
  };

  const handleComplete = async () => {
    setIsLoading(true);
    setShowFloatingCard(false);
    await onComplete(task.id);
    setIsLoading(false);
  };

  const handleNotesSave = async (notes: string) => {
    setLocalNotes(notes);
    // Use local API directly (not n8n webhook) for reliable notes saving
    const response = await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_id: task.id,
        database,
        updates: { notes },
      }),
    });
    if (!response.ok) {
      console.error('Failed to save notes:', await response.text());
    }
    if (onTaskUpdate) {
      await onTaskUpdate();
    }
  };

  const handleNextActionSave = async (nextAction: string) => {
    setLocalNextAction(nextAction);
    const response = await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_id: task.id,
        database: 'projects',
        updates: { next_action: nextAction },
      }),
    });
    if (!response.ok) {
      console.error('Failed to save next action:', await response.text());
    }
  };

  const handleDueDateChange = async (dateStr: string) => {
    setLocalDueDate(dateStr);
    setShowDueDatePicker(false);
    const dateField = database === 'people' ? 'next_followup' : 'due_date';
    const response = await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_id: task.id,
        database,
        updates: { [dateField]: dateStr || null },
      }),
    });
    if (!response.ok) {
      console.error('Failed to save due date:', await response.text());
    }
  };

  const closeFloatingCard = () => {
    setShowFloatingCard(false);
    setShowSnooze(false);
    setShowCustomDate(false);
    setShowDeleteConfirm(false);
    setShowDueDatePicker(false);
  };

  // Parse date string as local time (not UTC)
  const parseLocalDate = (dateStr: string) => {
    // Handle both "2026-02-07" and "2026-02-07T14:00:00" formats
    if (dateStr.includes('T')) {
      return new Date(dateStr);
    }
    // "2026-02-07" -> parse as local midnight, not UTC
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const hasTime = (dateStr?: string) => {
    if (!dateStr || !dateStr.includes('T')) return false;
    // Extract time portion and check if it's not midnight
    const timeMatch = dateStr.match(/T(\d{2}):(\d{2})/);
    if (!timeMatch) return false;
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    return hours !== 0 || minutes !== 0;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = parseLocalDate(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset to midnight for comparison
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let dateDisplay: string;
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    if (dateOnly.getTime() === today.getTime()) {
      dateDisplay = 'Today';
    } else if (dateOnly.getTime() === tomorrow.getTime()) {
      dateDisplay = 'Tomorrow';
    } else {
      dateDisplay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // Add time if present
    if (hasTime(dateStr)) {
      return `${dateDisplay} · ${formatTime(dateStr)}`;
    }
    return dateDisplay;
  };

  const effectiveDueDate = localDueDate || task.due_date;
  const isOverdue = effectiveDueDate && (() => {
    const dueDate = parseLocalDate(effectiveDueDate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // For items with specific time, compare against current time
    // For date-only items, compare against midnight
    if (hasTime(effectiveDueDate)) {
      return dueDate < now;
    }
    return dueDate < today;
  })();

  return (
    <>
      <div ref={cardRef} className="relative overflow-hidden rounded-xl">
        {/* Right swipe background (complete) */}
        <div
          className="absolute inset-y-0 left-0 flex items-center justify-start bg-[var(--accent-green)] px-4 transition-opacity"
          style={{ opacity: swipeOffset > 20 ? 1 : 0, width: '100px' }}
        >
          <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Left swipe background (snooze) */}
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-end bg-[var(--accent-cyan)] px-4 transition-opacity"
          style={{ opacity: swipeOffset < -20 ? 1 : 0, width: '100px' }}
        >
          <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>

        {/* Card content - zen styling */}
        <div
          className={`relative rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-subtle)]/50 p-4 transition-all duration-200 ${isLoading ? 'opacity-50' : ''} ${isCompleted ? 'opacity-50' : ''} ${isOverdue && !isCompleted ? 'border-l-2 border-l-red-400/50' : ''}`}
          style={{ transform: `translateX(${swipeOffset}px)` }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex items-start justify-between gap-3">
            {/* Left side - priority dot, checkbox and content */}
            <div className="flex items-start gap-2.5 flex-1 min-w-0">
              {/* Priority dot - only show for High/Medium */}
              {task.priority && task.priority !== 'Low' && (
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT_COLORS[task.priority]}`} />
              )}

              {/* Checkbox */}
              <button
                onClick={() => onComplete(task.id)}
                disabled={isLoading}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                  isCompleted
                    ? 'border-emerald-500/60 bg-emerald-500/60'
                    : 'border-[var(--text-muted)]/30 hover:border-[var(--text-muted)]/50'
                }`}
              >
                {isCompleted && (
                  <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              {/* Content - Tap to open floating card */}
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => setShowFloatingCard(true)}
              >
                <h3 className={`text-[15px] font-medium text-[var(--text-primary)] line-clamp-2 leading-relaxed ${isCompleted ? 'line-through opacity-50' : ''}`}>
                  {task.title}
                </h3>

                {/* Context for People entries - show original capture text */}
                {database === 'people' && localContext && (
                  <p className="mt-0.5 text-[13px] text-[var(--text-secondary)] line-clamp-1 italic">
                    &ldquo;{localContext}&rdquo;
                  </p>
                )}

                {/* Next Action for Project entries */}
                {database === 'projects' && localNextAction && (
                  <p className="mt-0.5 text-[13px] text-[var(--text-secondary)] line-clamp-1">
                    Next: {localNextAction}
                  </p>
                )}

                {/* One-liner for Idea entries */}
                {database === 'ideas' && localOneLiner && (
                  <p className="mt-0.5 text-[13px] text-[var(--text-secondary)] line-clamp-1">
                    {localOneLiner}
                  </p>
                )}

                {/* Subtle metadata row */}
                <div className="mt-1 flex items-center gap-3">
                  {/* Due date - subtle styling */}
                  {effectiveDueDate && (
                    <span className={`text-xs ${isOverdue ? 'text-red-400/90 font-medium' : 'text-[var(--text-muted)]/70'}`}>
                      {formatDate(effectiveDueDate)}
                    </span>
                  )}

                  {/* Notes indicator - subtle */}
                  {(localNotes || task.notes) && (
                    <svg className="h-3.5 w-3.5 text-[var(--text-muted)]/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <path d="M14 2v6h6M16 13H8M16 17H8" />
                    </svg>
                  )}
                </div>
              </div>
            </div>

            {/* Right side - more button (subtle) */}
            <button
              onClick={() => setShowFloatingCard(true)}
              className="rounded-lg p-2 text-[var(--text-muted)]/40 transition-colors hover:text-[var(--text-muted)]"
              title="More options"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="6" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="12" cy="18" r="1.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Card */}
      <FloatingCard
        isOpen={showFloatingCard}
        anchorRef={cardRef}
        onClose={closeFloatingCard}
      >
        {/* Title */}
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 pr-2">
          {task.title}
        </h3>

        {/* Status section */}
        <div className="mb-3">
          <p className="mb-2 text-xs text-[var(--text-muted)]">Status</p>
          <div className="flex flex-wrap gap-1.5">
            {statusOptions.map((status) => (
              <button
                key={status}
                onClick={() => handleStatusChange(status)}
                disabled={isLoading}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  status === task.status
                    ? 'bg-[var(--accent-cyan)] text-[var(--bg-deep)]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Next Action section — projects only */}
        {database === 'projects' && (
          <div className="mb-3">
            <p className="mb-2 text-xs text-[var(--text-muted)]">Next Action</p>
            <div
              onClick={() => {
                setShowFloatingCard(false);
                setShowNextActionEditor(true);
              }}
              className="p-2.5 rounded-lg bg-[var(--bg-elevated)] cursor-pointer hover:bg-[var(--bg-surface)] transition-colors"
            >
              {localNextAction ? (
                <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{localNextAction}</p>
              ) : (
                <p className="text-xs text-[var(--text-muted)] italic">Tap to set next action...</p>
              )}
            </div>
          </div>
        )}

        {/* Due Date section (hidden for ideas — no date field) */}
        {database !== 'ideas' && <div className="mb-3">
          <p className="mb-2 text-xs text-[var(--text-muted)]">Due Date</p>
          {showDueDatePicker ? (
            <div className="space-y-2">
              <input
                type="date"
                defaultValue={localDueDate ? localDueDate.split('T')[0] : ''}
                onChange={(e) => {
                  if (e.target.value) handleDueDateChange(e.target.value);
                }}
                className="w-full rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--accent-cyan)]"
              />
              {localDueDate && (
                <button
                  onClick={() => handleDueDateChange('')}
                  className="text-xs text-red-400/70 hover:text-red-400 transition-colors"
                >
                  Remove date
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowDueDatePicker(true)}
              className="w-full p-2.5 rounded-lg bg-[var(--bg-elevated)] text-left hover:bg-[var(--bg-surface)] transition-colors"
            >
              {localDueDate ? (
                <span className={`text-xs ${isOverdue ? 'text-red-400 font-medium' : 'text-[var(--text-secondary)]'}`}>
                  {formatDate(localDueDate)}
                </span>
              ) : (
                <span className="text-xs text-[var(--text-muted)] italic">Set deadline...</span>
              )}
            </button>
          )}
        </div>}

        {/* Move to section */}
        <div className="mb-3">
          <p className="mb-2 text-xs text-[var(--text-muted)]">Move to</p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_OPTIONS.filter(cat => cat.value !== currentCategory).map((cat) => (
              <button
                key={cat.value}
                onClick={() => handleRecategorize(cat.value)}
                disabled={isLoading}
                className="flex items-center gap-1 rounded-lg bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition-all"
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Notes section */}
        <div className="mb-3">
          <p className="mb-2 text-xs text-[var(--text-muted)]">Notes</p>
          <div
            onClick={() => {
              setShowFloatingCard(false);
              setShowNotesEditor(true);
            }}
            className="p-2.5 rounded-lg bg-[var(--bg-elevated)] cursor-pointer hover:bg-[var(--bg-surface)] transition-colors"
          >
            {localNotes || task.notes ? (
              <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                {localNotes || task.notes}
              </p>
            ) : (
              <p className="text-xs text-[var(--text-muted)] italic">Tap to add notes...</p>
            )}
          </div>
        </div>

        {/* Actions section */}
        <div className="flex gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <button
            onClick={() => setShowSnooze(!showSnooze)}
            disabled={isLoading}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all ${
              showSnooze
                ? 'bg-[var(--accent-cyan)] text-[var(--bg-deep)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
            }`}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            Snooze
          </button>
          <button
            onClick={handleComplete}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-900/30 text-green-400 px-2 py-2 text-xs font-medium hover:bg-green-900/50 transition-all"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Done
          </button>
          <button
            onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
            disabled={isLoading}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all ${
              showDeleteConfirm
                ? 'bg-red-500 text-white'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-red-900/30 hover:text-red-400'
            }`}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Delete
          </button>
        </div>

        {/* Snooze options */}
        {showSnooze && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[
              { label: 'Tomorrow', days: 1 },
              { label: 'Next Week', days: 7 },
              { label: 'Next Month', days: 30 },
            ].map((option) => (
              <button
                key={option.label}
                onClick={() => handleSnooze(option.days)}
                disabled={isLoading}
                className="rounded-lg bg-cyan-900/50 text-cyan-400 px-2.5 py-1.5 text-xs font-medium hover:bg-cyan-900/70 transition-colors"
              >
                {option.label}
              </button>
            ))}
            <button
              onClick={() => setShowCustomDate(!showCustomDate)}
              className="rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--bg-surface)] transition-colors"
            >
              Pick Date
            </button>
          </div>
        )}

        {/* Custom date picker */}
        {showSnooze && showCustomDate && (
          <input
            type="date"
            min={new Date().toISOString().split('T')[0]}
            onChange={(e) => {
              if (e.target.value) {
                handleCustomDateSnooze(e.target.value);
              }
            }}
            className="mt-2 w-full rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] border border-[var(--border-subtle)] focus:outline-none focus:border-[var(--accent-cyan)]"
          />
        )}

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="mt-3 p-3 rounded-lg bg-red-900/20 border border-red-900/50">
            <p className="text-center text-sm text-gray-300 mb-3">Delete this task?</p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={isLoading}
                className="flex-1 rounded-lg bg-red-500 text-white px-3 py-2 text-xs font-medium hover:bg-red-600 transition-colors"
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] px-3 py-2 text-xs font-medium hover:bg-[var(--bg-surface)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </FloatingCard>

      {/* Notes Editor */}
      <NotesEditor
        isOpen={showNotesEditor}
        taskTitle={task.title}
        initialNotes={localNotes || task.notes || ''}
        onSave={handleNotesSave}
        onClose={() => setShowNotesEditor(false)}
      />

      {/* Next Action Editor — projects only */}
      {database === 'projects' && (
        <NotesEditor
          isOpen={showNextActionEditor}
          taskTitle={task.title}
          editorTitle="Next Action"
          initialNotes={localNextAction}
          onSave={handleNextActionSave}
          onClose={() => setShowNextActionEditor(false)}
        />
      )}
    </>
  );
}
