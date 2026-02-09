'use client';

import { useState, useCallback, useEffect, useRef, KeyboardEvent } from 'react';

interface CaptureInputProps {
  onSubmit: (text: string, reminderDate?: string) => Promise<void>;
  onUrlSubmit?: (url: string) => Promise<void>;
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

// URL detection regex
const URL_REGEX = /https?:\/\/[^\s]+/;

export function CaptureInput({
  onSubmit,
  onUrlSubmit,
  isLoading = false,
  placeholder = "What's on your mind?",
}: CaptureInputProps) {
  const [text, setText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [hasUrl, setHasUrl] = useState(false);
  const [reminderDate, setReminderDate] = useState<string | null>(null);
  const [reminderTime, setReminderTime] = useState<string>('09:00');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Time options for reminder (30-minute intervals)
  const TIME_OPTIONS = [
    { value: '07:00', label: '7:00 AM' },
    { value: '07:30', label: '7:30 AM' },
    { value: '08:00', label: '8:00 AM' },
    { value: '08:30', label: '8:30 AM' },
    { value: '09:00', label: '9:00 AM' },
    { value: '09:30', label: '9:30 AM' },
    { value: '10:00', label: '10:00 AM' },
    { value: '10:30', label: '10:30 AM' },
    { value: '11:00', label: '11:00 AM' },
    { value: '11:30', label: '11:30 AM' },
    { value: '12:00', label: '12:00 PM' },
    { value: '12:30', label: '12:30 PM' },
    { value: '13:00', label: '1:00 PM' },
    { value: '13:30', label: '1:30 PM' },
    { value: '14:00', label: '2:00 PM' },
    { value: '14:30', label: '2:30 PM' },
    { value: '15:00', label: '3:00 PM' },
    { value: '15:30', label: '3:30 PM' },
    { value: '16:00', label: '4:00 PM' },
    { value: '16:30', label: '4:30 PM' },
    { value: '17:00', label: '5:00 PM' },
    { value: '17:30', label: '5:30 PM' },
    { value: '18:00', label: '6:00 PM' },
    { value: '18:30', label: '6:30 PM' },
    { value: '19:00', label: '7:00 PM' },
    { value: '19:30', label: '7:30 PM' },
    { value: '20:00', label: '8:00 PM' },
    { value: '20:30', label: '8:30 PM' },
    { value: '21:00', label: '9:00 PM' },
  ];

  // Format time for display
  const formatTimeDisplay = (time: string): string => {
    const option = TIME_OPTIONS.find(t => t.value === time);
    return option?.label || time;
  };

  // Helper to format date as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Set reminder to tomorrow
  const setTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setReminderDate(formatDate(tomorrow));
    setShowDatePicker(false);
  };

  // Set reminder to next week
  const setNextWeek = () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    setReminderDate(formatDate(nextWeek));
    setShowDatePicker(false);
  };

  // Clear reminder
  const clearReminder = () => {
    setReminderDate(null);
    setReminderTime('09:00');
    setShowDatePicker(false);
  };

  // Format reminder display text
  const getReminderDisplay = (): string => {
    if (!reminderDate) return '';
    const date = new Date(reminderDate + 'T00:00:00');
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    let dateStr: string;
    if (formatDate(date) === formatDate(tomorrow)) {
      dateStr = 'Tomorrow';
    } else {
      const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 7) {
        dateStr = 'Next week';
      } else {
        dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      }
    }

