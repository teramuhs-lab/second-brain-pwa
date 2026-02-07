// Centralized constants - Single source of truth
// All DATABASE_IDS and configuration previously duplicated across 5+ files

export const DATABASE_IDS = {
  People: '2f092129-b3db-81b4-b767-fed1e3190303',
  Projects: '2f092129-b3db-81fd-aef1-e62b4f3445ff',
  Ideas: '2f092129-b3db-8121-b140-f7a8f4ec2a45',
  Admin: '2f092129-b3db-8171-ae6c-f98e8124574c',
  InboxLog: '2f092129-b3db-8104-a9ca-fc123e5be4a3',
} as const;

export type DatabaseKey = keyof typeof DATABASE_IDS;

// Chat sessions database (optional, configured via env)
export const CHAT_SESSIONS_DB_ID = process.env.NOTION_CHAT_SESSIONS_DB_ID || '';

// Map lowercase category names to database keys
export const CATEGORY_TO_DB: Record<string, DatabaseKey> = {
  people: 'People',
  projects: 'Projects',
  ideas: 'Ideas',
  admin: 'Admin',
  tasks: 'Admin', // tasks are stored in Admin database
} as const;

// Reverse mapping: database key to category name
export const DB_TO_CATEGORY: Record<DatabaseKey, string> = {
  People: 'People',
  Projects: 'Project',
  Ideas: 'Idea',
  Admin: 'Admin',
  InboxLog: 'InboxLog',
} as const;

// n8n webhook base URL
export const N8N_BASE_URL = process.env.NEXT_PUBLIC_N8N_URL || 'https://n8n.srv1236227.hstgr.cloud';

// API endpoints for n8n webhooks
export const N8N_ENDPOINTS = {
  capture: `${N8N_BASE_URL}/webhook/sb-pwa-v1`,
  fix: `${N8N_BASE_URL}/webhook/sb-pwa-fix`,
  update: `${N8N_BASE_URL}/webhook/sb-pwa-update`,
  fetch: `${N8N_BASE_URL}/webhook/sb-pwa-fetch`,
} as const;
