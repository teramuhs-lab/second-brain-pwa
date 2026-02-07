// Category and status definitions
// Previously hardcoded in multiple components and API routes

import type { DatabaseKey } from './constants';

// Status options per database
export const STATUS_OPTIONS: Record<string, readonly string[]> = {
  Admin: ['Todo', 'Done'],
  Projects: ['Not Started', 'Active', 'Waiting', 'Complete'],
  People: ['New', 'Active', 'Dormant'],
  Ideas: ['Spark', 'Developing', 'Actionable'],
} as const;

// Priority options (shared across databases)
export const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'] as const;
export type Priority = (typeof PRIORITY_OPTIONS)[number];

// Idea categories
export const IDEA_CATEGORIES = ['Business', 'Tech', 'Life', 'Creative'] as const;
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];

// Idea maturity levels
export const IDEA_MATURITY = ['Spark', 'Developing', 'Actionable'] as const;
export type IdeaMaturity = (typeof IDEA_MATURITY)[number];

// Admin task categories
export const ADMIN_CATEGORIES = ['Finance', 'Health', 'Home', 'Travel'] as const;
export type AdminCategory = (typeof ADMIN_CATEGORIES)[number];

// Project areas
export const PROJECT_AREAS = ['Work', 'Personal', 'Side-project'] as const;
export type ProjectArea = (typeof PROJECT_AREAS)[number];

// Inbox log statuses
export const INBOX_LOG_STATUS = ['Processed', 'Needs Review', 'Fixed', 'Ignored'] as const;
export type InboxLogStatus = (typeof INBOX_LOG_STATUS)[number];

// Get status options for a database
export function getStatusOptions(database: DatabaseKey | string): readonly string[] {
  return STATUS_OPTIONS[database] || [];
}

// Check if a status is valid for a database
export function isValidStatus(database: DatabaseKey | string, status: string): boolean {
  const options = getStatusOptions(database);
  return options.includes(status);
}

// Get the "done" status for a database
export function getDoneStatus(database: DatabaseKey | string): string {
  switch (database) {
    case 'Projects':
      return 'Complete';
    case 'People':
      return 'Dormant';
    default:
      return 'Done';
  }
}
