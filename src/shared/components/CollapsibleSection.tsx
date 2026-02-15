'use client';

import { ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  count,
  collapsed,
  onToggle,
  headerExtra,
  children,
  className = '',
}: CollapsibleSectionProps) {
  return (
    <div className={`rounded-xl bg-[var(--bg-elevated)] overflow-hidden ${className}`}>
      <button
        className="w-full flex items-center gap-2 p-4 text-left"
        onClick={onToggle}
      >
        <svg
          className={`h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-xs font-medium text-[var(--text-secondary)] flex-1">{title}</p>
        {headerExtra}
        {count !== undefined && (
          <span className="text-xs text-[var(--text-muted)]">{count}</span>
        )}
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
          collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
