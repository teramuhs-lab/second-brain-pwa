'use client';

import { TaskList } from '@/features/tasks/components/TaskList';

export default function TasksPage() {
  return (
    <div className="mx-auto max-w-lg px-5 pt-8">
      {/* Header */}
      <header className="mb-8 animate-fade-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-green)] to-emerald-600 text-lg">
            ✓
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            Tasks
          </h1>
        </div>
        <p className="text-base text-[var(--text-muted)] ml-[52px]">
          Manage your active items
        </p>
      </header>

      {/* Task List */}
      <div className="animate-fade-up delay-1">
        <TaskList />
      </div>
    </div>
  );
}
