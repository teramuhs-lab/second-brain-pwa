import OpenAI from 'openai';
import type { CalendarEvent } from '@/services/google/types';
import type { EmailDigestItem } from '@/lib/types';
import type { DigestItem } from './data';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function generateDailySummary(
  projects: DigestItem[],
  tasks: DigestItem[],
  followups: DigestItem[],
  calendarEvents: CalendarEvent[] = [],
  activitySummary?: Record<string, number>,
  emailDigest?: EmailDigestItem[],
): Promise<string> {
  if (!OPENAI_API_KEY) {
    return 'AI summary unavailable - OpenAI not configured';
  }

  const hasEmails = emailDigest && emailDigest.length > 0;
  if (projects.length === 0 && tasks.length === 0 && followups.length === 0 && calendarEvents.length === 0 && !hasEmails) {
    return 'All clear — no active projects, pending tasks, follow-ups, meetings, or emails from yesterday.';
  }

  let summary = '';

  // Activity context from past 24h
  if (activitySummary && Object.keys(activitySummary).length > 0) {
    summary += 'YESTERDAY\'S ACTIVITY:\n';
    for (const [action, count] of Object.entries(activitySummary)) {
      const label = action.replace('_', ' ');
      summary += `- ${count} ${label}${count > 1 ? 's' : ''}\n`;
    }
    summary += '\n';
  }

  if (calendarEvents.length > 0) {
    summary += 'CALENDAR TODAY:\n';
    calendarEvents.forEach((e) => {
      const time = e.start.dateTime
        ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : 'All day';
      summary += `- ${time} — ${e.summary}\n`;
    });
    summary += '\n';
  }

  if (projects.length > 0) {
    summary += 'ACTIVE PROJECTS:\n';
    projects.forEach((p) => {
      summary += `- ${p.title}: ${p.nextAction || 'No next action'}\n`;
    });
    summary += '\n';
  }

  if (tasks.length > 0) {
    summary += 'PENDING TASKS:\n';
    tasks.forEach((t) => {
      summary += `- ${t.title}${t.priority ? ' [' + t.priority + ']' : ''}\n`;
    });
    summary += '\n';
  }

  if (followups.length > 0) {
    summary += 'DUE FOLLOW-UPS:\n';
    followups.forEach((f) => {
      summary += `- ${f.title}${f.company ? ' (' + f.company + ')' : ''}\n`;
    });
    summary += '\n';
  }

  // Yesterbox: only include actionable email categories (1-3) in the AI prompt
  if (emailDigest && emailDigest.length > 0) {
    const actionableCategories = ['Urgent & High-Priority', 'Deadline-Driven', 'Routine Updates'];
    const actionableEmails = emailDigest.filter(e => actionableCategories.includes(e.yCategory));
    if (actionableEmails.length > 0) {
      summary += 'YESTERDAY\'S EMAILS (Yesterbox):\n';
      let currentCat = '';
      for (const e of actionableEmails.slice(0, 8)) {
        if (e.yCategory !== currentCat) {
          currentCat = e.yCategory;
          summary += `${currentCat}:\n`;
        }
        summary += `- ${e.senderName}: ${e.aiSummary}\n`;
      }
      summary += '\n';
    }
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.5,
    messages: [
      {
        role: 'system',
        content: `You are a professional executive assistant. Create a clean, scannable daily briefing. Use this exact format:

**Projects** (only if items exist)
• Project Name — Next action

**Tasks** (only if items exist)
• Task description [Priority]

**Follow-ups** (only if items exist)
• Person Name (Company)

**Email Actions** (only if urgent/deadline emails exist)
• Sender — What to do

Rules: No intro text. No headers for empty sections. No sign-off. Max 150 words. Use bullet points (•) not dashes. Do NOT list the schedule/calendar as a separate section — the calendar is already displayed in the UI. Instead, weave meeting context naturally into your suggestions. The email digest card already shows all emails — only mention emails that require action or connect to your projects/meetings.`,
      },
      { role: 'user', content: summary },
    ],
  });

  return completion.choices[0]?.message?.content || 'Unable to generate summary';
}

