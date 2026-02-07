'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { captureThought } from '@/lib/api';
import { useToast } from '@/components/Toast';

interface QuickCaptureProps {
  onCapture?: () => void;
}

export function QuickCapture({ onCapture }: QuickCaptureProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
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
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await captureThought(text.trim());
      if (result.status === 'captured') {
        showSuccess(`Captured as ${result.category}`);
        handleClose();
        onCapture?.();
      } else {
        showError(result.error || 'Failed to capture');
      }
    } catch (error) {
      showError('Failed to capture thought');
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

              {/* Text Input */}
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What's on your mind? Type or tap the mic to speak..."
                className="w-full h-32 resize-none rounded-xl bg-[var(--bg-elevated)] p-3 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-cyan)]"
              />

              {/* Footer */}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">
                  {text.length > 0 ? `${text.length} chars` : 'Cmd+Enter to submit'}
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!text.trim() || isSubmitting}
                  className="rounded-lg bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-purple)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-opacity"
                >
                  {isSubmitting ? 'Capturing...' : 'Capture'}
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
