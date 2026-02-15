import { z } from 'zod';

export const captureSchema = z.object({
  text: z.string().min(1, 'Text is required').max(5000, 'Text too long (max 5000 chars)'),
  reminderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Invalid date format').optional(),
});

export const updateSchema = z.object({
  page_id: z.string().min(1, 'Entry ID is required'),
  database: z.string().min(1),
  updates: z.record(z.string(), z.unknown()).refine(
    obj => Object.keys(obj).length > 0,
    { message: 'Updates cannot be empty' }
  ),
});

export const deleteSchema = z.object({
  page_id: z.string().min(1, 'Entry ID is required'),
});

export const searchSchema = z.object({
  query: z.string().min(1, 'Query is required').max(500, 'Query too long (max 500 chars)'),
  summarize: z.boolean().optional(),
});

export const recategorizeSchema = z.object({
  page_id: z.string().min(1, 'Entry ID is required'),
  current_category: z.string().optional(),
  new_category: z.enum(['People', 'Project', 'Idea', 'Admin', 'Reading'], {
    error: 'Category must be People, Project, Idea, Admin, or Reading',
  }),
  raw_text: z.string().min(1, 'Raw text is required'),
});

export const agentSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long (max 2000 chars)'),
  session_id: z.string().max(100).optional(),
});

export const saveResearchSchema = z.object({
  question: z.string().min(1, 'Question is required').max(500),
  answer: z.string().min(1, 'Answer is required').max(10000),
  category: z.enum(['Idea', 'Admin', 'Reading']),
  citations: z.array(z.object({
    title: z.string(),
    type: z.string(),
    url: z.string().optional(),
    database: z.string().optional(),
  })).optional(),
  expertDomain: z.string().max(100).optional(),
});

export const processUrlSchema = z.object({
  url: z.string().url('Invalid URL format'),
});

export const saveReadingSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  url: z.string().url('Invalid URL format'),
  oneLiner: z.string().max(500).optional(),
  tldr: z.string().max(5000).optional(),
  category: z.string().max(50).optional(),
  structuredSummary: z.record(z.string(), z.unknown()).optional(),
});

export const sendEmailSchema = z.object({
  articles: z.array(z.object({
    title: z.string().min(1).max(300),
    url: z.string().url(),
    one_liner: z.string().max(500),
    full_summary: z.string().max(5000),
    key_points: z.array(z.string().max(500)).max(20),
    category: z.string().max(50),
    readTime: z.string().max(20).optional(),
  })).min(1, 'At least one article is required').max(50),
  subject: z.string().max(200).optional(),
});

export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: z.object({
    message_id: z.number(),
    chat: z.object({ id: z.number() }),
    text: z.string().max(10000).optional(),
  }).optional(),
  callback_query: z.object({
    id: z.string(),
    data: z.string().max(500).optional(),
  }).optional(),
});

/** Helper to validate and return typed result or error response */
export function validate<T>(schema: z.ZodType<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.issues[0].message };
}
