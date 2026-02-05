// Database types
export type Category = 'People' | 'Project' | 'Idea' | 'Admin';

export type AdminStatus = 'Todo' | 'Done';
export type ProjectStatus = 'Not Started' | 'Active' | 'Waiting' | 'Complete';
export type PeopleStatus = 'New' | 'Active' | 'Dormant';
export type Priority = 'High' | 'Medium' | 'Low';
export type IdeaMaturity = 'Spark' | 'Developing' | 'Actionable';

// API Response types
export interface CaptureResponse {
  status: 'captured' | 'needs_clarification' | 'error';
  category?: Category;
  confidence?: number;
  page_id?: string;
  needs_clarification?: boolean;
  entry?: Record<string, unknown>;
  error?: string;
}

export interface UpdateResponse {
  status: 'updated' | 'error';
  page_id?: string;
  updates_applied?: string[];
  error?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  category: Category;
  status?: string;
  created: string;
  lastEdited: string;
  snippet?: string;
}

export interface SearchResponse {
  status: 'success' | 'error';
  query: string;
  total: number;
  summary?: string;
  results: SearchResult[];
  grouped: {
    People: number;
    Project: number;
    Idea: number;
    Admin: number;
  };
  error?: string;
}

// Simplified Entry type from API (n8n returns this format)
export interface Entry {
  id: string;
  title: string;
  status: string;
  priority?: string;
  due_date?: string;
  created?: string;
  url?: string;
}

// Detailed Entry types (for future use with direct Notion access)
export interface BaseEntry {
  id: string;
  created_time: string;
  last_edited_time: string;
}

export interface AdminEntry extends BaseEntry {
  type: 'Admin';
  task: string;
  due_date?: string;
  priority: Priority;
  category: string;
  status: AdminStatus;
  notes?: string;
}

export interface ProjectEntry extends BaseEntry {
  type: 'Project';
  name: string;
  next_action?: string;
  status: ProjectStatus;
  due_date?: string;
  priority: Priority;
  area: string;
  notes?: string;
}

export interface PeopleEntry extends BaseEntry {
  type: 'People';
  name: string;
  company?: string;
  role?: string;
  context?: string;
  last_contact?: string;
  next_followup?: string;
  status: PeopleStatus;
}

export interface IdeaEntry extends BaseEntry {
  type: 'Idea';
  title: string;
  raw_insight?: string;
  one_liner?: string;
  source?: string;
  category: string;
  maturity: IdeaMaturity;
}

export type DetailedEntry = AdminEntry | ProjectEntry | PeopleEntry | IdeaEntry;

// UI State types
export interface ConfirmationState {
  show: boolean;
  text: string;
  category: Category;
  confidence: number;
  page_id?: string;
}

// Snooze options
export type SnoozeOption = 'later_today' | 'tomorrow' | 'weekend' | 'next_week' | 'custom';

export interface SnoozePreset {
  label: string;
  value: SnoozeOption;
  getDate: () => Date;
}

// Agent response type
export interface AgentResponse {
  status: 'success' | 'error';
  response: string;
  session_id?: string;
  channel?: string;
  tools_used?: string[];
  timestamp?: string;
  error?: string;
}

export const SNOOZE_PRESETS: SnoozePreset[] = [
  {
    label: 'Later Today',
    value: 'later_today',
    getDate: () => {
      const date = new Date();
      date.setHours(date.getHours() + 4);
      return date;
    },
  },
  {
    label: 'Tomorrow',
    value: 'tomorrow',
    getDate: () => {
      const date = new Date();
      date.setDate(date.getDate() + 1);
      date.setHours(9, 0, 0, 0);
      return date;
    },
  },
  {
    label: 'This Weekend',
    value: 'weekend',
    getDate: () => {
      const date = new Date();
      const day = date.getDay();
      const daysUntilSaturday = (6 - day + 7) % 7 || 7;
      date.setDate(date.getDate() + daysUntilSaturday);
      date.setHours(10, 0, 0, 0);
      return date;
    },
  },
  {
    label: 'Next Week',
    value: 'next_week',
    getDate: () => {
      const date = new Date();
      date.setDate(date.getDate() + 7);
      date.setHours(9, 0, 0, 0);
      return date;
    },
  },
];
