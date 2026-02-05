'use client';

import { useEffect, useState, useRef } from 'react';

interface AgentResponseCardProps {
  response: string;
  toolsUsed?: string[];
  onFollowUp: () => void;
  onDismiss: () => void;
  autoDismiss?: number;
}

export function AgentResponseCard({
  response,
  toolsUsed = [],
  onFollowUp,
  onDismiss,
  autoDismiss = 30000,
}: AgentResponseCardProps) {
  const [timeLeft, setTimeLeft] = useState(Math.floor(autoDismiss / 1000));
  const responseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoDismiss <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoDismiss, onDismiss]);

  // Format the response text (basic markdown-like formatting)
  const formatResponse = (text: string) => {
    return text.split('\n').map((line, i) => {
      // Handle bullet points
      if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
        return (
          <li key={i} className="ml-4 list-disc text-[var(--text-secondary)]">
            {line.trim().substring(2)}
          </li>
        );
      }
      // Handle numbered lists
      if (/^\d+\.\s/.test(line.trim())) {
        return (
          <li key={i} className="ml-4 list-decimal text-[var(--text-secondary)]">
            {line.trim().replace(/^\d+\.\s/, '')}
          </li>
        );
      }
      // Handle bold text with **
      const parts = line.split(/\*\*(.*?)\*\*/g);
      if (parts.length > 1) {
        return (
          <p key={i} className="text-[var(--text-secondary)]">
            {parts.map((part, j) =>
              j % 2 === 1 ? (
                <strong key={j} className="font-semibold text-[var(--text-primary)]">
                  {part}
                </strong>
              ) : (
                part
              )
            )}
          </p>
        );
      }
      // Regular paragraph
      if (line.trim()) {
        return (
          <p key={i} className="text-[var(--text-secondary)]">
            {line}
          </p>
        );
      }
      // Empty line = spacing
      return <div key={i} className="h-2" />;
    });
  };

  return (
    <div className="animate-scale-in glass-card p-5" style={{ borderColor: 'rgba(168, 85, 247, 0.3)' }}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#a855f7]/20 to-[#6366f1]/20 text-xl">
            🧠
          </div>
          <div>
            <span className="font-semibold text-[var(--text-primary)]">Your Second Brain</span>
            {toolsUsed.length > 0 && (
              <div className="flex items-center gap-1.5 mt-0.5">
                {toolsUsed.slice(0, 3).map((tool) => (
                  <span
                    key={tool}
                    className="rounded-full bg-[#a855f7]/10 px-2 py-0.5 text-[10px] text-[#a855f7]"
                  >
                    {tool.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Countdown timer */}
        {autoDismiss > 0 && (
          <button
            onClick={onDismiss}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-xs font-mono text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-secondary)]"
            title="Dismiss"
          >
            {timeLeft}
          </button>
        )}
      </div>

      {/* Response content */}
      <div
        ref={responseRef}
        className="mb-5 max-h-[300px] overflow-y-auto rounded-xl bg-[var(--bg-deep)]/50 p-4 space-y-2"
      >
        {formatResponse(response)}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onFollowUp}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#a855f7] to-[#6366f1] px-4 py-2 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] active:scale-[0.98]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
          </svg>
          Ask follow-up
        </button>

        <button
          onClick={onDismiss}
          className="rounded-xl px-4 py-2 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// Typing indicator component for loading state
export function AgentTypingIndicator() {
  return (
    <div className="animate-scale-in glass-card p-5" style={{ borderColor: 'rgba(168, 85, 247, 0.3)' }}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#a855f7]/20 to-[#6366f1]/20 text-xl">
          🧠
        </div>
        <div>
          <span className="font-semibold text-[var(--text-primary)]">Thinking...</span>
          <div className="flex items-center gap-1 mt-1">
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-[#a855f7]" style={{ animationDelay: '0ms' }} />
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-[#a855f7]" style={{ animationDelay: '150ms' }} />
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-[#a855f7]" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
