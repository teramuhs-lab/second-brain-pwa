'use client';

import { useState } from 'react';
import { CollapsibleSection } from '@/shared/components/CollapsibleSection';

interface GoogleTask {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  category?: string;
  notes?: string;
}

interface GoogleTasksSectionProps {
  tasks: GoogleTask[];
  collapsed: boolean;
  onToggle: () => void;
}

export function GoogleTasksSection({ tasks, collapsed, onToggle }: GoogleTasksSectionProps) {
  const [showAll, setShowAll] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  if (tasks.length === 0) return null;

  const visibleTasks = showAll ? tasks : tasks.slice(0, 10);
  const hasMore = tasks.length > 10;
  const today = new Date().toISOString().split('T')[0];
  const listNames = [...new Set(tasks.map(t => t.category).filter(Boolean))];
  const showListLabels = listNames.length > 1;

  return (
    <CollapsibleSection title="Google Tasks" count={tasks.length} collapsed={collapsed} onToggle={onToggle} className="mt-4">
            <div className="space-y-1">
              {visibleTasks.map((task) => {
                const isOverdue = task.dueDate && task.dueDate < today;
                const hasNotes = !!task.notes;
                const isExpanded = expandedTask === task.id;
                return (
                  <div key={task.id}>
                    <div
                      className={`flex items-center gap-3 py-1 ${hasNotes ? 'cursor-pointer' : ''}`}
                      onClick={hasNotes ? () => setExpandedTask(isExpanded ? null : task.id) : undefined}
                    >
                      <span className={`w-4 h-4 rounded border shrink-0 ${isOverdue ? 'border-[var(--accent-red)]/50' : 'border-[var(--text-muted)]/30'}`} />
                      <div className="min-w-0 flex-1 truncate">
                        <span className={`text-sm truncate ${isOverdue ? 'text-[var(--accent-red)]' : 'text-[var(--text-primary)]'}`}>
                          {task.title}
                        </span>
                        {showListLabels && task.category && (
                          <span className="text-[10px] text-[var(--text-muted)]/50 ml-1.5">{task.category}</span>
                        )}
                      </div>
                      {task.dueDate && (
                        <span className={`text-xs shrink-0 ml-auto ${isOverdue ? 'text-[var(--accent-red)]/70' : 'text-[var(--text-muted)]/60'}`}>
                          {new Date(task.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {hasNotes && (
                        <svg
                          className={`h-3 w-3 shrink-0 text-[var(--text-muted)]/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        >
                          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    {isExpanded && task.notes && (
                      <p className="ml-7 mb-1 text-xs text-[var(--text-muted)] leading-relaxed whitespace-pre-line">
                        {task.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {hasMore && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="mt-2 text-xs text-[var(--accent-cyan)] hover:underline"
              >
                {showAll ? 'Show less' : `Show all ${tasks.length} tasks`}
              </button>
            )}
    </CollapsibleSection>
  );
}
