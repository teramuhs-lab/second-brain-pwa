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
    <>
      {/* Tap-to-close area - only above the sheet */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${isAnimating ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Floating bottom sheet - no backdrop */}
      <div
        className={`fixed bottom-20 left-3 right-3 z-50 bg-[#1e1e2a] rounded-2xl shadow-2xl border border-gray-700 transition-all duration-200 ${
          isAnimating ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
        }`}
      >
          {/* Content area */}
          <div className={`px-4 py-4 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
            {/* Title */}
            <h2 className={`text-base font-semibold text-white leading-snug ${isCompleted ? 'line-through opacity-60' : ''}`}>
              {task.title}
            </h2>

            {/* Status buttons */}
            <div className="mt-3 flex gap-2">
              {statusOptions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    s === task.status
                      ? 'bg-cyan-500 text-gray-900'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Meta info */}
            <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
              <span>{currentCategory}</span>
              {task.priority && <span className={PRIORITY_COLORS[task.priority]}>{task.priority}</span>}
              {task.due_date && (
                <span className={isOverdue ? 'text-red-400' : ''}>
                  {isOverdue ? '⚠ ' : ''}{new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>

            {/* Divider */}
            <div className="mt-4 border-t border-gray-700" />

            {/* Actions row */}
            <div className="mt-3 flex items-center justify-between">
              {/* Move to category */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Move to:</span>
                {CATEGORY_OPTIONS.filter(c => c.value !== currentCategory).map((c) => (
                  <button
                    key={c.value}
                    onClick={() => handleRecategorize(c.value)}
                    className="text-lg hover:scale-110 transition-transform"
                  >
                    {c.icon}
                  </button>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowSnoozeOptions(!showSnoozeOptions)}
                  className="p-2 rounded-lg text-gray-400 hover:text-cyan-400 hover:bg-gray-800 transition-colors"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                </button>
                <button
                  onClick={handleComplete}
                  className="p-2 rounded-lg text-gray-400 hover:text-green-400 hover:bg-gray-800 transition-colors"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Snooze options */}
            {showSnoozeOptions && (
              <div className="mt-3 flex gap-2">
                {[{ l: '1 day', d: 1 }, { l: '1 week', d: 7 }, { l: '1 month', d: 30 }].map((o) => (
                  <button
                    key={o.l}
                    onClick={() => handleSnooze(o.d)}
                    className="px-3 py-1.5 rounded-lg bg-cyan-900/50 text-cyan-400 text-xs font-medium hover:bg-cyan-900/70 transition-colors"
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            )}

            {/* Delete confirmation */}
            {showDeleteConfirm && (
              <div className="mt-3 flex items-center gap-3">
                <span className="text-sm text-gray-400">Delete this task?</span>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 rounded-lg bg-gray-700 text-gray-300 text-xs font-medium hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
    </>
  );
}
