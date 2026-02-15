'use client';

import type { CalendarEvent } from '@/lib/types';
import { CollapsibleSection } from '@/shared/components/CollapsibleSection';
import { formatEventTime, formatDuration } from '../utils';

interface CalendarSectionProps {
  events: CalendarEvent[];
  collapsed: boolean;
  onToggle: () => void;
}

export function CalendarSection({ events, collapsed, onToggle }: CalendarSectionProps) {
  if (events.length === 0) return null;

  return (
    <CollapsibleSection title="Schedule" count={events.length} collapsed={collapsed} onToggle={onToggle} className="mb-4">
      <div className="space-y-2">
        {events.map((event) => (
          <a
            key={event.id}
            href={event.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 py-1 group"
          >
            <span className="text-xs text-[var(--text-muted)] w-16 shrink-0 tabular-nums">
              {formatEventTime(event)}
            </span>
            <span className="text-sm text-[var(--text-primary)] truncate group-hover:text-[var(--accent-cyan)] transition-colors">
              {event.summary}
            </span>
            {formatDuration(event) && (
              <span className="text-xs text-[var(--text-muted)]/60 shrink-0 ml-auto">
                {formatDuration(event)}
              </span>
            )}
          </a>
        ))}
      </div>
    </CollapsibleSection>
  );
}
