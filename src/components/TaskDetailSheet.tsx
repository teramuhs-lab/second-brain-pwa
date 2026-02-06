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
        className={`fixed bottom-16 left-2 right-2 z-50 bg-[#1e1e2a] rounded-xl shadow-2xl border border-gray-800 transition-all duration-200 ${
          isAnimating ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
        }`}
      >
          {/* Single compact content area */}
          <div className={`px-3 py-2 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
            {/* Row 1: Title + Status */}
            <div className="flex items-start justify-between gap-2">
              <h2 className={`text-sm font-medium text-white leading-tight flex-1 ${isCompleted ? 'line-through opacity-60' : ''}`}>
                {task.title}
              </h2>
              <div className="flex gap-0.5 shrink-0">
                {statusOptions.map((s) => (
                  <button key={s} onClick={() => handleStatusChange(s)} className={`px-1.5 rounded text-[9px] ${s === task.status ? 'bg-cyan-500 text-gray-900' : 'text-gray-500'}`}>{s}</button>
                ))}
              </div>
            </div>

            {/* Row 2: Meta + Actions */}
            <div className="mt-1 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-gray-500">{currentCategory}</span>
                {task.priority && <span className={PRIORITY_COLORS[task.priority]}>{task.priority}</span>}
                {task.due_date && <span className={isOverdue ? 'text-red-400' : 'text-gray-500'}>{isOverdue ? '⚠' : ''}{new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
              </div>
              <div className="flex items-center gap-1">
                {CATEGORY_OPTIONS.filter(c => c.value !== currentCategory).map((c) => (
                  <button key={c.value} onClick={() => handleRecategorize(c.value)} className="text-[10px] opacity-60 hover:opacity-100">{c.icon}</button>
                ))}
                <span className="text-gray-700 mx-0.5">|</span>
                <button onClick={() => setShowSnoozeOptions(!showSnoozeOptions)} className="text-gray-500 hover:text-cyan-400"><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></button>
                <button onClick={handleComplete} className="text-gray-500 hover:text-green-400"><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
                <button onClick={() => setShowDeleteConfirm(!showDeleteConfirm)} className="text-gray-500 hover:text-red-400"><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
              </div>
            </div>

            {/* Conditional rows */}
            {showSnoozeOptions && (
              <div className="mt-1 flex gap-1">
                {[{ l: '1d', d: 1 }, { l: '1w', d: 7 }, { l: '1m', d: 30 }].map((o) => (
                  <button key={o.l} onClick={() => handleSnooze(o.d)} className="px-1.5 rounded bg-cyan-900/50 text-cyan-400 text-[9px]">{o.l}</button>
                ))}
              </div>
            )}
            {showDeleteConfirm && (
              <div className="mt-1 flex gap-1 text-[9px]">
                <span className="text-gray-400">Delete?</span>
                <button onClick={handleDelete} className="px-1.5 rounded bg-red-500 text-white">Yes</button>
                <button onClick={() => setShowDeleteConfirm(false)} className="px-1.5 rounded bg-gray-700 text-gray-300">No</button>
              </div>
            )}
          </div>
        </div>
    </>
  );
}
