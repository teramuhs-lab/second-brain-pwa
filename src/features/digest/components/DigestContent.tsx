'use client';

import { formatInlineMarkdown } from '../utils';

export function DigestContent({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div className="space-y-2 text-sm text-[var(--text-secondary)]">
      {lines.map((line, i) => {
        const trimmed = line.trim();

        if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
          const bulletContent = trimmed.substring(1).trim();
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-[var(--accent-cyan)]">•</span>
              <span>{formatInlineMarkdown(bulletContent)}</span>
            </div>
          );
        }

        if (trimmed.startsWith('**') && trimmed.includes('**')) {
          return (
            <p key={i} className="mt-3 first:mt-0">
              {formatInlineMarkdown(trimmed)}
            </p>
          );
        }

        if (trimmed) {
          return (
            <p key={i}>{formatInlineMarkdown(line)}</p>
          );
        }

        return <div key={i} className="h-1" />;
      })}
    </div>
  );
}
