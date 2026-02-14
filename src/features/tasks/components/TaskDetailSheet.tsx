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
  { value: 'Reading', label: 'Reading', icon: '📖' },
];

const DATABASE_TO_CATEGORY: Record<string, Category> = {
  admin: 'Admin',
  projects: 'Project',
  people: 'People',
  ideas: 'Idea',
  reading: 'Reading',
};

const STATUS_OPTIONS: Record<string, string[]> = {
  admin: ['Todo', 'Done'],
  projects: ['Not Started', 'Active', 'Waiting', 'Complete'],
  people: ['New', 'Active', 'Dormant'],
  reading: ['Unread', 'Read'],
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
  const completedStatus = database === 'projects' ? 'Complete' : database === 'people' ? 'Dormant' : database === 'reading' ? 'Read' : 'Done';

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

  // Parse date string as local time (not UTC) for date-only strings
  const parseLocalDate = (dateStr: string) => {
    if (dateStr.includes('T')) {
      return new Date(dateStr);
    }
    // Date-only string like "2026-02-10" - parse as LOCAL midnight
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Check if date string has a specific time (not midnight)
  const hasTime = (dateStr: string) => {
    if (!dateStr.includes('T')) return false;
    const timeMatch = dateStr.match(/T(\d{2}):(\d{2})/);
    if (!timeMatch) return false;
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    return hours !== 0 || minutes !== 0;
  };

  const isOverdue = task.due_date && (() => {
    const dueDate = parseLocalDate(task.due_date);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // For items with specific time, compare against current time
    if (hasTime(task.due_date)) {
      return dueDate < now;
    }
    return dueDate < today;
  })();

  const isCompleted = task.status === completedStatus;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = parseLocalDate(dateStr);
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
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${
          isAnimating ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Centered Modal Card */}
      <div
        className={`fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 bg-[var(--bg-deep)] rounded-2xl shadow-2xl border border-[var(--border-subtle)] transition-all duration-200 ${
          isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 text-gray-500 hover:text-white transition-colors"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Content */}
        <div className={`p-5 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
          {/* Title */}
          <h2 className={`text-lg font-bold text-white pr-6 ${isCompleted ? 'line-through opacity-60' : ''}`}>
            {task.title}
          </h2>

          {/* Meta row */}
          <div className="mt-2 flex items-center gap-3 text-sm text-gray-400">
            <span>{currentCategory}</span>
            {task.priority && (
              <>
                <span>•</span>
                <span className={PRIORITY_COLORS[task.priority]}>{task.priority}</span>
              </>
            )}
            {task.due_date && (
              <>
                <span>•</span>
                <span className={isOverdue ? 'text-red-400' : ''}>
                  {isOverdue && '⚠ '}{parseLocalDate(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </>
            )}
          </div>

          {/* Status buttons */}
          <div className="mt-4 flex gap-2">
            {statusOptions.map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  s === task.status
                    ? 'bg-cyan-500 text-gray-900'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="mt-4 border-t border-gray-700" />

          {/* Move to */}
          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-2">Move to</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.filter(c => c.value !== currentCategory).map((c) => (
                <button
                  key={c.value}
                  onClick={() => handleRecategorize(c.value)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 text-gray-300 text-sm hover:bg-gray-700 transition-colors"
                >
                  <span>{c.icon}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setShowSnoozeOptions(!showSnoozeOptions)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              <span className="text-sm">Snooze</span>
            </button>

            <button
              onClick={handleComplete}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-green-900/30 text-green-400 hover:bg-green-900/50 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-sm">Done</span>
            </button>

            <button
              onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gray-800 text-gray-300 hover:bg-red-900/30 hover:text-red-400 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-sm">Delete</span>
            </button>
          </div>

          {/* Snooze Options */}
          {showSnoozeOptions && (
            <div className="mt-3 flex gap-2">
              {[{ l: 'Tomorrow', d: 1 }, { l: '1 Week', d: 7 }, { l: '1 Month', d: 30 }].map((o) => (
                <button
                  key={o.l}
                  onClick={() => handleSnooze(o.d)}
                  className="flex-1 px-3 py-2 rounded-lg bg-cyan-900/50 text-cyan-400 text-sm font-medium hover:bg-cyan-900/70 transition-colors"
                >
                  {o.l}
                </button>
              ))}
            </div>
          )}

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="mt-3 p-3 rounded-xl bg-red-900/20 border border-red-900/50">
              <p className="text-center text-gray-300 text-sm mb-3">Delete this task?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  Yes, Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
