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
  priority?: string;
  dueDate?: string;
  created: string;
  lastEdited: string;
  snippet?: string;
  relevanceScore?: number;
  relatedTo?: string[];
  source?: string;
}

export interface ParsedQueryFilters {
  categories?: string[];
  statuses?: string[];
  dateRange?: { start?: string; end?: string };
  priority?: string[];
  hasRelation?: string;
}

export interface ParsedQuery {
  searchTerms: string[];
  intent: 'search' | 'question' | 'action' | 'filter';
  filters: ParsedQueryFilters;
}

export interface SearchResponse {
  status: 'success' | 'error';
  query: string;
  parsedQuery?: ParsedQuery;
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

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  icon?: string;
  createdAt: string;
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
  notes?: string;
  // People-specific fields
  context?: string;
  company?: string;
  role?: string;
  // Ideas-specific fields
  one_liner?: string;
  maturity?: string;
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
  notes?: string;
}

export interface IdeaEntry extends BaseEntry {
  type: 'Idea';
  title: string;
  raw_insight?: string;
  one_liner?: string;
  source?: string;
  category: string;
  maturity: IdeaMaturity;
  notes?: string;
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

// Digest types
export interface DigestItem {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  nextAction?: string;
  company?: string;
  category?: string;
}

export interface DailyDigestResponse {
  status: 'success' | 'error';
  type: 'daily';
  generatedAt: string;
  data: {
    projects: DigestItem[];
    tasks: DigestItem[];
    followups: DigestItem[];
  };
  counts: {
    projects: number;
    tasks: number;
    followups: number;
  };
  aiSummary: string;
  error?: string;
}

export interface WeeklyDigestResponse {
  status: 'success' | 'error';
  type: 'weekly';
  generatedAt: string;
  data: {
    completedTasks: DigestItem[];
    completedProjects: DigestItem[];
    inboxByCategory: Record<string, DigestItem[]>;
  };
  counts: {
    completedTasks: number;
    completedProjects: number;
    totalInbox: number;
  };
  aiSummary: string;
  error?: string;
}

export type DigestResponse = DailyDigestResponse | WeeklyDigestResponse;

// URL Processing types
export type UrlType = 'youtube' | 'twitter' | 'article' | 'generic';
export type Complexity = 'Beginner' | 'Intermediate' | 'Advanced';

// Main idea structure with details
export interface MainIdea {
  title: string;
  explanation: string;
  details?: string[];
}

// Framework/model structure
export interface Framework {
  name: string;
  description: string;
  steps?: string[];
}

// Definition structure
export interface Definition {
  term: string;
  definition: string;
}

// Timestamp structure (for videos)
export interface Timestamp {
  time: string;
  topic: string;
}

// Ultra-detailed summary result
export interface UrlProcessResult {
  status: 'success' | 'error';
  url: string;
  urlType: UrlType;
  title: string;
  author?: string;
  readTime?: string;
  page_id?: string;
  error?: string;
  // Core summary
  one_liner: string;
  tldr?: string;
  full_summary?: string;
  // Detailed analysis
  main_ideas?: MainIdea[];
  key_takeaways?: string[];
  notable_quotes?: string[];
  statistics_and_data?: string[];
  examples_and_cases?: string[];
  frameworks_and_models?: Framework[];
  tools_and_resources?: string[];
  definitions?: Definition[];
  // Action-oriented
  action_items?: string[];
  questions_to_consider?: string[];
  related_topics?: string[];
  // Video-specific
  timestamps?: Timestamp[];
  // Metadata
  category: string;
  complexity?: Complexity;
  content_type?: string;
  // Legacy fields for backwards compatibility
  key_points?: string[];
}

// Structured summary for rich rendering
export interface StructuredSummary {
  tldr?: string;
  full_summary?: string;
  main_ideas?: MainIdea[];
  key_takeaways?: string[];
  statistics_and_data?: string[];
  examples_and_cases?: string[];
  frameworks_and_models?: Framework[];
  tools_and_resources?: string[];
  definitions?: Definition[];
  notable_quotes?: string[];
  action_items?: string[];
  questions_to_consider?: string[];
  related_topics?: string[];
  timestamps?: Timestamp[];
  complexity?: Complexity;
  category?: string;
  content_type?: string;
}

// Reading page - Idea with source
export interface ReadingItem {
  id: string;
  title: string;
  one_liner: string;
  raw_insight: string;
  source: string;
  category: string;
  maturity: string;
  created_time: string;
  last_edited_time: string;
  // Structured summary for rich rendering (fetched from page blocks)
  structured_summary?: StructuredSummary;
}

// Research Agent types
export type ExpertDomain = 'tech' | 'business' | 'investment' | 'personal' | 'research';

export interface ResearchCitation {
  number: number;
  type: 'notion' | 'web';
  id?: string;
  url?: string;
  title: string;
  snippet?: string;
  database?: string;
}

export interface ResearchStep {
  type: 'thinking' | 'tool_call' | 'observation' | 'decision';
  content: string;
  tool?: string;
}

export interface ResearchAgentResponse {
  status: 'success' | 'error';
  response: string;
  citations: ResearchCitation[];
  research_steps: ResearchStep[];
  expert_domain: ExpertDomain;
  tools_used: string[];
  iterations: number;
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
