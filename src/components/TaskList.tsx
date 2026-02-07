'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { TaskCard } from './TaskCard';
import { PullToRefresh } from './PullToRefresh';
import { TaskListSkeleton } from './Skeleton';
import { fetchEntries, markDone, snoozeEntry, updateEntry, recategorize, deleteEntry } from '@/lib/api';
import { useToast } from './Toast';
import type { Entry, Category } from '@/lib/types';

// Map database names to Category type
const DATABASE_TO_CATEGORY: Record<string, Category> = {
  admin: 'Admin',
  projects: 'Project',
  people: 'People',
  ideas: 'Idea',
};

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

// Priority order for sorting
const PRIORITY_ORDER: Record<string, number> = {
  'High': 0,
  'Medium': 1,
  'Low': 2,
};

// Section types for grouping
type Section = 'overdue' | 'today' | 'this_week' | 'upcoming' | 'backlog';

interface GroupedTasks {
  overdue: Entry[];
  today: Entry[];
  this_week: Entry[];
  upcoming: Entry[];
  backlog: Entry[];
}

// Helper to get date boundaries
function getDateBoundaries() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return { today, tomorrow, weekEnd };
}

// Parse date string to Date object
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

// Sort by priority, then by date
function sortByPriorityAndDate(a: Entry, b: Entry): number {
  const priorityA = PRIORITY_ORDER[a.priority || 'Low'] ?? 3;
  const priorityB = PRIORITY_ORDER[b.priority || 'Low'] ?? 3;
  if (priorityA !== priorityB) return priorityA - priorityB;

  const dateA = parseDate(a.due_date);
  const dateB = parseDate(b.due_date);
  if (dateA && dateB) return dateA.getTime() - dateB.getTime();
  if (dateA) return -1;
  if (dateB) return 1;
  return 0;
}

// Group and sort tasks for Admin tab
function groupAdminTasks(tasks: Entry[]): GroupedTasks {
  const { today, tomorrow, weekEnd } = getDateBoundaries();
  const groups: GroupedTasks = { overdue: [], today: [], this_week: [], upcoming: [], backlog: [] };

  tasks.forEach(task => {
    const dueDate = parseDate(task.due_date);
    if (!dueDate) {
      groups.backlog.push(task);
    } else if (dueDate < today) {
      groups.overdue.push(task);
    } else if (dueDate < tomorrow) {
      groups.today.push(task);
    } else if (dueDate < weekEnd) {
      groups.this_week.push(task);
    } else {
      groups.upcoming.push(task);
    }
  });

  // Sort each group by priority
  Object.keys(groups).forEach(key => {
    groups[key as Section].sort(sortByPriorityAndDate);
  });

  // Sort backlog by priority only
  groups.backlog.sort((a, b) => {
    const priorityA = PRIORITY_ORDER[a.priority || 'Low'] ?? 3;
    const priorityB = PRIORITY_ORDER[b.priority || 'Low'] ?? 3;
    return priorityA - priorityB;
  });

  return groups;
}

// Group and sort tasks for Projects tab
function groupProjectTasks(tasks: Entry[]): GroupedTasks {
  const groups: GroupedTasks = { overdue: [], today: [], this_week: [], upcoming: [], backlog: [] };

  // For projects, sort by priority then by last edited (approximated by created)
  const sorted = [...tasks].sort((a, b) => {
    const priorityA = PRIORITY_ORDER[a.priority || 'Medium'] ?? 2;
    const priorityB = PRIORITY_ORDER[b.priority || 'Medium'] ?? 2;
    if (priorityA !== priorityB) return priorityA - priorityB;
    // No direct last_edited, so we just keep original order
    return 0;
  });

  // Put high priority in "today" section, others in "backlog"
  sorted.forEach(task => {
    if (task.priority === 'High') {
      groups.today.push(task);
    } else {
      groups.backlog.push(task);
    }
  });

  return groups;
}

// Group and sort tasks for People tab
function groupPeopleTasks(tasks: Entry[]): GroupedTasks {
  const { today, tomorrow, weekEnd } = getDateBoundaries();
  const groups: GroupedTasks = { overdue: [], today: [], this_week: [], upcoming: [], backlog: [] };

  tasks.forEach(task => {
    // People use due_date field for next_followup
    const followupDate = parseDate(task.due_date);
    if (!followupDate) {
      groups.backlog.push(task);
    } else if (followupDate < today) {
      groups.overdue.push(task);
    } else if (followupDate < tomorrow) {
      groups.today.push(task);
    } else if (followupDate < weekEnd) {
      groups.this_week.push(task);
    } else {
      groups.upcoming.push(task);
    }
  });

  // Sort each group by date
  const sortByDate = (a: Entry, b: Entry) => {
    const dateA = parseDate(a.due_date);
    const dateB = parseDate(b.due_date);
    if (dateA && dateB) return dateA.getTime() - dateB.getTime();
    return 0;
  };

  groups.overdue.sort(sortByDate);
  groups.today.sort(sortByDate);
  groups.this_week.sort(sortByDate);
  groups.upcoming.sort(sortByDate);

  return groups;
}

