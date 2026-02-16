import type { Category, Entry } from '@/lib/types';

export interface StaleItem {
  id: string;
  title: string;
  category: string;
  status?: string;
  maturity?: string;
  rawInsight?: string;
  notes?: string;
  daysSinceEdit: number;
  lastEdited: string;
}

export interface DueTodayItem {
  id: string;
  title: string;
  category: string;
  time?: string;
}

export interface EmailPulse {
  totalEmails: number;
  urgentCount: number;
  deadlineCount: number;
  topSenders: { name: string; count: number }[];
  googleConnected: boolean;
}

export interface InsightsData {
  status: string;
  staleItems: StaleItem[];
  dueToday: DueTodayItem[];
  weeklyStats: {
    totalCaptures: number;
    byCategory: Record<string, number>;
    completedTasks: number;
    newIdeas: number;
  };
  aiInsights: string | null;
  emailPulse?: EmailPulse | null;
}

// Map plural category names (from API) to singular (for recategorize)
export const CATEGORY_SINGULAR: Record<string, Category> = {
  People: 'People',
  Projects: 'Project',
  Ideas: 'Idea',
  Admin: 'Admin',
};

// Map category to database name for API calls
export const CATEGORY_TO_DB: Record<string, string> = {
  People: 'people',
  Projects: 'projects',
  Ideas: 'ideas',
  Admin: 'admin',
};
