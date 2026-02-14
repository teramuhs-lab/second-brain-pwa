// Citation tracking for research agent

export interface Citation {
  number: number;
  type: 'brain' | 'web';
  id?: string;      // Entry ID
  url?: string;     // Web URL
  title: string;
  snippet?: string;
  database?: string; // Category: People, Projects, Ideas, Admin
}

export class CitationTracker {
  private citations: Map<string, Citation> = new Map();
  private counter = 1;

  /**
   * Add a citation and return its reference marker [n]
   */
  add(citation: Omit<Citation, 'number'>): string {
    const key = citation.id || citation.url || citation.title;

    // Return existing citation number if already tracked
    if (this.citations.has(key)) {
      return `[${this.citations.get(key)!.number}]`;
    }

    // Add new citation
    const numbered: Citation = { ...citation, number: this.counter++ };
    this.citations.set(key, numbered);
    return `[${numbered.number}]`;
  }

  /**
   * Add multiple citations at once
   */
  addMany(citations: Omit<Citation, 'number'>[]): string[] {
    return citations.map(c => this.add(c));
  }

  /**
   * Get all citations as array
   */
  getAll(): Citation[] {
    return Array.from(this.citations.values()).sort((a, b) => a.number - b.number);
  }

  /**
   * Get citation by number
   */
  getByNumber(num: number): Citation | undefined {
    return this.getAll().find(c => c.number === num);
  }

  /**
   * Check if we have any citations
   */
  isEmpty(): boolean {
    return this.citations.size === 0;
  }

  /**
   * Get total count
   */
  count(): number {
    return this.citations.size;
  }

  /**
   * Format citations for display at end of response
   */
  formatForDisplay(): string {
    const citations = this.getAll();
    if (citations.length === 0) return '';

    return citations
      .map(c => {
        const source = c.type === 'brain'
          ? `${c.database || 'Brain'} (${c.id?.slice(0, 8)}...)`
          : c.url;
        return `[${c.number}] ${c.title} - ${source}`;
      })
      .join('\n');
  }

  /**
   * Format as markdown with clickable links
   */
  formatAsMarkdown(): string {
    const citations = this.getAll();
    if (citations.length === 0) return '';

    return citations
      .map(c => {
        if (c.type === 'web' && c.url) {
          return `[${c.number}] [${c.title}](${c.url})`;
        }
        // Brain entries - just show title and category
        return `[${c.number}] ${c.title} (${c.database || 'Brain'})`;
      })
      .join('\n');
  }

  /**
   * Export citations for API response
   */
  export(): Citation[] {
    return this.getAll();
  }

  /**
   * Reset tracker for new query
   */
  reset(): void {
    this.citations.clear();
    this.counter = 1;
  }
}

/**
 * Extract citation numbers from text (e.g., "According to research [1][2]...")
 */
export function extractCitationNumbers(text: string): number[] {
  const matches = text.match(/\[(\d+)\]/g) || [];
  return [...new Set(matches.map(m => parseInt(m.replace(/[\[\]]/g, ''))))];
}

/**
 * Validate that all citations in text are accounted for
 */
export function validateCitations(text: string, tracker: CitationTracker): { valid: boolean; missing: number[] } {
  const usedNumbers = extractCitationNumbers(text);
  const availableNumbers = tracker.getAll().map(c => c.number);
  const missing = usedNumbers.filter(n => !availableNumbers.includes(n));
  return { valid: missing.length === 0, missing };
}
