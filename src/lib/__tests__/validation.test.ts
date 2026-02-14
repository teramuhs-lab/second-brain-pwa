import { describe, it, expect } from 'vitest';
import {
  validate,
  captureSchema,
  updateSchema,
  deleteSchema,
  searchSchema,
  recategorizeSchema,
  agentSchema,
  saveResearchSchema,
  processUrlSchema,
} from '../validation';

describe('captureSchema', () => {
  it('accepts valid input', () => {
    const result = validate(captureSchema, { text: 'Buy groceries' });
    expect(result.success).toBe(true);
  });

  it('accepts input with reminderDate', () => {
    const result = validate(captureSchema, { text: 'Call dentist', reminderDate: '2025-03-15' });
    expect(result.success).toBe(true);
  });

  it('rejects empty text', () => {
    const result = validate(captureSchema, { text: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing text', () => {
    const result = validate(captureSchema, {});
    expect(result.success).toBe(false);
  });

  it('rejects text over 5000 chars', () => {
    const result = validate(captureSchema, { text: 'x'.repeat(5001) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid reminder date format', () => {
    const result = validate(captureSchema, { text: 'test', reminderDate: 'not-a-date' });
    expect(result.success).toBe(false);
  });
});

describe('updateSchema', () => {
  it('accepts valid input', () => {
    const result = validate(updateSchema, {
      page_id: 'abc123',
      database: 'admin',
      updates: { status: 'Done' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty updates', () => {
    const result = validate(updateSchema, {
      page_id: 'abc123',
      database: 'admin',
      updates: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing page_id', () => {
    const result = validate(updateSchema, { database: 'admin', updates: { status: 'Done' } });
    expect(result.success).toBe(false);
  });
});

describe('deleteSchema', () => {
  it('accepts valid ID', () => {
    const result = validate(deleteSchema, { page_id: 'abc-123' });
    expect(result.success).toBe(true);
  });

  it('rejects empty ID', () => {
    const result = validate(deleteSchema, { page_id: '' });
    expect(result.success).toBe(false);
  });
});

describe('searchSchema', () => {
  it('accepts valid query', () => {
    const result = validate(searchSchema, { query: 'find my tasks' });
    expect(result.success).toBe(true);
  });

  it('accepts query with summarize flag', () => {
    const result = validate(searchSchema, { query: 'projects', summarize: false });
    expect(result.success).toBe(true);
  });

  it('rejects empty query', () => {
    const result = validate(searchSchema, { query: '' });
    expect(result.success).toBe(false);
  });

  it('rejects query over 500 chars', () => {
    const result = validate(searchSchema, { query: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });
});

describe('recategorizeSchema', () => {
  it('accepts valid recategorize', () => {
    const result = validate(recategorizeSchema, {
      page_id: 'abc',
      new_category: 'Admin',
      raw_text: 'Buy milk',
    });
    expect(result.success).toBe(true);
  });

  it('accepts with current_category', () => {
    const result = validate(recategorizeSchema, {
      page_id: 'abc',
      current_category: 'Idea',
      new_category: 'Project',
      raw_text: 'Build app',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid category', () => {
    const result = validate(recategorizeSchema, {
      page_id: 'abc',
      new_category: 'Unknown',
      raw_text: 'test',
    });
    expect(result.success).toBe(false);
  });
});

describe('agentSchema', () => {
  it('accepts valid message', () => {
    const result = validate(agentSchema, { message: 'What are my tasks?' });
    expect(result.success).toBe(true);
  });

  it('rejects empty message', () => {
    const result = validate(agentSchema, { message: '' });
    expect(result.success).toBe(false);
  });

  it('rejects message over 2000 chars', () => {
    const result = validate(agentSchema, { message: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });
});

describe('saveResearchSchema', () => {
  it('accepts valid research', () => {
    const result = validate(saveResearchSchema, {
      question: 'What is RAG?',
      answer: 'Retrieval Augmented Generation is...',
      category: 'Idea',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid category', () => {
    const result = validate(saveResearchSchema, {
      question: 'test',
      answer: 'test',
      category: 'People',
    });
    expect(result.success).toBe(false);
  });
});

describe('processUrlSchema', () => {
  it('accepts valid URL', () => {
    const result = validate(processUrlSchema, { url: 'https://example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid URL', () => {
    const result = validate(processUrlSchema, { url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects empty URL', () => {
    const result = validate(processUrlSchema, { url: '' });
    expect(result.success).toBe(false);
  });
});
