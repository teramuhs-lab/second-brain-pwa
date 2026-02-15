import { ReactNode, createElement } from 'react';
import type { CalendarEvent } from '@/lib/types';

export function formatInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) {
    return [text];
  }
  return parts.map((part, j) =>
    j % 2 === 1
      ? createElement('strong', { key: j, className: 'font-semibold text-[var(--text-primary)]' }, part)
      : createElement('span', { key: j }, part)
  );
}

export function formatEventTime(event: CalendarEvent): string {
  if (event.start.date) return 'All day';
  if (!event.start.dateTime) return '';
  return new Date(event.start.dateTime).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDuration(event: CalendarEvent): string | null {
  if (!event.start.dateTime || !event.end.dateTime) return null;
  const mins = (new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime()) / 60000;
  if (mins < 60) return `${mins}m`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
