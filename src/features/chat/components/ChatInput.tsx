'use client';

import { useState, useCallback, useEffect, useRef, KeyboardEvent } from 'react';

interface ChatInputProps {
  onSend: (text: string) => Promise<void>;
  isLoading?: boolean;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

export function ChatInput({
  onSend,
  isLoading = false,
  placeholder = 'Ask anything...',
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseTextRef = useRef(''); // Text before voice input started

  // Check for speech recognition support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognition);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    await onSend(trimmed);
    setText('');
  }, [text, isLoading, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // Store current text as base before voice input
    baseTextRef.current = text;

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

      // Process all results from the beginning
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Combine base text with voice transcript
      const base = baseTextRef.current;
      const voiceText = finalTranscript || interimTranscript;
      const separator = base && voiceText ? ' ' : '';
      setText(base + separator + voiceText);

      // Update base text when we get final results
      if (finalTranscript) {
        baseTextRef.current = base + separator + finalTranscript;
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [text]);

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

  return (
    <div className="relative">
      {/* Animated border glow */}
      <div
        className={`absolute -inset-[1px] rounded-2xl bg-gradient-to-r opacity-0 blur-sm transition-opacity duration-500 ${
          isListening
            ? 'from-[var(--accent-red)] via-[var(--accent-purple)] to-[var(--accent-red)] opacity-80'
            : isFocused
              ? 'from-[#a855f7] via-[#6366f1] to-[#a855f7] opacity-70'
              : ''
        }`}
        style={{
          backgroundSize: '200% 100%',
          animation: isFocused || isListening ? 'border-flow 3s linear infinite' : 'none',
        }}
      />

      <div className="relative flex items-center gap-2 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={isListening ? 'Listening...' : placeholder}
          disabled={isLoading}
          className="flex-1 bg-transparent px-3 py-2 text-base text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none disabled:opacity-50"
        />

        {/* Voice button */}
        {speechSupported && (
          <button
            onClick={toggleListening}
            disabled={isLoading}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
              isListening
                ? 'bg-[var(--accent-red)] text-white shadow-lg shadow-red-500/30 animate-pulse'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            } disabled:opacity-30`}
            aria-label={isListening ? 'Stop listening' : 'Voice input'}
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

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || isLoading}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#a855f7] to-[#6366f1] text-white shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
          aria-label="Send"
        >
          {isLoading ? (
            <div className="spinner" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
