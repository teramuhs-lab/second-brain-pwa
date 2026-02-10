'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { TaskCard } from './TaskCard';
import { PullToRefresh } from './PullToRefresh';
import { TaskListSkeleton } from '@/shared/components/Skeleton';
import { fetchEntries, markDone, snoozeEntry, updateEntry, recategorize, deleteEntry } from '@/lib/api';
import { useToast } from '@/shared/components/Toast';
import type { Entry, Category } from '@/lib/types';

// Map database names to Category type
const DATABASE_TO_CATEGORY: Record<string, Category> = {
  admin: 'Admin',
  projects: 'Project',
  people: 'People',
  ideas: 'Idea',
};

type TabType = 'admin' | 'projects' | 'people' | 'ideas';

// Zen tabs - no emoji, clean labels
const TABS: { id: TabType; label: string; activeStatus: string }[] = [
  { id: 'admin', label: 'Tasks', activeStatus: 'Todo' },
  { id: 'projects', label: 'Projects', activeStatus: 'Active' },
  { id: 'people', label: 'People', activeStatus: 'Active' },
  { id: 'ideas', label: 'Ideas', activeStatus: 'Spark' },
];

// Zen tab colors - muted, calm
const TAB_COLORS: Record<TabType, string> = {
  admin: 'bg-[var(--text-primary)]',
  projects: 'bg-[var(--text-primary)]',
  people: 'bg-[var(--text-primary)]',
  ideas: 'bg-[var(--text-primary)]',
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
  return { now, today, tomorrow, weekEnd };
}

// Check if a date string includes a meaningful time (not midnight)
function hasTime(dateStr: string): boolean {
  if (!dateStr.includes('T')) return false;
  // Extract time portion and check if it's not midnight
  // Handles formats like: 2026-02-09T16:30:00.000-05:00 or 2026-02-09T00:00:00.000+01:00
  const timeMatch = dateStr.match(/T(\d{2}):(\d{2})/);
  if (!timeMatch) return false;
  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  // Consider it "has time" only if not midnight (00:00)
  return hours !== 0 || minutes !== 0;
}

