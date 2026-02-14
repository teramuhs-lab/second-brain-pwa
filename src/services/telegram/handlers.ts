// Telegram command and message handlers
// Routes incoming messages to the appropriate brain API

import { sendMessage, sendMarkdown, answerCallbackQuery } from './client';
import { createEntry, createInboxLogEntry } from '@/services/db/entries';
import { searchEntries } from '@/services/db/entries';
import { suggestRelations, addRelation } from '@/services/db/relations';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { chatSessions } from '@/db/schema';
import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ALLOWED_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Telegram update types
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: CallbackQuery;
}

interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name: string };
  chat: { id: number; type: string };
  date: number;
  text?: string;
  entities?: MessageEntity[];
}

interface MessageEntity {
  type: 'bot_command' | 'url' | 'mention' | string;
  offset: number;
  length: number;
}

interface CallbackQuery {
  id: string;
  from: { id: number };
  message?: TelegramMessage;
  data?: string;
}

// Check if the chat is authorized
function isAuthorized(chatId: number): boolean {
  if (!ALLOWED_CHAT_ID) return true; // If not set, allow all (dev mode)
  return String(chatId) === ALLOWED_CHAT_ID;
}

// Main entry point for processing updates
export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  if (!update.message?.text) return;

  const { chat, text } = update.message;

  if (!isAuthorized(chat.id)) {
    await sendMessage(chat.id, 'Unauthorized. This bot is private.');
    return;
  }

  // Check for commands
  const command = extractCommand(text);
  if (command) {
    switch (command.name) {
      case 'capture':
        await handleCapture(chat.id, command.args);
        return;
      case 'ask':
        await handleAsk(chat.id, command.args);
        return;
      case 'search':
        await handleSearch(chat.id, command.args);
        return;
      case 'digest':
        await handleDigest(chat.id, command.args || 'daily');
        return;
      case 'clear':
        await handleClear(chat.id);
        return;
      case 'start':
      case 'help':
        await handleHelp(chat.id);
        return;
    }
  }

  // Check if text is a URL
  const urlEntity = update.message.entities?.find(e => e.type === 'url');
  if (urlEntity) {
    const url = text.slice(urlEntity.offset, urlEntity.offset + urlEntity.length);
    await handleUrl(chat.id, url);
    return;
  }

  // Default: treat plain text as a capture
  await handleCapture(chat.id, text);
}

function extractCommand(text: string): { name: string; args: string } | null {
  const match = text.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return { name: match[1], args: (match[2] || '').trim() };
}

// ============= Command Handlers =============

async function handleCapture(chatId: number, text: string): Promise<void> {
  if (!text || text.length < 3) {
    await sendMessage(chatId, 'Please provide at least 3 characters to capture.');
    return;
  }

  await sendMessage(chatId, 'Capturing...');

  try {
    // Classify with AI
    const classification = await classifyText(text);
    const { category, confidence, extracted_data } = classification;

    const entryTitle = extracted_data.name || extracted_data.title || extracted_data.task || text.slice(0, 100);
    const content: Record<string, unknown> = {};

    if (category === 'Admin') {
      content.adminCategory = 'Home';
    } else if (category === 'Project') {
      content.area = 'Work';
      if (extracted_data.next_action) content.nextAction = extracted_data.next_action;
    } else if (category === 'Idea') {
      content.ideaCategory = 'Life';
      if (extracted_data.raw_insight) content.rawInsight = extracted_data.raw_insight;
    } else if (category === 'People') {
      content.lastContact = new Date().toISOString().split('T')[0];
      if (extracted_data.company) content.company = extracted_data.company;
      if (extracted_data.context) content.context = extracted_data.context;
    }

    const newEntry = await createEntry({
      category,
      title: entryTitle,
      priority: category === 'Admin' ? (extracted_data.priority || 'Medium') : (category === 'Project' ? 'Medium' : undefined),
      content,
    });

    // Log to inbox
    try {
      await createInboxLogEntry({
        rawInput: text,
        category,
        confidence,
        destinationId: newEntry.id,
        status: 'Processed',
      });
    } catch { /* non-critical */ }

    // Auto-relations (best-effort)
    try {
      const suggestions = await suggestRelations(newEntry.id, { limit: 3, threshold: 0.8 });
      for (const s of suggestions) {
        await addRelation(newEntry.id, s.id, 'related_to');
      }
    } catch { /* non-critical */ }

    // Build response with recategorize buttons
    const emoji = { People: '👤', Project: '📋', Idea: '💡', Admin: '✅' }[category] || '📝';
    const confPct = Math.round(confidence * 100);

    await sendMessage(chatId, `${emoji} Captured as *${category}*\n\n"${entryTitle}"\n\nConfidence: ${confPct}%`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '👤 People', callback_data: `recat:${newEntry.id}:People` },
          { text: '📋 Project', callback_data: `recat:${newEntry.id}:Project` },
          { text: '💡 Idea', callback_data: `recat:${newEntry.id}:Idea` },
          { text: '✅ Admin', callback_data: `recat:${newEntry.id}:Admin` },
        ]],
      },
    });
  } catch (error) {
    console.error('Telegram capture error:', error);
    await sendMessage(chatId, 'Failed to capture. Please try again.');
  }
}

