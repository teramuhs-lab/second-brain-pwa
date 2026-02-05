'use client';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
}

export function ChatMessage({ role, content, toolsUsed = [] }: ChatMessageProps) {
  const isUser = role === 'user';

  // Format the response text (basic markdown-like formatting)
  const formatContent = (text: string) => {
    return text.split('\n').map((line, i) => {
      // Handle bullet points
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        return (
          <li key={i} className="ml-4 list-disc">
            {line.trim().substring(2)}
          </li>
        );
      }
      // Handle numbered lists
      if (/^\d+\.\s/.test(line.trim())) {
        return (
          <li key={i} className="ml-4 list-decimal">
            {line.trim().replace(/^\d+\.\s/, '')}
          </li>
        );
      }
      // Handle bold text with **
      const parts = line.split(/\*\*(.*?)\*\*/g);
      if (parts.length > 1) {
        return (
          <p key={i}>
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
        return <p key={i}>{line}</p>;
      }
      // Empty line = spacing
      return <div key={i} className="h-2" />;
    });
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-[rgba(255,255,255,0.08)] text-[var(--text-primary)]'
            : 'bg-[rgba(168,85,247,0.1)] border border-[rgba(168,85,247,0.2)] text-[var(--text-secondary)]'
        }`}
      >
        <div className="space-y-1 text-[15px] leading-relaxed">
          {formatContent(content)}
        </div>

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
