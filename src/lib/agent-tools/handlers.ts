// Shared agent handler functions
// Core logic for brain search and item details used by both agents

import { DATABASE_IDS, type DatabaseKey } from '@/config/constants';
import { queryDatabase, getPage } from '@/services/notion/client';
import {
  extractTitle,
  extractSelect,
  extractDate,
  extractRichText,
  extractAllText,
} from '@/services/notion/helpers';

// ============= Types =============

export interface BrainSearchResult {
  id: string;
  title: string;
  category: string;
  snippet: string;
  status?: string;
  priority?: string;
  dueDate?: string;
}

export interface ItemDetails {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  created?: string;
  lastEdited?: string;
  fields: Record<string, string>;
}

// ============= Utilities =============

/** Map a Notion database ID back to its category name */
export function getCategoryFromDbId(dbId: string): string {
  for (const [category, id] of Object.entries(DATABASE_IDS)) {
    if (id === dbId) return category;
  }
  return 'Unknown';
}

// ============= Brain Search =============

/** Search Notion databases and return structured results */
export async function searchBrainEntries(
  query: string,
  categories?: string[]
): Promise<BrainSearchResult[]> {
  const queryLower = query.toLowerCase();
  const categoriesToSearch = categories?.length
    ? categories
    : ['People', 'Projects', 'Ideas', 'Admin'];

  const allResults: BrainSearchResult[] = [];

  for (const category of categoriesToSearch) {
    const dbId = DATABASE_IDS[category as DatabaseKey];
    if (!dbId) continue;

    try {
      const pages = await queryDatabase(dbId);
      const matches = pages.filter((page) => {
        const text = extractAllText(page.properties as Record<string, unknown>).toLowerCase();
        return text.includes(queryLower);
      });

      for (const page of matches.slice(0, 5)) {
        const props = page.properties as Record<string, unknown>;
        allResults.push({
          id: page.id,
          title: extractTitle(props),
          category,
          snippet: extractAllText(props).slice(0, 200),
          status: extractSelect(props, 'Status'),
          priority: extractSelect(props, 'Priority'),
          dueDate: extractDate(props, 'Due Date') || extractDate(props, 'Next Follow-up'),
        });
      }
    } catch (error) {
      console.error(`Error searching ${category}:`, error);
    }
  }

  return allResults;
}

// ============= Item Details =============

const DETAIL_FIELDS = [
  'Company', 'Role', 'Context', 'Notes', 'Next Action',
  'Raw Insight', 'One-liner', 'Area',
];

/** Get full details for a Notion page */
export async function getItemDetailsCore(itemId: string): Promise<ItemDetails | null> {
  try {
    const page = await getPage(itemId);
    const props = page.properties as Record<string, unknown>;
    const fields: Record<string, string> = {};

    for (const field of DETAIL_FIELDS) {
      const value = extractRichText(props, field) || extractSelect(props, field);
      if (value) fields[field] = value;
    }

    const dueDate = extractDate(props, 'Due Date');
    if (dueDate) fields['Due Date'] = dueDate;
    const followUp = extractDate(props, 'Next Follow-up');
    if (followUp) fields['Next Follow-up'] = followUp;

    return {
      id: page.id,
      title: extractTitle(props),
      status: extractSelect(props, 'Status'),
      priority: extractSelect(props, 'Priority'),
      created: page.created_time,
      lastEdited: page.last_edited_time,
      fields,
    };
  } catch {
    return null;
  }
}
