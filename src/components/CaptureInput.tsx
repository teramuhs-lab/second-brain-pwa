'use client';

import { useState, useCallback, KeyboardEvent } from 'react';

interface CaptureInputProps {
  onSubmit: (text: string) => Promise<void>;
  isLoading?: boolean;
  placeholder?: string;
}

export function CaptureInput({
  onSubmit,
  isLoading = false,
  placeholder = "What's on your mind?",
}: CaptureInputProps) {
  const [text, setText] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    await onSubmit(trimmed);
    setText('');
  }, [text, isLoading, onSubmit]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative">
      {/* Animated border glow when focused */}
      <div
        className={`absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-purple)] to-[var(--accent-cyan)] opacity-0 blur-sm transition-opacity duration-500 ${
          isFocused ? 'opacity-60' : ''
        }`}
        style={{ backgroundSize: '200% 100%', animation: isFocused ? 'border-flow 3s linear infinite' : 'none' }}
      />

      <div className="relative glass-card p-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={isLoading}
          rows={3}
          className="w-full resize-none rounded-xl bg-[var(--bg-elevated)] px-4 py-4 pr-14 text-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-all duration-300 focus:outline-none disabled:opacity-50"
          style={{ fontFamily: 'var(--font-sans)' }}
        />

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || isLoading}
          className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-cyan)] to-[#00a8cc] text-[var(--bg-deep)] shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-[0_0_20px_rgba(0,212,255,0.4)] active:scale-95 disabled:opacity-30 disabled:hover:scale-100 disabled:hover:shadow-lg"
          aria-label="Send"
        >
          {isLoading ? (
            <div className="spinner" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          )}
        </button>
      </div>

      {/* Keyboard hint */}
      <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)]">
        <kbd className="rounded-md bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
          ⌘
        </kbd>
        <span>+</span>
        <kbd className="rounded-md bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
          Enter
        </kbd>
        <span className="ml-1">to send</span>
      </div>
    </div>
  );
}
