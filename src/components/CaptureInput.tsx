'use client';

import { useState, useCallback, useEffect, useRef, KeyboardEvent, useMemo } from 'react';

interface CaptureInputProps {
  onSubmit: (text: string) => Promise<void>;
  onAskAgent?: (text: string) => Promise<void>;
  isLoading?: boolean;
  isAgentLoading?: boolean;
  placeholder?: string;
}

// TypeScript declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// Question detection for Smart Capture
function isQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const patterns = [
    /\?$/,                                           // Ends with ?
    /^(what|how|when|where|who|why|which)\b/i,      // Question words
    /^(can|could|would|should|do|does|did)\b/i,      // Auxiliary verbs as questions
    /^(is|are|was|were|has|have|had)\b/i,            // Be/have verbs as questions
    /^(show|find|list|tell|remind|get)\s+me\b/i,     // Commands to retrieve
    /^(search|look\s*(up|for)?)\b/i,                 // Search commands
  ];

  return patterns.some(p => p.test(trimmed));
}

export function CaptureInput({
  onSubmit,
  onAskAgent,
  isLoading = false,
  isAgentLoading = false,
  placeholder = "What's on your mind?",
}: CaptureInputProps) {
  const [text, setText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Determine if current text is a question (Ask mode)
  const isAskMode = useMemo(() => onAskAgent && isQuestion(text), [text, onAskAgent]);
  const anyLoading = isLoading || isAgentLoading;

  // Check for speech recognition support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognition);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || anyLoading) return;

    console.log('[CaptureInput] Submit:', { trimmed, isAskMode, hasOnAskAgent: !!onAskAgent });

    // If it's a question and we have an agent handler, use it
    if (isAskMode && onAskAgent) {
      console.log('[CaptureInput] Routing to Agent');
      await onAskAgent(trimmed);
    } else {
      console.log('[CaptureInput] Routing to Capture');
      await onSubmit(trimmed);
    }
    setText('');
  }, [text, anyLoading, isAskMode, onAskAgent, onSubmit]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Show interim results while speaking, final when done
      setText((prev) => {
        // If we have a final transcript, append it
        if (finalTranscript) {
          return prev + (prev ? ' ' : '') + finalTranscript;
        }
        // Show interim in real-time (replace previous interim)
        return prev + (prev ? ' ' : '') + interimTranscript;
      });
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Dynamic placeholder based on mode
  const dynamicPlaceholder = isListening
    ? 'Listening...'
    : isAskMode
      ? 'Ask your second brain...'
      : placeholder;

  return (
    <div className="relative">
      {/* Animated border glow when focused or listening */}
      <div
        className={`absolute -inset-[1px] rounded-2xl bg-gradient-to-r opacity-0 blur-sm transition-opacity duration-500 ${
          isListening
            ? 'from-[var(--accent-red)] via-[var(--accent-purple)] to-[var(--accent-red)] opacity-80'
            : isFocused && isAskMode
              ? 'from-[#a855f7] via-[#6366f1] to-[#a855f7] opacity-70'
              : isFocused
                ? 'from-[var(--accent-cyan)] via-[var(--accent-purple)] to-[var(--accent-cyan)] opacity-60'
                : ''
        }`}
        style={{
          backgroundSize: '200% 100%',
          animation: isFocused || isListening ? 'border-flow 3s linear infinite' : 'none',
        }}
      />

      <div className="relative glass-card p-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={dynamicPlaceholder}
          disabled={anyLoading}
          rows={3}
          className="w-full resize-none rounded-xl bg-[var(--bg-elevated)] px-4 py-4 pr-28 text-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-all duration-300 focus:outline-none disabled:opacity-50"
          style={{ fontFamily: 'var(--font-sans)' }}
        />

        {/* Action buttons container */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          {/* Voice button */}
          {speechSupported && (
            <button
              onClick={toggleListening}
              disabled={anyLoading}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
                isListening
                  ? 'bg-[var(--accent-red)] text-white shadow-lg shadow-red-500/30 animate-pulse'
                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
              } disabled:opacity-30`}
              aria-label={isListening ? 'Stop listening' : 'Start voice input'}
              title={isListening ? 'Stop listening' : 'Voice input'}
            >
              {isListening ? (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              )}
            </button>
          )}

          {/* Send/Ask button - changes based on mode */}
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || anyLoading}
            className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 disabled:hover:shadow-lg ${
              isAskMode
                ? 'bg-gradient-to-br from-[#a855f7] to-[#6366f1] text-white hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]'
                : 'bg-gradient-to-br from-[var(--accent-cyan)] to-[#00a8cc] text-[var(--bg-deep)] hover:shadow-[0_0_20px_rgba(0,212,255,0.4)]'
            }`}
            aria-label={isAskMode ? 'Ask' : 'Send'}
            title={isAskMode ? 'Ask your brain' : 'Capture thought'}
          >
            {anyLoading ? (
              <div className="spinner" />
            ) : isAskMode ? (
              // Sparkle icon for Ask mode
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
              </svg>
            ) : (
              // Arrow icon for Capture mode
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Keyboard hint - shows mode indicator */}
      <div className="mt-3 flex items-center justify-center gap-3 text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-1.5">
          <kbd className="rounded-md bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
            ⌘
          </kbd>
          <span>+</span>
          <kbd className="rounded-md bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
            Enter
          </kbd>
          <span className="ml-1">to {isAskMode ? 'ask' : 'send'}</span>
        </div>
        {speechSupported && (
          <>
            <span className="text-[var(--border-subtle)]">•</span>
            <div className="flex items-center gap-1">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
              <span>for voice</span>
            </div>
          </>
        )}
        {/* Mode indicator */}
        {isAskMode && (
          <>
            <span className="text-[var(--border-subtle)]">•</span>
            <div className="flex items-center gap-1 text-[#a855f7]">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
              </svg>
              <span>Ask mode</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
