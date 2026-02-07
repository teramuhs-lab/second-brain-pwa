'use client';

import { useState, useRef } from 'react';
import type { Entry, Category } from '@/lib/types';
import { FloatingCard } from './FloatingCard';
import { NotesEditor } from './NotesEditor';
import { updateEntry } from '@/lib/api';

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
};

const PRIORITY_COLORS: Record<string, string> = {
  High: 'text-red-400 bg-red-400/10 border-red-400/30',
  Medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  Low: 'text-green-400 bg-green-400/10 border-green-400/30',
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
  const [showSnooze, setShowSnooze] = useState(false);
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [localNotes, setLocalNotes] = useState(task.notes || '');
  const startX = useRef(0);
  const currentX = useRef(0);

  const currentCategory = DATABASE_TO_CATEGORY[database];
  const statusOptions = STATUS_OPTIONS[database] || ['Todo', 'Done'];
  const completedStatus = database === 'projects' ? 'Complete' : database === 'people' ? 'Dormant' : 'Done';
  const isCompleted = task.status === completedStatus;

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
    await onStatusChange(task.id, newStatus);
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
    await updateEntry(task.id, database, { notes });
    if (onTaskUpdate) {
      await onTaskUpdate();
    }
  };

  const closeFloatingCard = () => {
    setShowFloatingCard(false);
    setShowSnooze(false);
    setShowCustomDate(false);
    setShowDeleteConfirm(false);
  };

  // Parse date string as local time (not UTC)
  const parseLocalDate = (dateStr: string) => {
    // "2026-02-07" -> parse as local midnight, not UTC
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = parseLocalDate(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset to midnight for comparison
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === today.getTime()) return 'Today';
    if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isOverdue = task.due_date && (() => {
    const dueDate = parseLocalDate(task.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
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

        {/* Card content */}
        <div
          className={`relative glass-card p-4 transition-all duration-200 ${isLoading ? 'opacity-50' : ''} ${isCompleted ? 'opacity-60' : ''}`}
          style={{ transform: `translateX(${swipeOffset}px)` }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex items-start justify-between gap-3">
            {/* Left side - checkbox and content */}
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {/* Checkbox */}
              <button
                onClick={() => onComplete(task.id)}
                disabled={isLoading}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                  isCompleted
                    ? 'border-[var(--accent-green)] bg-[var(--accent-green)]'
                    : 'border-[var(--border-glass)] hover:border-[var(--accent-cyan)]'
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
                <h3 className={`text-sm font-medium text-[var(--text-primary)] line-clamp-2 leading-snug ${isCompleted ? 'line-through opacity-60' : ''}`}>
                  {task.title}
                </h3>

                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {/* Status badge */}
                  <span className="rounded-md bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                    {task.status}
                  </span>

                  {/* Priority badge */}
                  {task.priority && (
                    <span className={`rounded-md border px-2 py-0.5 text-xs ${PRIORITY_COLORS[task.priority] || ''}`}>
                      {task.priority}
                    </span>
                  )}

                  {/* Due date */}
                  {task.due_date && (
                    <span className={`text-xs ${isOverdue ? 'text-[var(--accent-red)]' : 'text-[var(--text-muted)]'}`}>
                      {isOverdue && '⚠ '}{formatDate(task.due_date)}
                    </span>
                  )}

                  {/* Notes indicator */}
                  {(localNotes || task.notes) && (
                    <span className="text-xs text-[var(--text-muted)]">📝</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right side - more button */}
            <button
              onClick={() => setShowFloatingCard(true)}
              className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
              title="More options"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="6" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="18" r="2" />
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
    </>
  );
}
