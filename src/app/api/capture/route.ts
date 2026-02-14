import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createEntry, createInboxLogEntry } from '@/services/db/entries';
import { suggestRelations, addRelation } from '@/services/db/relations';

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

    // Step 2: Build entry content based on category
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

    // Step 3: Create entry in database
    const newEntry = await createEntry({
      category,
      title: entryTitle,
      priority: category === 'Admin' ? (extracted_data.priority || 'Medium') : (category === 'Project' ? 'Medium' : undefined),
      content,
      dueDate: reminderDate || null,
    });

    // Step 4: Log to Inbox Log
    try {
      await createInboxLogEntry({
        rawInput: text,
        category,
        confidence,
        destinationId: newEntry.id,
        status: 'Processed',
      });
    } catch (logError) {
      console.error('Failed to log to Inbox Log:', logError);
    }

    // Step 5: Auto-suggest and create relations (best-effort, non-blocking)
    let relatedItems: Array<{ id: string; title: string; category: string; similarity: number }> = [];
    try {
      const suggestions = await suggestRelations(newEntry.id, { limit: 3, threshold: 0.8 });
      for (const suggestion of suggestions) {
        await addRelation(newEntry.id, suggestion.id, 'related_to');
      }
      relatedItems = suggestions.map(s => ({
        id: s.id,
        title: s.title,
        category: s.category,
        similarity: s.similarity,
      }));
    } catch (relError) {
      console.error('Failed to auto-suggest relations:', relError);
    }

    return NextResponse.json({
      status: 'captured',
      category,
      confidence,
      page_id: newEntry.id,
      reminder: reminderDate || null,
      related: relatedItems.length > 0 ? relatedItems : undefined,
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