async function handleAsk(chatId: number, question: string): Promise<void> {
  if (!question) {
    await sendMessage(chatId, 'Usage: /ask <your question>');
    return;
  }

  await sendMessage(chatId, 'Thinking...');

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const sessionId = `telegram-${chatId}`;

    const res = await fetch(`${baseUrl}/api/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: question, session_id: sessionId }),
    });

    if (!res.ok) {
      await sendMessage(chatId, 'Agent returned an error. Try again later.');
      return;
    }

    const data = await res.json();
    await sendMarkdown(chatId, data.response || 'No response from agent.');
  } catch (error) {
    console.error('Telegram ask error:', error);
    await sendMessage(chatId, 'Failed to get answer. Please try again.');
  }
}

async function handleSearch(chatId: number, query: string): Promise<void> {
  if (!query) {
    await sendMessage(chatId, 'Usage: /search <query>');
    return;
  }

  try {
    const results = await searchEntries(query);

    if (results.length === 0) {
      await sendMessage(chatId, `No results for "${query}".`);
      return;
    }

    const categoryMap: Record<string, string> = {
      People: '👤', Projects: '📋', Ideas: '💡', Admin: '✅',
    };

    const lines = results.slice(0, 10).map((r, i) => {
      const emoji = categoryMap[r.category] || '📝';
      const status = r.status ? ` [${r.status}]` : '';
      return `${i + 1}. ${emoji} *${r.title}*${status}`;
    });

    const header = `Found ${results.length} result${results.length > 1 ? 's' : ''} for "${query}":\n\n`;
    await sendMessage(chatId, header + lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Telegram search error:', error);
    await sendMessage(chatId, 'Search failed. Please try again.');
  }
}

async function handleDigest(chatId: number, type: string): Promise<void> {
  try {
    await sendMessage(chatId, `Generating ${type} digest...`);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/digest?type=${type}`);

    if (!res.ok) {
      await sendMessage(chatId, 'Failed to generate digest.');
      return;
    }

    const data = await res.json();
    const { aiSummary, counts } = data;

    let header: string;
    if (type === 'weekly') {
      header = `📊 *Weekly Review*\n\n`;
    } else {
      const parts: string[] = [];
      if (counts?.projects > 0) parts.push(`${counts.projects} projects`);
      if (counts?.tasks > 0) parts.push(`${counts.tasks} tasks`);
      if (counts?.followups > 0) parts.push(`${counts.followups} follow-ups`);
      header = `☀️ *Daily Briefing*${parts.length > 0 ? ` (${parts.join(', ')})` : ''}\n\n`;
    }

    await sendMarkdown(chatId, header + (aiSummary || 'No data for this period.'));
  } catch (error) {
    console.error('Telegram digest error:', error);
    await sendMessage(chatId, 'Digest failed. Please try again.');
  }
}

async function handleUrl(chatId: number, url: string): Promise<void> {
  await sendMessage(chatId, 'Processing URL...');

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/process-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      await sendMessage(chatId, 'Failed to process URL.');
      return;
    }

    const data = await res.json();

    if (data.status === 'error') {
      await sendMessage(chatId, `Error: ${data.error}`);
      return;
    }

    const lines = [
      `💡 *${data.title || 'Untitled'}*`,
      '',
      data.one_liner || '',
      '',
      data.full_summary ? data.full_summary.slice(0, 500) : '',
    ];

    if (data.key_points?.length > 0) {
      lines.push('', '*Key points:*');
      data.key_points.slice(0, 5).forEach((p: string) => {
        lines.push(`• ${p}`);
      });
    }

    lines.push('', `Saved as *${data.category || 'Idea'}*`);

    await sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Telegram URL error:', error);
    await sendMessage(chatId, 'Failed to process URL. Please try again.');
  }
}

