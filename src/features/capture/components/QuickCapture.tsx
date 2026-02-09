'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { captureThought, processUrl, isUrl } from '@/lib/api';
import { useToast } from '@/shared/components/Toast';

interface QuickCaptureProps {
  onCapture?: () => void;
}

export function QuickCapture({ onCapture }: QuickCaptureProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [processingStage, setProcessingStage] = useState(0);
  const [reminderDate, setReminderDate] = useState<string | null>(null);
  const [reminderTime, setReminderTime] = useState<string>('09:00');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const hasUrl = isUrl(text);

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

  // Progress stages for URL processing
  const urlStages = [
    'Detecting content type...',
    'Fetching transcript...',
    'Analyzing with AI...',
    'Creating Notion entry...',
  ];
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: { resultIndex: number; results: { [key: number]: { [key: number]: { transcript: string }; isFinal: boolean }; length: number } }) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript = transcript;
            }
          }

          if (finalTranscript) {
            setText(prev => prev + (prev ? ' ' : '') + finalTranscript);
          }
        };

        recognition.onerror = (event: { error: string }) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          if (event.error === 'not-allowed') {
            showError('Microphone access denied');
          }
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [showError]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      showError('Voice capture not supported in this browser');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const handleClose = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsOpen(false);
    setText('');
    setIsListening(false);
    setProcessingStage(0);
    setReminderDate(null);
    setReminderTime('09:00');
    setShowDatePicker(false);
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

  const handleSubmit = async () => {
    if (!text.trim()) return;

    setIsSubmitting(true);
    try {
      const trimmed = text.trim();

      // Check if input is a URL
      if (isUrl(trimmed)) {
        // Extract URL and process it
        const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          // Start progress animation
          setProcessingStage(0);
          const stageInterval = setInterval(() => {
            setProcessingStage((prev) => Math.min(prev + 1, urlStages.length - 1));
          }, 8000); // Advance stage every 8 seconds

          try {
            const result = await processUrl(urlMatch[0]);
            clearInterval(stageInterval);
            if (result.status === 'success') {
              showSuccess(`Link saved: ${result.title || 'Untitled'}`);
              handleClose();
              onCapture?.();
            } else {
              showError(result.error || 'Failed to process link');
            }
          } catch (err) {
            clearInterval(stageInterval);
            throw err;
          }
          return;
        }
      }

      // Regular text capture (with optional reminder)
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
      const result = await captureThought(trimmed, reminderDateTime);
      if (result.status === 'captured') {
        const reminderText = reminderDate ? ` (reminder set for ${formatTimeDisplay(reminderTime)})` : '';
        showSuccess(`Captured as ${result.category}${reminderText}`);
        handleClose();
        onCapture?.();
      } else {
        showError(result.error || 'Failed to capture');
      }
    } catch (error) {
      showError('Failed to capture');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!mounted) return null;

  // Hide FAB on pages that already have input (Capture, Ask)
  const hiddenPages = ['/', '/ask'];
  if (hiddenPages.includes(pathname)) {
    return null;
  }

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-purple)] shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label="Quick capture"
      >
        <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Capture Modal */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="relative w-full max-w-lg mx-4 mb-4 sm:mb-0 animate-slide-up">
            <div className="glass-card rounded-2xl p-4 shadow-deep">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium text-[var(--text-primary)]">
                  Quick Capture
                </h3>
                <div className="flex items-center gap-2">
                  {/* Voice Button */}
                  <button
                    onClick={toggleListening}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                      isListening
                        ? 'bg-red-500 animate-pulse'
                        : 'bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)]'
                    }`}
                    aria-label={isListening ? 'Stop recording' : 'Start voice capture'}
                  >
                    <svg
                      className={`h-5 w-5 ${isListening ? 'text-white' : 'text-[var(--text-muted)]'}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>

                  {/* Close Button */}
                  <button
                    onClick={handleClose}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)]"
                  >
                    <svg className="h-5 w-5 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Listening indicator */}
              {isListening && (
                <div className="mb-3 flex items-center gap-2 text-sm text-red-400">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  Listening... speak now
                </div>
              )}

              {/* URL detected indicator */}
              {hasUrl && (
                <div className="mb-3 flex items-center gap-2 text-sm text-emerald-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  Link detected — will extract & summarize
                </div>
              )}

              {/* Text Input */}
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What's on your mind? Type or tap the mic to speak..."
                className={`w-full h-32 resize-none rounded-xl bg-[var(--bg-elevated)] p-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 ${
                  hasUrl ? 'ring-1 ring-emerald-500/50 focus:ring-emerald-500' : 'focus:ring-[var(--accent-cyan)]'
                }`}
              />

              {/* Progress indicator for URL processing */}
              {isSubmitting && hasUrl && (
                <div className="mt-3 space-y-2">
                  {/* Progress bar */}
                  <div className="h-1.5 w-full rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-1000 ease-out"
                      style={{ width: `${((processingStage + 1) / urlStages.length) * 100}%` }}
                    />
                  </div>
                  {/* Stage text */}
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {urlStages[processingStage]}
                  </div>
                </div>
              )}

              {/* Reminder Selector (only for text capture, not URLs) */}
              {!hasUrl && (
                <div className="mt-3">
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
                        onClick={clearReminder}
                        className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowDatePicker(!showDatePicker)}
                        className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Remind me
                      </button>
                    </div>
                  )}

                  {/* Date picker options */}
                  {showDatePicker && !reminderDate && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={setTomorrow}
                        className="rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        Tomorrow
                      </button>
                      <button
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
                  {reminderDate && (
                    <div className="mt-2">
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
                </div>
              )}

              {/* Footer */}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">
                  {text.length > 0 ? `${text.length} chars` : 'Cmd+Enter to submit'}
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!text.trim() || isSubmitting}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-all ${
                    hasUrl
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                      : 'bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)]'
                  }`}
                >
                  {isSubmitting ? (hasUrl ? 'Processing...' : 'Capturing...') : (hasUrl ? 'Capture Link' : 'Capture')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// TypeScript declarations for Web Speech API
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}
