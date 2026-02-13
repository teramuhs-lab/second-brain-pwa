import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { DATABASE_IDS, CATEGORY_DB_IDS, DEFAULT_STATUS, TITLE_PROPERTY } from '@/config/constants';
import { createPage } from '@/services/notion/client';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
    // Default to Admin if parsing fails
    return {
      category: 'Admin',
      confidence: 0.5,
      extracted_data: { task: text },
      reasoning: 'Parse error, defaulting to Admin',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'OPENAI_API_KEY not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { text, reminderDate } = body;

    // Validate input
    if (!text || typeof text !== 'string' || text.trim().length < 3) {
      return NextResponse.json(
        { status: 'error', error: 'Text must be at least 3 characters' },
        { status: 400 }
      );
    }

    // Step 1: Classify the text with AI
    const classification = await classifyText(text.trim());
    const { category, confidence, extracted_data } = classification;

    const targetDbId = CATEGORY_DB_IDS[category];
    const titleProperty = TITLE_PROPERTY[category];
    const defaultStatus = DEFAULT_STATUS[category];

    // Step 2: Build properties for Notion
    const properties: Record<string, unknown> = {
      [titleProperty]: {
        title: [
          {
            text: {
              content:
                extracted_data.name ||
                extracted_data.title ||
                extracted_data.task ||
                text.slice(0, 100),
            },
          },
        ],
      },
    };

    // Set status/maturity based on category (Ideas uses Maturity, others use Status)
    if (category === 'Idea') {
      properties['Maturity'] = { select: { name: defaultStatus } };
    } else {
      properties['Status'] = { select: { name: defaultStatus } };
    }

    // Add category-specific properties
    if (category === 'Admin') {
      properties['Priority'] = { select: { name: extracted_data.priority || 'Medium' } };
      properties['Category'] = { select: { name: 'Home' } };
      if (reminderDate) {
        properties['Due Date'] = { date: { start: reminderDate } };
      }
    } else if (category === 'Project') {
      properties['Priority'] = { select: { name: 'Medium' } };
      properties['Area'] = { select: { name: 'Work' } };
      if (extracted_data.next_action) {
        properties['Next Action'] = {
          rich_text: [{ text: { content: extracted_data.next_action } }],
        };
      }
      if (reminderDate) {
        properties['Due Date'] = { date: { start: reminderDate } };
      }
    } else if (category === 'Idea') {
      properties['Category'] = { select: { name: 'Life' } };
      if (extracted_data.raw_insight) {
        properties['Raw Insight'] = {
          rich_text: [{ text: { content: extracted_data.raw_insight } }],
        };
      }
    } else if (category === 'People') {
      properties['Last Contact'] = {
        date: { start: new Date().toISOString().split('T')[0] },
      };
      if (extracted_data.company) {
        properties['Company'] = {
          rich_text: [{ text: { content: extracted_data.company } }],
        };
      }
      if (extracted_data.context) {
        properties['Context'] = {
          rich_text: [{ text: { content: extracted_data.context } }],
        };
      }
      if (reminderDate) {
        properties['Next Follow-up'] = { date: { start: reminderDate } };
      }
    }

    // Step 3: Create the Notion page
    const newPage = await createPage(targetDbId, properties);

    // Step 4: Log to Inbox Log
    try {
      await createPage(DATABASE_IDS.InboxLog, {
        'Raw Input': {
          title: [{ text: { content: text } }],
        },
        Category: {
          select: { name: category },
        },
        Confidence: {
          number: confidence,
        },
        'Destination ID': {
          rich_text: [{ text: { content: newPage.id } }],
        },
        Status: {
          select: { name: 'Processed' },
        },
      });
    } catch (logError) {
      console.error('Failed to log to Inbox Log:', logError);
    }

    return NextResponse.json({
      status: 'captured',
      category,
      confidence,
      page_id: newPage.id,
      reminder: reminderDate || null,
    });
  } catch (error) {
    console.error('Capture error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