async function handleClear(chatId: number): Promise<void> {
  const sessionId = `telegram-${chatId}`;
  try {
    await db.delete(chatSessions).where(eq(chatSessions.sessionId, sessionId));
    await sendMessage(chatId, 'Conversation cleared.');
  } catch {
    await sendMessage(chatId, 'Failed to clear conversation.');
  }
}

async function handleHelp(chatId: number): Promise<void> {
  const help = [
    '*Second Brain Bot*',
    '',
    'Send any text to capture it to your brain.',
    '',
    '*Commands:*',
    '/capture <text> — Save a thought',
    '/ask <question> — Ask your brain',
    '/search <query> — Search entries',
    '/digest — Daily briefing',
    '/digest weekly — Weekly review',
    '/clear — Reset conversation',
    '/help — Show this message',
    '',
    'You can also send URLs to save and summarize them.',
  ];

  await sendMessage(chatId, help.join('\n'), { parse_mode: 'Markdown' });
}

// ============= Callback Query Handler =============

async function handleCallbackQuery(query: CallbackQuery): Promise<void> {
  if (!query.data || !query.message) return;

  const chatId = query.message.chat.id;
  if (!isAuthorized(chatId)) {
    await answerCallbackQuery(query.id, 'Unauthorized');
    return;
  }

  // Handle recategorize: "recat:<entryId>:<newCategory>"
  if (query.data.startsWith('recat:')) {
    const [, entryId, newCategory] = query.data.split(':');
    await answerCallbackQuery(query.id, `Moving to ${newCategory}...`);

    try {
      const { archiveEntry, createEntry: createNewEntry, getEntry } = await import('@/services/db/entries');
      const entry = await getEntry(entryId);
      if (!entry) {
        await sendMessage(chatId, 'Entry not found.');
        return;
      }

      // Archive old, create new in target category
      await archiveEntry(entryId);
      await createNewEntry({
        category: newCategory as 'People' | 'Project' | 'Idea' | 'Admin',
        title: entry.title,
        content: entry.content as Record<string, unknown>,
      });

      const emoji = { People: '👤', Project: '📋', Idea: '💡', Admin: '✅' }[newCategory] || '📝';
      await sendMessage(chatId, `${emoji} Moved to *${newCategory}*`, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Recategorize error:', error);
      await sendMessage(chatId, 'Failed to recategorize.');
    }
    return;
  }
}

// ============= AI Classification (same as capture route) =============

interface ClassificationResult {
  category: 'People' | 'Project' | 'Idea' | 'Admin';
  confidence: number;
  extracted_data: Record<string, string>;
  reasoning: string;
}

async function classifyText(text: string): Promise<ClassificationResult> {
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `You are a Second Brain classifier. Analyze the input and categorize it.

RULES:
1. People = names, contacts, networking, follow-ups, meetings with individuals
2. Projects = tasks with deliverables, multi-step work, deadlines
3. Ideas = insights, quotes, observations, "shower thoughts", learnings
4. Admin = errands, appointments, logistics, bills, personal tasks

OUTPUT STRICT JSON:
{
  "category": "People" | "Project" | "Idea" | "Admin",
  "confidence": 0.0-1.0,
  "extracted_data": { ... category-specific fields ... },
  "reasoning": "Brief explanation"
}

For People: {"name": "PersonName", "company": "", "context": "..."}
For Project: {"name": "ProjectTitle", "next_action": "..."}
For Idea: {"title": "IdeaTitle", "raw_insight": "..."}
For Admin: {"task": "TaskDescription", "priority": "Medium"}`,
      },
      { role: 'user', content: text },
    ],
  });

  const content = response.choices[0]?.message?.content || '';

  try {
    return JSON.parse(content);
  } catch {
    return {
      category: 'Admin',
      confidence: 0.5,
      extracted_data: { task: text },
      reasoning: 'Parse error, defaulting to Admin',
    };
  }
}