export async function generateWeeklySummary(
  completedTasks: DigestItem[],
  completedProjects: DigestItem[],
  inboxByCategory: Record<string, DigestItem[]>,
  totalInbox: number,
  weeklyActivity?: { summary: Record<string, number>; snoozedItems: Array<{ title: string; snoozeCount: number }>; mostActive: Array<{ title: string; category: string; actionCount: number }> }
): Promise<string> {
  if (!OPENAI_API_KEY) {
    return 'AI summary unavailable - OpenAI not configured';
  }

  const totalActivity = totalInbox + completedTasks.length + completedProjects.length;
  if (totalActivity === 0) {
    return 'No activity this week — no new entries captured and no items completed.';
  }

  let summary = `WEEK DATA (${totalInbox} new entries captured):\n\n`;

  // Activity summary for the week
  if (weeklyActivity?.summary && Object.keys(weeklyActivity.summary).length > 0) {
    summary += 'USER ACTIVITY THIS WEEK:\n';
    for (const [action, count] of Object.entries(weeklyActivity.summary)) {
      summary += `- ${count} ${action.replace('_', ' ')}${count > 1 ? 's' : ''}\n`;
    }
    summary += '\n';
  }

  // Frequently snoozed items (stuck items)
  if (weeklyActivity?.snoozedItems && weeklyActivity.snoozedItems.length > 0) {
    summary += 'FREQUENTLY SNOOZED (possibly stuck):\n';
    for (const item of weeklyActivity.snoozedItems) {
      summary += `- "${item.title}" — snoozed ${item.snoozeCount} times\n`;
    }
    summary += '\n';
  }

  // Most active entries
  if (weeklyActivity?.mostActive && weeklyActivity.mostActive.length > 0) {
    summary += 'MOST INTERACTED ENTRIES:\n';
    for (const item of weeklyActivity.mostActive) {
      summary += `- "${item.title}" (${item.category}) — ${item.actionCount} actions\n`;
    }
    summary += '\n';
  }

  if (completedTasks.length > 0 || completedProjects.length > 0) {
    summary += 'COMPLETED THIS WEEK:\n';
    if (completedTasks.length > 0) {
      const taskNames = completedTasks.slice(0, 5).map((t) => t.title);
      summary += `Tasks (${completedTasks.length}): ${taskNames.join(', ')}${completedTasks.length > 5 ? '...' : ''}\n`;
    }
    if (completedProjects.length > 0) {
      summary += `Projects (${completedProjects.length}): ${completedProjects.map((p) => p.title).join(', ')}\n`;
    }
    summary += '\n';
  }

  for (const [category, items] of Object.entries(inboxByCategory)) {
    if (items.length > 0) {
      summary += `${category.toUpperCase()} (${items.length}):\n`;
      items.forEach((item) => {
        summary += `• ${item.title}\n`;
      });
      summary += '\n';
    }
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content: `You are analyzing a personal knowledge management system. Create a detailed weekly review:

**Completed This Week**
• List tasks and projects that were finished (celebrate wins!)
• If nothing completed, skip this section entirely

**Patterns & Themes**
Analyze the new entries and identify:
• Recurring topics (what subjects keep coming up?)
• Key people mentioned (who appears multiple times?)
• Emerging priorities (what's demanding attention?)
Be specific - quote or reference actual content from the entries.

**Action Items**
Based on the patterns, suggest specific next steps:
• Follow-ups needed (who to contact, what to clarify)
• Decisions pending (what needs resolution)
• Ideas worth developing (which sparks have potential)

**Weekly Summary**
• Total new entries captured
• Total items completed
• Notable trend or observation

FORMATTING RULES:
- Use double asterisks for bold headers: **Header**
- Use • for all bullet points (never use dashes -)
- Be detailed and specific - name actual people, topics, ideas
- 200-300 words
- No intro text, no sign-off`,
      },
      { role: 'user', content: summary },
    ],
  });

  return completion.choices[0]?.message?.content || 'Unable to generate summary';
}
