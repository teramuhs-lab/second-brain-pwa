// Notion property extraction helpers
// Previously duplicated across multiple API routes

// Extract title from Notion properties
export function extractTitle(properties: Record<string, unknown>): string {
  const titleProps = ['Name', 'Title', 'Task'];
  for (const prop of titleProps) {
    const titleProp = properties[prop] as { title?: Array<{ plain_text: string }> } | undefined;
    if (titleProp?.title?.[0]?.plain_text) {
      return titleProp.title[0].plain_text;
    }
  }
  return 'Untitled';
}

// Extract select value
export function extractSelect(properties: Record<string, unknown>, field: string): string | undefined {
  const selectProp = properties[field] as { select?: { name: string } } | undefined;
  return selectProp?.select?.name;
}

// Extract status
export function extractStatus(properties: Record<string, unknown>): string | undefined {
  return extractSelect(properties, 'Status');
}

// Extract priority
export function extractPriority(properties: Record<string, unknown>): string | undefined {
  return extractSelect(properties, 'Priority');
}

// Extract date
export function extractDate(properties: Record<string, unknown>, field: string): string | undefined {
  const dateProp = properties[field] as { date?: { start: string } } | undefined;
  return dateProp?.date?.start;
}

// Extract rich text
export function extractRichText(properties: Record<string, unknown>, field: string): string {
  const prop = properties[field] as { rich_text?: Array<{ plain_text: string }> } | undefined;
  return prop?.rich_text?.map(t => t.plain_text).join('') || '';
}

// Extract URL
export function extractUrl(properties: Record<string, unknown>, field: string): string | undefined {
  const urlProp = properties[field] as { url?: string } | undefined;
  return urlProp?.url || undefined;
}

// Extract number
export function extractNumber(properties: Record<string, unknown>, field: string): number | undefined {
  const numberProp = properties[field] as { number?: number } | undefined;
  return numberProp?.number ?? undefined;
}

// Extract all text from properties (for search)
export function extractAllText(properties: Record<string, unknown>): string {
  const texts: string[] = [];
  for (const [, value] of Object.entries(properties)) {
    const prop = value as Record<string, unknown>;
    if (prop.title && Array.isArray(prop.title)) {
      texts.push((prop.title as Array<{ plain_text: string }>).map(t => t.plain_text).join(''));
    }
    if (prop.rich_text && Array.isArray(prop.rich_text)) {
      texts.push((prop.rich_text as Array<{ plain_text: string }>).map(t => t.plain_text).join(''));
    }
    if (prop.select && typeof prop.select === 'object') {
      const select = prop.select as { name?: string };
      if (select.name) texts.push(select.name);
    }
  }
  return texts.join(' ');
}

// Build title property
export function buildTitleProperty(value: string): { title: Array<{ text: { content: string } }> } {
  return {
    title: [{ text: { content: value } }],
  };
}

// Build rich text property
export function buildRichTextProperty(value: string): { rich_text: Array<{ text: { content: string } }> } {
  return {
    rich_text: [{ text: { content: value } }],
  };
}

// Build select property
export function buildSelectProperty(value: string): { select: { name: string } } {
  return {
    select: { name: value },
  };
}

// Build date property
export function buildDateProperty(date: string): { date: { start: string } } {
  return {
    date: { start: date },
  };
}

// Build number property
export function buildNumberProperty(value: number): { number: number } {
  return {
    number: value,
  };
}

// Build URL property
export function buildUrlProperty(url: string): { url: string } {
  return {
    url,
  };
}
