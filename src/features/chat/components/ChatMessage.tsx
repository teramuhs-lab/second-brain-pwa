'use client';

import { ReactNode, useState } from 'react';
import type { ResearchCitation, ResearchStep } from '@/lib/types';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
  // Research-specific props
  citations?: ResearchCitation[];
  researchSteps?: ResearchStep[];
  expertDomain?: string;
}

// Domain display names and colors
const DOMAIN_STYLES: Record<string, { label: string; color: string }> = {
  tech: { label: 'Tech Expert', color: 'bg-blue-500/20 text-blue-400' },
  business: { label: 'Business Analyst', color: 'bg-green-500/20 text-green-400' },
  investment: { label: 'Investment Advisor', color: 'bg-emerald-500/20 text-emerald-400' },
  personal: { label: 'Personal Advisor', color: 'bg-amber-500/20 text-amber-400' },
  research: { label: 'Researcher', color: 'bg-purple-500/20 text-purple-400' },
};

// Helper to format inline markdown (bold, etc.)
function formatInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) {
    return [text];
  }
  return parts.map((part, j) =>
    j % 2 === 1 ? (
      <strong key={j} className="font-semibold text-[var(--text-primary)]">
        {part}
      </strong>
    ) : (
      <span key={j}>{part}</span>
    )
  );
}

export function ChatMessage({
  role,
  content,
  toolsUsed = [],
  citations = [],
  researchSteps = [],
  expertDomain,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const [showSteps, setShowSteps] = useState(false);

  // Format the response text with markdown support
  const formatContent = (text: string) => {
    return text.split('\n').map((line, i) => {
      const trimmed = line.trim();

      // Handle bullet points (- or *)
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const bulletContent = trimmed.substring(2);
        return (
          <li key={i} className="ml-4 list-disc">
            {formatInlineMarkdown(bulletContent)}
          </li>
        );
      }

      // Handle numbered lists
      const numberedMatch = trimmed.match(/^(\d+)\.\s(.*)$/);
      if (numberedMatch) {
        return (
          <li key={i} className="ml-4 list-decimal">
            {formatInlineMarkdown(numberedMatch[2])}
          </li>
        );
      }

      // Regular paragraph with inline formatting
      if (trimmed) {
        return (
          <p key={i}>
            {formatInlineMarkdown(line)}
          </p>
        );
      }

      // Empty line = spacing
      return <div key={i} className="h-2" />;
    });
  };

  const domainStyle = expertDomain ? DOMAIN_STYLES[expertDomain] : null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-[rgba(255,255,255,0.08)] text-[var(--text-primary)]'
            : 'bg-[rgba(168,85,247,0.1)] border border-[rgba(168,85,247,0.2)] text-[var(--text-secondary)]'
        }`}
      >
        {/* Expert domain badge */}
        {!isUser && domainStyle && (
          <div className="mb-2 flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${domainStyle.color}`}>
              {domainStyle.label}
            </span>
          </div>
        )}

        {/* Main content */}
        <div className="space-y-1 text-[15px] leading-relaxed">
          {formatContent(content)}
        </div>

        {/* Citations section */}
        {!isUser && citations.length > 0 && (
          <div className="mt-3 border-t border-[rgba(168,85,247,0.15)] pt-2">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Sources
            </p>
            <div className="space-y-1">
              {citations.map((citation) => (
                <div
                  key={citation.number}
                  className="flex items-start gap-2 text-[12px] text-[var(--text-muted)]"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[rgba(168,85,247,0.15)] text-[10px] font-medium text-[#a855f7]">
                    {citation.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-[var(--text-secondary)]">
                      {citation.title}
                    </span>
                    {citation.type === 'notion' && citation.database && (
                      <span className="ml-1 text-[var(--text-muted)]">
                        ({citation.database})
                      </span>
                    )}
                    {citation.type === 'web' && citation.url && (
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 text-[#a855f7] hover:underline"
                      >
                        Link
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Research steps (collapsible) */}
        {!isUser && researchSteps.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowSteps(!showSteps)}
              className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              <svg
                className={`h-3 w-3 transition-transform ${showSteps ? 'rotate-90' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
              {showSteps ? 'Hide' : 'Show'} research steps ({researchSteps.length})
            </button>

            {showSteps && (
              <div className="mt-2 space-y-1 rounded-lg bg-[rgba(0,0,0,0.2)] p-2">
                {researchSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-[11px] text-[var(--text-muted)]"
                  >
                    <span className="shrink-0 rounded bg-[rgba(168,85,247,0.1)] px-1 py-0.5 text-[9px] font-medium text-[#a855f7]">
                      {step.type}
                    </span>
                    <span className="truncate">{step.content.slice(0, 100)}...</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tools used indicator */}
        {!isUser && toolsUsed.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {toolsUsed.map((tool) => (
              <span
                key={tool}
                className="rounded-full bg-[rgba(168,85,247,0.15)] px-2 py-0.5 text-[10px] text-[#a855f7]"
              >
                {tool.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Typing indicator for loading state
export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl bg-[rgba(168,85,247,0.1)] border border-[rgba(168,85,247,0.2)] px-4 py-3">
        <div className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 animate-bounce rounded-full bg-[#a855f7]"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="inline-block h-2 w-2 animate-bounce rounded-full bg-[#a855f7]"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="inline-block h-2 w-2 animate-bounce rounded-full bg-[#a855f7]"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>
    </div>
  );
}

// Research-specific loading indicator
export function ResearchingIndicator({ status }: { status?: string }) {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl bg-[rgba(168,85,247,0.1)] border border-[rgba(168,85,247,0.2)] px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Animated research icon */}
          <div className="relative">
            <svg
              className="h-5 w-5 animate-pulse text-[#a855f7]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Researching...
            </span>
            {status && (
              <span className="text-xs text-[var(--text-muted)]">{status}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
