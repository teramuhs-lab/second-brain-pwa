import type { YesterboxCategory } from '@/lib/types';

export const YESTERBOX_STYLES: Record<string, { text: string; bg: string; label: string }> = {
  'Urgent & High-Priority': { text: 'text-red-400', bg: 'bg-red-900/20', label: 'URGENT' },
  'Deadline-Driven': { text: 'text-amber-400', bg: 'bg-amber-900/20', label: 'DEADLINE' },
  'Routine Updates': { text: 'text-blue-400', bg: 'bg-blue-900/20', label: 'ROUTINE' },
  'Non-Urgent Informational': { text: 'text-[var(--text-muted)]', bg: 'bg-[var(--bg-surface)]', label: 'INFO' },
  'Personal & Social': { text: 'text-purple-400', bg: 'bg-purple-900/20', label: 'PERSONAL' },
  'Spam/Unimportant': { text: 'text-[var(--text-muted)]/40', bg: 'bg-[var(--bg-surface)]', label: 'SPAM' },
};

export const YESTERBOX_PRIORITY: YesterboxCategory[] = [
  'Urgent & High-Priority',
  'Deadline-Driven',
  'Routine Updates',
  'Non-Urgent Informational',
  'Personal & Social',
  'Spam/Unimportant',
];
