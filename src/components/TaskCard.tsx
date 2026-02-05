'use client';

import { useState, useRef } from 'react';
import type { Entry, Category } from '@/lib/types';

interface TaskCardProps {
  task: Entry;
  database: string;
  onStatusChange: (taskId: string, newStatus: string) => Promise<void>;
  onComplete: (taskId: string) => Promise<void>;
  onSnooze: (taskId: string, date: Date) => Promise<void>;
  onRecategorize: (taskId: string, newCategory: Category) => Promise<void>;
}

const CATEGORY_OPTIONS: { value: Category; label: string; icon: string }[] = [
  { value: 'People', label: 'People', icon: '👤' },
  { value: 'Project', label: 'Project', icon: '🚀' },
  { value: 'Idea', label: 'Idea', icon: '💡' },
  { value: 'Admin', label: 'Admin', icon: '📋' },
];

// Map database names to Category type
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
}: TaskCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [showRecategorize, setShowRecategorize] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const startX = useRef(0);
  const currentX = useRef(0);

  const currentCategory = DATABASE_TO_CATEGORY[database];

  const statusOptions = STATUS_OPTIONS[database] || ['Todo', 'Done'];
  const completedStatus = database === 'projects' ? 'Complete' : database === 'people' ? 'Dormant' : 'Done';
  const isCompleted = task.status === completedStatus;

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;
    // Allow both directions: right (positive) for complete, left (negative) for snooze
    setSwipeOffset(Math.min(Math.max(diff, -100), 100));
  };

  const handleTouchEnd = async () => {
    if (swipeOffset > 60) {
      // Right swipe: Trigger complete
      setIsLoading(true);
      await onComplete(task.id);
      setIsLoading(false);
    } else if (swipeOffset < -60) {
      // Left swipe: Open snooze picker
      setShowSnooze(true);
    }
    setSwipeOffset(0);
  };

  const handleStatusChange = async (newStatus: string) => {
    setIsLoading(true);
    setShowStatus(false);
    await onStatusChange(task.id, newStatus);
    setIsLoading(false);
  };

  const handleSnooze = async (days: number) => {
    setIsLoading(true);
    setShowSnooze(false);
    const date = new Date();
    date.setDate(date.getDate() + days);
    await onSnooze(task.id, date);
    setIsLoading(false);
  };

  const handleRecategorize = async (newCategory: Category) => {
    if (newCategory === currentCategory) {
      setShowRecategorize(false);
      return;
    }
    setIsLoading(true);
    setShowRecategorize(false);
    await onRecategorize(task.id, newCategory);
    setIsLoading(false);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isOverdue = task.due_date && new Date(task.due_date) < new Date();

  return (
    <div className="relative overflow-hidden rounded-xl">
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

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className={`text-sm font-medium text-[var(--text-primary)] truncate ${isCompleted ? 'line-through opacity-60' : ''}`}>
                {task.title}
              </h3>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {/* Status badge */}
                <button
                  onClick={() => setShowStatus(!showStatus)}
                  className="rounded-md bg-[var(--bg-elevated)] px-2 py-0.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)]"
                >
                  {task.status}
                </button>

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
              </div>
            </div>
          </div>

          {/* Right side - action buttons */}
          <div className="flex shrink-0 gap-1">
            {/* Recategorize button */}
            <button
              onClick={() => setShowRecategorize(!showRecategorize)}
              className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
              title="Move to different category"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 11v6M9 14h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {/* Snooze button */}
            <button
              onClick={() => setShowSnooze(!showSnooze)}
              className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
              title="Snooze"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Status picker dropdown */}
        {showStatus && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-3">
            {statusOptions.map((status) => (
              <button
                key={status}
                onClick={() => handleStatusChange(status)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  status === task.status
                    ? 'bg-[var(--accent-cyan)] text-[var(--bg-deep)]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        )}

        {/* Snooze picker dropdown */}
        {showSnooze && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-3">
            {[
              { label: 'Tomorrow', days: 1 },
              { label: 'This Weekend', days: new Date().getDay() === 0 ? 6 : 6 - new Date().getDay() },
              { label: 'Next Week', days: 7 },
              { label: 'Next Month', days: 30 },
            ].map((option) => (
              <button
                key={option.label}
                onClick={() => handleSnooze(option.days)}
                className="rounded-lg bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)]"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {/* Recategorize picker dropdown */}
        {showRecategorize && (
          <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
            <p className="mb-2 text-xs text-[var(--text-muted)]">Move to:</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => handleRecategorize(cat.value)}
                  disabled={cat.value === currentCategory}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    cat.value === currentCategory
                      ? 'bg-[var(--accent-cyan)] text-[var(--bg-deep)] cursor-default'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