// Parse date string to Date object (handling timezone correctly)
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;

  // If it has a time component (T), parse normally (includes timezone)
  if (dateStr.includes('T')) {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }

  // Date-only string like "2026-02-10" - parse as LOCAL midnight, not UTC
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
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
  const { now, today, tomorrow, weekEnd } = getDateBoundaries();
  const groups: GroupedTasks = { overdue: [], today: [], this_week: [], upcoming: [], backlog: [] };

  tasks.forEach(task => {
    const dueDate = parseDate(task.due_date);
    if (!dueDate) {
      groups.backlog.push(task);
    } else {
      // For items with specific time, compare against current time
      // For date-only items, compare against midnight
      const isOverdue = task.due_date && hasTime(task.due_date)
        ? dueDate < now
        : dueDate < today;

      if (isOverdue) {
        groups.overdue.push(task);
      } else if (dueDate < tomorrow) {
        groups.today.push(task);
      } else if (dueDate < weekEnd) {
        groups.this_week.push(task);
      } else {
        groups.upcoming.push(task);
      }
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

// Group and sort tasks for Projects tab (by status + due date)
function groupProjectTasks(tasks: Entry[]): GroupedTasks {
  const { today } = getDateBoundaries();
  const groups: GroupedTasks = { overdue: [], today: [], this_week: [], upcoming: [], backlog: [] };

  tasks.forEach(task => {
    if (task.status === 'Waiting') {
      groups.this_week.push(task); // "Waiting" section
    } else {
      const dueDate = parseDate(task.due_date);
      if (dueDate && dueDate < today) {
        groups.overdue.push(task); // Overdue active projects
      } else {
        groups.today.push(task); // "Active" section
      }
    }
  });

  // Sort each group by priority, then by due date
  groups.overdue.sort(sortByPriorityAndDate);
  groups.today.sort(sortByPriorityAndDate);
  groups.this_week.sort(sortByPriorityAndDate);

  return groups;
}

// Group and sort tasks for People tab
function groupPeopleTasks(tasks: Entry[]): GroupedTasks {
  const { now, today, tomorrow, weekEnd } = getDateBoundaries();
  const groups: GroupedTasks = { overdue: [], today: [], this_week: [], upcoming: [], backlog: [] };

  tasks.forEach(task => {
    // People use due_date field for next_followup
    const followupDate = parseDate(task.due_date);
    if (!followupDate) {
      groups.backlog.push(task);
    } else {
      // For items with specific time, compare against current time
      // For date-only items, compare against midnight
      const isOverdue = task.due_date && hasTime(task.due_date)
        ? followupDate < now
        : followupDate < today;

      if (isOverdue) {
        groups.overdue.push(task);
      } else if (followupDate < tomorrow) {
        groups.today.push(task);
      } else if (followupDate < weekEnd) {
        groups.this_week.push(task);
      } else {
        groups.upcoming.push(task);
      }
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

// Group and sort ideas by Maturity (Actionable > Developing > Spark)
function groupIdeasTasks(tasks: Entry[]): GroupedTasks {
  const groups: GroupedTasks = { overdue: [], today: [], this_week: [], upcoming: [], backlog: [] };

  tasks.forEach(task => {
    switch (task.status) {
      case 'Actionable':
        groups.today.push(task);     // "Actionable" section
        break;
      case 'Developing':
        groups.this_week.push(task);  // "Developing" section
        break;
      default:
        groups.upcoming.push(task);   // "Spark" section (default)
        break;
    }
  });

  return groups;
}

export function TaskList() {
  const [activeTab, setActiveTab] = useState<TabType>('admin');
  const [tasks, setTasks] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<Section>>(
    new Set(['this_week', 'upcoming', 'backlog'])
  );
  const [fullyExpandedSections, setFullyExpandedSections] = useState<Set<Section>>(new Set());
  const { showError } = useToast();

  const SECTION_ITEM_LIMIT = 5;

  const toggleSection = (key: Section) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const loadTasks = useCallback(async (showLoadingState = true) => {
    if (showLoadingState) setIsLoading(true);
    try {
      if (activeTab === 'ideas') {
        // Fetch ideas from our own API route (returns maturity in status field)
        const response = await fetch('/api/ideas');
        const data = await response.json();
        setTasks(data.items || []);
      } else {
        const data = await fetchEntries(activeTab);
        setTasks(data);
      }
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
    // Reset section states on tab switch
    if (activeTab === 'ideas') {
      setCollapsedSections(new Set(['upcoming'])); // Only Spark collapsed
    } else if (activeTab === 'projects') {
      setCollapsedSections(new Set(['this_week'])); // Only Waiting collapsed
    } else {
      setCollapsedSections(new Set(['this_week', 'upcoming', 'backlog']));
    }
    setFullyExpandedSections(new Set());
  }, [loadTasks, activeTab]);

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    if (activeTab !== 'ideas') {
      // Ideas use Maturity (handled directly by TaskCard)
      await updateEntry(taskId, activeTab, { status: newStatus });
    }
    await loadTasks();
  };

  const handleComplete = async (taskId: string) => {
    if (activeTab === 'ideas') {
      await deleteEntry(taskId); // Ideas don't have "done" — archive instead
    } else {
      await markDone(taskId, activeTab);
    }
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

  // Filter tasks by completion status (ideas have no completed state)
  const completedStatus = activeTab === 'ideas' ? null : activeTab === 'projects' ? 'Complete' : activeTab === 'people' ? 'Dormant' : 'Done';
  const activeTasks = completedStatus ? tasks.filter((t) => t.status !== completedStatus) : tasks;
  const completedTasks = completedStatus ? tasks.filter((t) => t.status === completedStatus) : [];

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
      case 'ideas':
        return groupIdeasTasks(activeTasks);
      default:
        return null;
    }
  }, [activeTab, activeTasks, showCompleted]);

  // Section configuration - zen styling, no emojis
  const SECTIONS: { key: Section; label: string; color: string }[] = [
    { key: 'overdue', label: 'Overdue', color: 'text-red-400/80' },
    { key: 'today', label: activeTab === 'ideas' ? 'Actionable' : activeTab === 'projects' ? 'Active' : 'Today', color: 'text-[var(--text-secondary)]' },
    { key: 'this_week', label: activeTab === 'ideas' ? 'Developing' : activeTab === 'projects' ? 'Waiting' : 'This Week', color: 'text-[var(--text-muted)]' },
    { key: 'upcoming', label: activeTab === 'ideas' ? 'Spark' : 'Upcoming', color: 'text-[var(--text-muted)]' },
    { key: 'backlog', label: 'Backlog', color: 'text-[var(--text-muted)]/70' },
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
        {/* Tab navigation - zen styling */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const tabActiveTasks = tasks.filter((t) => t.status !== completedStatus);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <span>{tab.label}</span>
              {!isLoading && isActive && urgentCount > 0 && (
                <span className="rounded-full bg-red-400/20 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                  {urgentCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active tab indicator */}
      <div className="h-px bg-gradient-to-r from-transparent via-[var(--border-subtle)] to-transparent mb-4" />

      {/* Toggle completed - subtle (hidden for Ideas tab, no completed state) */}
      {activeTab !== 'ideas' && (
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]/60 transition-colors hover:text-[var(--text-muted)]"
        >
          {showCompleted ? (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" />
              </svg>
              Show Active
            </>
          ) : completedTasks.length > 0 ? (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" />
              </svg>
              Completed · {completedTasks.length}
            </>
          ) : null}
        </button>
      </div>
      )}

      {/* Task list */}
      {isLoading ? (
        <TaskListSkeleton count={5} />
      ) : displayTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <span className="text-sm text-[var(--text-muted)]/60">
            {showCompleted ? 'No completed items' : 'All clear'}
          </span>
        </div>
      ) : showCompleted ? (
        // Completed tasks - flat list
        <div className="space-y-2">
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
          {SECTIONS.map(({ key, label, color }) => {
            const sectionTasks = groupedTasks[key];
            if (sectionTasks.length === 0) return null;

            const isCollapsed = collapsedSections.has(key);
            const isBacklog = key === 'backlog' || (key === 'this_week' && activeTab === 'projects');
            const visibleTasks = isCollapsed ? [] : (
              fullyExpandedSections.has(key)
                ? sectionTasks
                : sectionTasks.slice(0, SECTION_ITEM_LIMIT)
            );
            const hiddenCount = isCollapsed ? 0 : sectionTasks.length - visibleTasks.length;

            return (
              <div key={key} className={isBacklog ? 'pt-4 border-t border-dashed border-[var(--border-subtle)]' : ''}>
                {/* Section header - tappable to collapse/expand */}
                <button
                  className={`w-full flex items-center gap-2 mb-3 ${color} ${isBacklog && isCollapsed ? 'opacity-60' : ''}`}
                  onClick={() => toggleSection(key)}
                >
                  <svg
                    className={`h-3 w-3 shrink-0 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-xs font-medium tracking-wide">{label}</span>
                  <span className="text-xs opacity-40">·</span>
                  <span className="text-xs opacity-40">{sectionTasks.length}</span>
                </button>

                {/* Section tasks - animated collapse */}
                <div
                  className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
                    isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-2">
                      {visibleTasks.map((task) => (
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

                      {/* Show more button */}
                      {hiddenCount > 0 && (
                        <button
                          onClick={() => setFullyExpandedSections(prev => new Set(prev).add(key))}
                          className="w-full py-2.5 text-center text-xs text-[var(--text-muted)]/60 hover:text-[var(--text-muted)] transition-colors"
                        >
                          Show {hiddenCount} more
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Fallback flat list
        <div className="space-y-2">
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

        {/* Swipe hint - very subtle */}
        {!showCompleted && activeTasks.length > 0 && (
          <p className="text-center text-[11px] text-[var(--text-muted)]/40 pt-4">
            Swipe right to complete · Tap to expand
          </p>
        )}
      </div>
    </PullToRefresh>
  );
}
