'use client';

import { useState, useCallback } from 'react';
import { CaptureInput } from '@/components/CaptureInput';
import { ConfirmCard } from '@/components/ConfirmCard';
import { captureThought, recategorize } from '@/lib/api';
import type { Category, ConfirmationState } from '@/lib/types';

export default function CapturePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [lastText, setLastText] = useState('');

  const handleCapture = useCallback(async (text: string) => {
    setIsLoading(true);
    setLastText(text);

    try {
      const response = await captureThought(text);

      if (response.status === 'captured' && response.category) {
        setConfirmation({
          show: true,
          text,
          category: response.category,
          confidence: response.confidence || 0,
          page_id: response.page_id,
        });
      } else if (response.status === 'needs_clarification') {
        setConfirmation({
          show: true,
          text,
          category: response.category || 'Admin',
          confidence: response.confidence || 0,
          page_id: response.page_id,
        });
      } else if (response.status === 'error') {
        console.error('Capture error:', response.error);
      }
    } catch (error) {
      console.error('Capture failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRecategorize = useCallback(
    async (newCategory: Category | 'Ignore') => {
      if (!confirmation) return;

      if (newCategory === 'Ignore') {
        setConfirmation(null);
        return;
      }

      if (confirmation.page_id) {
        await recategorize(
          confirmation.page_id,
          confirmation.category,
          newCategory,
          lastText
        );
      }

      setConfirmation(null);
    },
    [confirmation, lastText]
  );

  const handleDismiss = useCallback(() => {
    setConfirmation(null);
  }, []);

  return (
    <div className="mx-auto max-w-lg px-5 pt-12">
      {/* Header */}
      <header className="mb-10 animate-fade-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-cyan)] to-[var(--accent-purple)] text-lg">
            🧠
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            Second Brain
          </h1>
        </div>
        <p className="text-base text-[var(--text-muted)] ml-[52px]">
          Capture thoughts. Let AI organize them.
        </p>
      </header>

      {/* Capture Input */}
      <div className="mb-8 animate-fade-up delay-1" style={{ opacity: 0 }}>
        <CaptureInput onSubmit={handleCapture} isLoading={isLoading} />
      </div>

      {/* Confirmation Card */}
      {confirmation?.show && (
        <div className="mb-8">
          <ConfirmCard
            text={confirmation.text}
            category={confirmation.category}
            confidence={confirmation.confidence}
            pageId={confirmation.page_id}
            onRecategorize={handleRecategorize}
            onDismiss={handleDismiss}
            autoDismiss={5000}
          />
        </div>
      )}

      {/* Quick tips card */}
      <div className="animate-fade-up delay-2 glass-card p-5" style={{ opacity: 0 }}>
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-cyan-dim)] text-xs">
            💡
          </span>
          Quick Examples
        </h2>
        <div className="space-y-3">
          {[
            { text: 'Follow up with Sarah next week', category: 'People', color: 'text-blue-400' },
            { text: 'Build PWA for second brain', category: 'Project', color: 'text-green-400' },
            { text: 'AI agents could automate X', category: 'Idea', color: 'text-purple-400' },
            { text: 'Pay electricity bill by Friday', category: 'Admin', color: 'text-orange-400' },
          ].map((example, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg bg-[var(--bg-elevated)] px-3 py-2"
            >
              <span className="text-sm text-[var(--text-secondary)]">&ldquo;{example.text}&rdquo;</span>
              <span className={`text-xs font-medium ${example.color}`}>{example.category}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
