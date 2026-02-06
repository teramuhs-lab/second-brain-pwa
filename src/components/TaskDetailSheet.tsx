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
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${
          isAnimating ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Bottom Sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 bg-[#1a1a24] rounded-t-3xl transition-transform duration-300 ease-out ${
          isAnimating ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '70vh' }}
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>

        {/* Content */}
        <div className={`px-6 pb-8 overflow-y-auto ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
          {/* Title */}
          <h2 className={`text-xl font-bold text-white ${isCompleted ? 'line-through opacity-60' : ''}`}>
            {task.title}
          </h2>

          {/* Details */}
          <div className="mt-6 space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Status</span>
              <div className="flex gap-2">
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
            </div>

            {/* Priority */}
            {task.priority && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Priority</span>
                <span className={`text-sm font-medium ${PRIORITY_COLORS[task.priority]}`}>
                  {task.priority}
                </span>
              </div>
            )}

            {/* Due Date */}
            {task.due_date && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Due</span>
                <span className={`text-sm font-medium ${isOverdue ? 'text-red-400' : 'text-white'}`}>
                  {isOverdue && '⚠ '}{formatDate(task.due_date)}
                </span>
              </div>
            )}

            {/* Category */}
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Category</span>
              <span className="text-sm font-medium text-white">{currentCategory}</span>
            </div>
          </div>

          {/* Move To Section */}
          <div className="mt-8">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Move to</p>
            <div className="flex gap-3">
              {CATEGORY_OPTIONS.filter(c => c.value !== currentCategory).map((c) => (
                <button
                  key={c.value}
                  onClick={() => handleRecategorize(c.value)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800 text-gray-300 text-sm hover:bg-gray-700 transition-colors"
                >
                  <span>{c.icon}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex justify-center gap-8">
            <button
              onClick={() => setShowSnoozeOptions(!showSnoozeOptions)}
              className="flex flex-col items-center gap-1 text-gray-400 hover:text-cyan-400 transition-colors"
            >
              <div className="p-3 rounded-full bg-gray-800">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <span className="text-xs">Snooze</span>
            </button>

            <button
              onClick={handleComplete}
              className="flex flex-col items-center gap-1 text-gray-400 hover:text-green-400 transition-colors"
            >
              <div className="p-3 rounded-full bg-gray-800">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-xs">Done</span>
            </button>

            <button
              onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
              className="flex flex-col items-center gap-1 text-gray-400 hover:text-red-400 transition-colors"
            >
              <div className="p-3 rounded-full bg-gray-800">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-xs">Delete</span>
            </button>
          </div>

          {/* Snooze Options */}
          {showSnoozeOptions && (
            <div className="mt-6 flex justify-center gap-3">
              {[{ l: 'Tomorrow', d: 1 }, { l: 'Next Week', d: 7 }, { l: 'Next Month', d: 30 }].map((o) => (
                <button
                  key={o.l}
                  onClick={() => handleSnooze(o.d)}
                  className="px-4 py-2 rounded-full bg-cyan-900/50 text-cyan-400 text-sm font-medium hover:bg-cyan-900/70 transition-colors"
                >
                  {o.l}
                </button>
              ))}
            </div>
          )}

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="mt-6 p-4 rounded-xl bg-red-900/20 border border-red-900/50">
              <p className="text-center text-gray-300 mb-4">Are you sure you want to delete this task?</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={handleDelete}
                  className="px-6 py-2 rounded-full bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  Yes, Delete
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-6 py-2 rounded-full bg-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-600 transition-colors"
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
