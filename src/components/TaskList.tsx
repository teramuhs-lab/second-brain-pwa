'use client';

import { useState, useEffect, useCallback } from 'react';
import { TaskCard } from './TaskCard';
import { fetchEntries, markDone, snoozeEntry, updateEntry } from '@/lib/api';
import type { Entry } from '@/lib/types';

type TabType = 'admin' | 'projects' | 'people';

const TABS: { id: TabType; label: string; icon: string; activeStatus: string }[] = [
  { id: 'admin', label: 'Tasks', icon: '📋', activeStatus: 'Todo' },
  { id: 'projects', label: 'Projects', icon: '🚀', activeStatus: 'Active' },
  { id: 'people', label: 'People', icon: '👤', activeStatus: 'Active' },
];

const TAB_COLORS: Record<TabType, string> = {
  admin: 'from-orange-500 to-amber-500',
  projects: 'from-green-500 to-emerald-500',
  people: 'from-blue-500 to-cyan-500',
};

export function TaskList() {
  const [activeTab, setActiveTab] = useState<TabType>('admin');
  const [tasks, setTasks] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const tab = TABS.find((t) => t.id === activeTab);
      // Fetch all items (no status filter) so we can show both active and completed
      const data = await fetchEntries(activeTab);
      setTasks(data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    await updateEntry(taskId, activeTab, { status: newStatus });
    await loadTasks();
  };

  const handleComplete = async (taskId: string) => {
    await markDone(taskId, activeTab);
    await loadTasks();
  };

  const handleSnooze = async (taskId: string, date: Date) => {
    await snoozeEntry(taskId, activeTab, date);
    await loadTasks();
  };

  // Filter tasks by completion status
  const completedStatus = activeTab === 'projects' ? 'Complete' : activeTab === 'people' ? 'Dormant' : 'Done';
  const activeTasks = tasks.filter((t) => t.status !== completedStatus);
  const completedTasks = tasks.filter((t) => t.status === completedStatus);
  const displayTasks = showCompleted ? completedTasks : activeTasks;

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? `bg-gradient-to-r ${TAB_COLORS[tab.id]} text-white shadow-lg`
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {!isLoading && (
                <span
                  className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                    isActive ? 'bg-white/20' : 'bg-[var(--bg-deep)]'
                  }`}
                >
                  {tasks.filter((t) => t.status !== completedStatus).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Toggle completed */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {showCompleted ? 'Completed' : 'Active'}
        </h2>
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {showCompleted ? (
              <path d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" />
            ) : (
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" />
            )}
          </svg>
          {showCompleted ? 'Show Active' : `Show Completed (${completedTasks.length})`}
        </button>
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="spinner mb-3" />
          <span className="text-sm text-[var(--text-muted)]">Loading...</span>
        </div>
      ) : displayTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl bg-[var(--bg-elevated)] py-12">
          <span className="text-4xl mb-3">{showCompleted ? '🎉' : '✨'}</span>
          <span className="text-sm text-[var(--text-muted)]">
            {showCompleted ? 'No completed items yet' : 'All caught up!'}
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {displayTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              database={activeTab}
              onStatusChange={handleStatusChange}
              onComplete={handleComplete}
              onSnooze={handleSnooze}
            />
          ))}
        </div>
      )}

      {/* Swipe hint */}
      {!showCompleted && activeTasks.length > 0 && (
        <p className="text-center text-xs text-[var(--text-muted)]">
          Swipe right to complete • Tap clock to snooze
        </p>
      )}
    </div>
  );
}
