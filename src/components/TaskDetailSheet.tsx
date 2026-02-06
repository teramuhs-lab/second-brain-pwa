'use client';

import { useState, useEffect } from 'react';
import type { Entry, Category } from '@/lib/types';

interface TaskDetailSheetProps {
  task: Entry | null;
  database: string;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (taskId: string, newStatus: string) => Promise<void>;
  onComplete: (taskId: string) => Promise<void>;
  onSnooze: (taskId: string, date: Date) => Promise<void>;
  onRecategorize: (taskId: string, newCategory: Category) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
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
  High: 'text-red-400',
  Medium: 'text-yellow-400',
  Low: 'text-green-400',
};

export function TaskDetailSheet({
  task,
  database,
  isOpen,
  onClose,
  onStatusChange,
  onComplete,
  onSnooze,
  onRecategorize,
  onDelete,
}: TaskDetailSheetProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const currentCategory = DATABASE_TO_CATEGORY[database];
  const statusOptions = STATUS_OPTIONS[database] || ['Todo', 'Done'];
  const completedStatus = database === 'projects' ? 'Complete' : database === 'people' ? 'Dormant' : 'Done';

  // Handle open/close animation
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Reset state when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setShowSnoozeOptions(false);
      setShowDeleteConfirm(false);
    }
  }, [isOpen]);

  if (!isVisible || !task) return null;

  const isOverdue = task.due_date && new Date(task.due_date) < new Date();
  const isCompleted = task.status === completedStatus;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleStatusChange = async (newStatus: string) => {
    setIsLoading(true);
    await onStatusChange(task.id, newStatus);
    setIsLoading(false);
  };

  const handleComplete = async () => {
    setIsLoading(true);
    await onComplete(task.id);
    setIsLoading(false);
    onClose();
  };

  const handleSnooze = async (days: number) => {
    setIsLoading(true);
    setShowSnoozeOptions(false);
    const date = new Date();
    date.setDate(date.getDate() + days);
    await onSnooze(task.id, date);
    setIsLoading(false);
    onClose();
  };

  const handleRecategorize = async (newCategory: Category) => {
    if (newCategory === currentCategory) return;
    setIsLoading(true);
    await onRecategorize(task.id, newCategory);
    setIsLoading(false);
    onClose();
  };

  const handleDelete = async () => {
    setIsLoading(true);
    await onDelete(task.id);
    setIsLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isAnimating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-[var(--bg-surface)] rounded-t-3xl transition-transform duration-300 ease-out ${
          isAnimating ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '85vh', paddingBottom: 'env(safe-area-inset-bottom, 20px)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-4 pb-2">
          <div className="w-12 h-1 bg-[var(--border-glass)] rounded-full" />
        </div>

        {/* Content */}
        <div className={`px-8 pb-8 overflow-y-auto ${isLoading ? 'opacity-50 pointer-events-none' : ''}`} style={{ maxHeight: 'calc(85vh - 60px)' }}>

          {/* Title - Large and prominent */}
          <h2 className={`text-2xl font-semibold text-[var(--text-primary)] leading-relaxed mt-4 ${isCompleted ? 'line-through opacity-60' : ''}`}>
            {task.title}
          </h2>

          {/* Metadata - Spacious layout */}
          <div className="mt-8 space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-muted)]">Status</span>
              <div className="flex gap-2">
                {statusOptions.map((status) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                      status === task.status
                        ? 'bg-[var(--accent-cyan)] text-[var(--bg-deep)] font-medium'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            {task.priority && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-muted)]">Priority</span>
                <span className={`text-sm font-medium ${PRIORITY_COLORS[task.priority]}`}>
                  {task.priority}
                </span>
              </div>
            )}

            {/* Due Date */}
            {task.due_date && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-muted)]">Due</span>
                <span className={`text-sm ${isOverdue ? 'text-[var(--accent-red)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                  {isOverdue && '⚠ '}{formatDate(task.due_date)}
                </span>
              </div>
            )}

            {/* Category */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-muted)]">Category</span>
              <span className="text-sm text-[var(--text-secondary)]">{currentCategory}</span>
            </div>
          </div>

          {/* Divider */}
          <div className="my-8 h-px bg-[var(--border-subtle)]" />

          {/* Move to different category */}
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">Move to</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.filter(cat => cat.value !== currentCategory).map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => handleRecategorize(cat.value)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-sm transition-all hover:bg-[var(--bg-glass)]"
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Snooze options */}
          {showSnoozeOptions && (
            <>
              <div className="my-8 h-px bg-[var(--border-subtle)]" />
              <div>
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">Snooze until</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Tomorrow', days: 1 },
                    { label: 'This Weekend', days: 6 - new Date().getDay() || 7 },
                    { label: 'Next Week', days: 7 },
                    { label: 'Next Month', days: 30 },
                  ].map((option) => (
                    <button
                      key={option.label}
                      onClick={() => handleSnooze(option.days)}
                      className="px-4 py-2 rounded-xl bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-sm transition-all hover:bg-[var(--bg-glass)]"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <>
              <div className="my-8 h-px bg-[var(--border-subtle)]" />
              <div className="text-center">
                <p className="text-sm text-[var(--text-secondary)] mb-4">Delete this item?</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleDelete}
                    className="px-6 py-2 rounded-xl bg-[var(--accent-red)] text-white text-sm font-medium"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-6 py-2 rounded-xl bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Action buttons - Bottom */}
          <div className="mt-10 flex justify-center gap-12">
            <button
              onClick={() => setShowSnoozeOptions(!showSnoozeOptions)}
              className="flex flex-col items-center gap-2 text-[var(--text-muted)] hover:text-[var(--accent-cyan)] transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </div>
              <span className="text-xs">Snooze</span>
            </button>

            <button
              onClick={handleComplete}
              className="flex flex-col items-center gap-2 text-[var(--text-muted)] hover:text-[var(--accent-green)] transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-xs">{isCompleted ? 'Undo' : 'Done'}</span>
            </button>

            <button
              onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
              className="flex flex-col items-center gap-2 text-[var(--text-muted)] hover:text-[var(--accent-red)] transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-xs">Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
