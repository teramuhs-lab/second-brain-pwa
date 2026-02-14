// Shared OpenAI tool schemas for agent and research-agent
// Both agents import from here instead of defining locally

import OpenAI from 'openai';

// ============= Individual Tool Schemas =============

export const searchBrainTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search_brain',
    description: `Search the user's Second Brain (Notion databases) for items matching a topic, keyword, or name. Use for People, Projects, Ideas, and Tasks stored in Notion. Do NOT use for calendar, schedule, meetings, or email queries — use read_calendar or search_emails instead.`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term, topic, or keyword to look for',
        },
        categories: {
          type: 'array',
          items: { type: 'string', enum: ['People', 'Projects', 'Ideas', 'Admin'] },
          description: 'Limit search to specific categories. Omit to search all.',
        },
      },
      required: ['query'],
    },
  },
};

export const getItemDetailsTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_item_details',
    description: 'Get full details of a specific item by its ID. Use when more context is needed about a search result.',
    parameters: {
      type: 'object',
      properties: {
        item_id: {
          type: 'string',
          description: 'The Notion page ID',
        },
      },
      required: ['item_id'],
    },
  },
};

export const createTaskTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'create_task',
    description: 'Create a new task in the Second Brain. Use when the user wants to add a new task or reminder.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The task title/description',
        },
        priority: {
          type: 'string',
          enum: ['High', 'Medium', 'Low'],
          description: 'Task priority level',
        },
        due_date: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format',
        },
      },
      required: ['title'],
    },
  },
};

export const saveIdeaTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'save_idea',
    description: 'Save an insight, note, or finding as a new Idea in the Second Brain.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'A short title for the idea',
        },
        insight: {
          type: 'string',
          description: 'The full insight or note content',
        },
        category: {
          type: 'string',
          enum: ['Business', 'Tech', 'Life', 'Creative'],
          description: 'Category for the idea',
        },
      },
      required: ['title', 'insight'],
    },
  },
};

export const readCalendarTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'read_calendar',
    description: `Read Google Calendar events. Use when user asks about schedule, meetings, availability, or "what's on my calendar".`,
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'tomorrow', 'this_week'],
          description: 'Time period to fetch events for',
        },
      },
      required: ['period'],
    },
  },
};

export const createCalendarEventTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'create_calendar_event',
    description: 'Create a new Google Calendar event. Always check availability with read_calendar first.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event title/name' },
        start: { type: 'string', description: 'Start datetime in ISO format (e.g. "2026-02-11T14:00:00")' },
        end: { type: 'string', description: 'End datetime in ISO format (e.g. "2026-02-11T15:00:00")' },
        description: { type: 'string', description: 'Event description (optional)' },
        location: { type: 'string', description: 'Event location (optional)' },
      },
      required: ['summary', 'start', 'end'],
    },
  },
};

export const deleteCalendarEventTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'delete_calendar_event',
    description: 'Delete/remove a Google Calendar event by its ID. Use read_calendar first to find the event ID. If the event includes a cal: prefix (e.g. [id:abc|cal:xyz]), pass both the event_id and calendar_id.',
    parameters: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'The Google Calendar event ID to delete' },
        calendar_id: { type: 'string', description: 'The calendar ID the event belongs to (optional, defaults to primary)' },
      },
      required: ['event_id'],
    },
  },
};

export const searchEmailsTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search_emails',
    description: 'Search Gmail for emails. Use when user asks about emails, messages, or communication.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query (e.g., "from:sarah", "subject:proposal", "newer_than:3d")' },
        max_results: { type: 'number', description: 'Max emails to return (default 5)' },
      },
      required: ['query'],
    },
  },
};

export const getEmailTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_email',
    description: 'Get full content of a specific email by ID. Use after search_emails when user wants to read an email.',
    parameters: {
      type: 'object',
      properties: {
        email_id: { type: 'string', description: 'The Gmail message ID' },
      },
      required: ['email_id'],
    },
  },
};

export const searchWebTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search_web',
    description: `Search the web for external information. Use when Second Brain lacks relevant info, the question requires current/external knowledge, or you need to verify or expand on brain results.`,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Web search query' },
        focus: {
          type: 'string',
          enum: ['general', 'news', 'technical', 'research'],
          description: 'Type of search - affects query optimization',
        },
      },
      required: ['query'],
    },
  },
};

export const finalizeResearchTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'finalize_research',
    description: `Call this when you have gathered enough information to answer the question. ALWAYS call this before providing your final answer.`,
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of what you found' },
        ready_to_answer: { type: 'boolean', description: 'True if you have enough info, false if you need more research' },
        missing_info: { type: 'string', description: 'What additional info is needed (if ready_to_answer is false)' },
      },
      required: ['summary', 'ready_to_answer'],
    },
  },
};

// ============= Pre-composed Tool Arrays =============

/** Tools for the Ask agent (simple chat with Notion + Google + Web) */
export const agentTools: OpenAI.ChatCompletionTool[] = [
  searchBrainTool,
  getItemDetailsTool,
  createTaskTool,
  saveIdeaTool,
  readCalendarTool,
  createCalendarEventTool,
  deleteCalendarEventTool,
  searchEmailsTool,
  getEmailTool,
  searchWebTool,
];

/** Tools for the Research agent (ReAct loop with web search + citations) */
export const researchAgentTools: OpenAI.ChatCompletionTool[] = [
  searchBrainTool,
  searchWebTool,
  getItemDetailsTool,
  finalizeResearchTool,
  readCalendarTool,
  createCalendarEventTool,
  searchEmailsTool,
  getEmailTool,
  deleteCalendarEventTool,
];