export function TaskList() {
  const [activeTab, setActiveTab] = useState<TabType>('admin');
  const [tasks, setTasks] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const { showError } = useToast();

  const loadTasks = useCallback(async (showLoadingState = true) => {
    if (showLoadingState) setIsLoading(true);
    try {
      const data = await fetchEntries(activeTab);
      setTasks(data);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      if (showLoadingState) setIsLoading(false);
    }
  }, [activeTab]);

  const handleRefresh = useCallback(async () => {
    await loadTasks(false);
  }, [loadTasks]);

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

  const handleRecategorize = async (taskId: string, newCategory: Category) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const currentCategory = DATABASE_TO_CATEGORY[activeTab];
    await recategorize(taskId, currentCategory, newCategory, task.title);
    await loadTasks();
  };

  const handleDelete = async (taskId: string) => {
    try {
      const result = await deleteEntry(taskId);
      if (result.status === 'error') {
        showError(result.error || 'Failed to delete');
        return;
      }
      await loadTasks();
    } catch (error) {
      showError('Failed to delete task. Please try again.');
    }
  };

  // Filter tasks by completion status
  const completedStatus = activeTab === 'projects' ? 'Complete' : activeTab === 'people' ? 'Dormant' : 'Done';
  const activeTasks = tasks.filter((t) => t.status !== completedStatus);
  const completedTasks = tasks.filter((t) => t.status === completedStatus);

  // Group active tasks by urgency/priority
  const groupedTasks = useMemo(() => {
    if (showCompleted) return null;

    switch (activeTab) {
      case 'admin':
        return groupAdminTasks(activeTasks);
      case 'projects':
        return groupProjectTasks(activeTasks);
      case 'people':
        return groupPeopleTasks(activeTasks);
      default:
        return null;
    }
  }, [activeTab, activeTasks, showCompleted]);

  // Section configuration
  const SECTIONS: { key: Section; label: string; icon: string; color: string }[] = [
    { key: 'overdue', label: 'Overdue', icon: '🔴', color: 'text-red-400' },
    { key: 'today', label: activeTab === 'projects' ? 'High Priority' : 'Today', icon: activeTab === 'projects' ? '⬆️' : '🟠', color: activeTab === 'projects' ? 'text-orange-400' : 'text-orange-400' },
    { key: 'this_week', label: 'This Week', icon: '🟡', color: 'text-yellow-400' },
    { key: 'upcoming', label: 'Upcoming', icon: '📅', color: 'text-blue-400' },
    { key: 'backlog', label: activeTab === 'projects' ? 'Other Projects' : 'Backlog', icon: '📥', color: 'text-[var(--text-muted)]' },
  ];

  const displayTasks = showCompleted ? completedTasks : activeTasks;

  // Calculate urgent count (overdue + today) for badge
  const urgentCount = useMemo(() => {
    if (!groupedTasks) return 0;
    return groupedTasks.overdue.length + groupedTasks.today.length;
  }, [groupedTasks]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-6">
        {/* Tab navigation */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const tabActiveTasks = tasks.filter((t) => t.status !== completedStatus);
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
                  {isActive && urgentCount > 0 ? (
                    <span className="flex items-center gap-1">
                      <span className="text-red-300">{urgentCount}</span>
                      <span className="opacity-50">/</span>
                      <span>{tabActiveTasks.length}</span>
                    </span>
                  ) : (
                    tabActiveTasks.length
                  )}
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
        <TaskListSkeleton count={5} />
      ) : displayTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl bg-[var(--bg-elevated)] py-12">
          <span className="text-4xl mb-3">{showCompleted ? '🎉' : '✨'}</span>
          <span className="text-sm text-[var(--text-muted)]">
            {showCompleted ? 'No completed items yet' : 'All caught up!'}
          </span>
        </div>
      ) : showCompleted ? (
        // Completed tasks - flat list
        <div className="space-y-3">
          {completedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              database={activeTab}
              onStatusChange={handleStatusChange}
              onComplete={handleComplete}
              onSnooze={handleSnooze}
              onRecategorize={handleRecategorize}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : groupedTasks ? (
        // Active tasks - grouped by urgency
        <div className="space-y-6">
          {SECTIONS.map(({ key, label, icon, color }) => {
            const sectionTasks = groupedTasks[key];
            if (sectionTasks.length === 0) return null;

            return (
              <div key={key}>
                {/* Section header */}
                <div className={`flex items-center gap-2 mb-3 ${color}`}>
                  <span className="text-sm">{icon}</span>
                  <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
                  <span className="text-xs opacity-60">({sectionTasks.length})</span>
                </div>

                {/* Section tasks */}
                <div className="space-y-3">
                  {sectionTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      database={activeTab}
                      onStatusChange={handleStatusChange}
                      onComplete={handleComplete}
                      onSnooze={handleSnooze}
                      onRecategorize={handleRecategorize}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Fallback flat list
        <div className="space-y-3">
          {displayTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              database={activeTab}
              onStatusChange={handleStatusChange}
              onComplete={handleComplete}
              onSnooze={handleSnooze}
              onRecategorize={handleRecategorize}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

        {/* Swipe hint */}
        {!showCompleted && activeTasks.length > 0 && (
          <p className="text-center text-xs text-[var(--text-muted)]">
            Pull down to refresh • Tap to expand • Swipe to complete
          </p>
        )}
      </div>
    </PullToRefresh>
  );
}