    return `${dateStr} at ${formatTimeDisplay(reminderTime)}`;
  };

  // Detect URLs in text
  useEffect(() => {
    setHasUrl(URL_REGEX.test(text));
  }, [text]);

  // Check for speech recognition support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognition);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    // Check if input contains a URL
    const urlMatch = trimmed.match(URL_REGEX);
    if (urlMatch && onUrlSubmit) {
      // Extract the URL and process it
      await onUrlSubmit(urlMatch[0]);
    } else {
      // Normal text capture (with optional reminder)
      // Combine date and time into ISO datetime string with timezone offset
      let reminderDateTime: string | undefined;
      if (reminderDate) {
        // Get local timezone offset (e.g., -05:00 for EST)
        const offset = -new Date().getTimezoneOffset();
        const offsetHours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
        const offsetMinutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
        const offsetSign = offset >= 0 ? '+' : '-';
        const tzString = `${offsetSign}${offsetHours}:${offsetMinutes}`;
        reminderDateTime = `${reminderDate}T${reminderTime}:00${tzString}`;
      }
      await onSubmit(trimmed, reminderDateTime);
    }
    setText('');
    setReminderDate(null);
    setReminderTime('09:00');
    setShowDatePicker(false);
  }, [text, isLoading, onSubmit, onUrlSubmit, reminderDate, reminderTime]);

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

      setText((prev) => {
        if (finalTranscript) {
          return prev + (prev ? ' ' : '') + finalTranscript;
        }
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

  const dynamicPlaceholder = isListening
    ? 'Listening...'
    : hasUrl
      ? 'Link detected! Press send to analyze...'
      : placeholder;

  return (
    <div className="relative">
      {/* Animated border glow when focused, listening, or URL detected */}
      <div
        className={`pointer-events-none absolute -inset-[1px] rounded-2xl bg-gradient-to-r opacity-0 blur-sm transition-opacity duration-500 ${
          isListening
            ? 'from-[var(--accent-red)] via-[var(--accent-purple)] to-[var(--accent-red)] opacity-80'
            : hasUrl
              ? 'from-[var(--accent-green)] via-[var(--accent-green)] to-[var(--accent-green)] opacity-70'
              : isFocused
                ? 'from-[var(--accent-cyan)] via-[var(--accent-purple)] to-[var(--accent-cyan)] opacity-60'
                : ''
        }`}
        style={{
          backgroundSize: '200% 100%',
          animation: isFocused || isListening || hasUrl ? 'border-flow 3s linear infinite' : 'none',
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
          disabled={isLoading}
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
              disabled={isLoading}
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

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || isLoading}
            className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 disabled:hover:shadow-lg ${
              hasUrl
                ? 'bg-[var(--accent-green)] text-white hover:brightness-110'
                : 'bg-[var(--accent-cyan)] text-[var(--bg-deep)] hover:brightness-110'
            }`}
            aria-label={hasUrl ? 'Analyze link' : 'Send'}
            title={hasUrl ? 'Analyze link' : 'Capture thought'}
          >
            {isLoading ? (
              <div className="spinner" />
            ) : hasUrl ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Reminder Selector (only for text capture, not URLs) */}
      {!hasUrl && (
        <div className="mt-3 flex items-center justify-center">
          {reminderDate ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-sm text-amber-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {getReminderDisplay()}
              </span>
              <button
                type="button"
                onClick={clearReminder}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
              >
                Clear
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] active:bg-[var(--bg-surface)] transition-colors cursor-pointer"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Remind me
            </button>
          )}
        </div>
      )}

      {/* Date picker options */}
      {showDatePicker && !reminderDate && !hasUrl && (
        <div className="mt-2 flex justify-center gap-2">
          <button
            type="button"
            onClick={setTomorrow}
            className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-colors"
          >
            Tomorrow
          </button>
          <button
            type="button"
            onClick={setNextWeek}
            className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-colors"
          >
            Next week
          </button>
          <input
            type="date"
            min={formatDate(new Date())}
            onChange={(e) => {
              if (e.target.value) {
                setReminderDate(e.target.value);
                setShowDatePicker(false);
              }
            }}
            className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
          />
        </div>
      )}

      {/* Time picker (shown when date is selected) */}
      {reminderDate && !hasUrl && (
        <div className="mt-2 flex justify-center">
          <select
            value={reminderTime}
            onChange={(e) => setReminderTime(e.target.value)}
            className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer min-w-[120px]"
          >
            {TIME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Keyboard hint */}
      <div className="mt-3 flex items-center justify-center gap-3 text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-1.5">
          <kbd className="rounded-md bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
            ⌘
          </kbd>
          <span>+</span>
          <kbd className="rounded-md bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
            Enter
          </kbd>
          <span className="ml-1">to send</span>
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
      </div>
    </div>
  );
}
