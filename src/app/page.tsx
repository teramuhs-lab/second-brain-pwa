'use client';

import { useState, useCallback } from 'react';
import { CaptureInput } from '@/components/CaptureInput';
import { ConfirmCard } from '@/components/ConfirmCard';
import { LinkSummaryCard } from '@/components/LinkSummaryCard';
import { captureThought, recategorize, processUrl, sendSlackNotification } from '@/lib/api';
import type { Category, ConfirmationState, UrlProcessResult } from '@/lib/types';

export default function CapturePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [urlResult, setUrlResult] = useState<UrlProcessResult | null>(null);
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

  const handleUrlCapture = useCallback(async (url: string) => {
    setIsLoading(true);
    setConfirmation(null);
    setUrlResult(null);

    try {
      const result = await processUrl(url);
      setUrlResult(result);
    } catch (error) {
      console.error('URL capture failed:', error);
      setUrlResult({
        status: 'error',
        url,
        urlType: 'generic',
        title: '',
        one_liner: '',
        full_summary: '',
        key_points: [],
        category: 'Tech',
        error: error instanceof Error ? error.message : 'Failed to process URL',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleUrlDismiss = useCallback(() => {
    setUrlResult(null);
  }, []);

  const handleSendSlack = useCallback(async () => {
    if (!urlResult || urlResult.status === 'error') return;

    await sendSlackNotification({
      title: urlResult.title,
      url: urlResult.url,
      one_liner: urlResult.one_liner,
      full_summary: urlResult.full_summary,
      key_points: urlResult.key_points,
      category: urlResult.category,
      readTime: urlResult.readTime,
    });
  }, [urlResult]);

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
          Capture thoughts. Let AI organize.
        </p>
      </header>

      {/* Capture Input */}
      <div className="mb-8 animate-fade-up delay-1" style={{ opacity: 0 }}>
        <CaptureInput
          onSubmit={handleCapture}
          onUrlSubmit={handleUrlCapture}
          isLoading={isLoading}
        />
      </div>

      {/* URL Summary Card */}
      {urlResult && (
        <div className="mb-8 animate-fade-up">
          <LinkSummaryCard
            result={urlResult}
            onDismiss={handleUrlDismiss}
            onSendSlack={handleSendSlack}
          />
        </div>
      )}

      {/* Confirmation Card */}
      {confirmation?.show && !urlResult && (
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
      {!confirmation?.show && !urlResult && (
        <div className="animate-fade-up delay-2 glass-card p-5" style={{ opacity: 0 }}>
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-cyan-dim)] text-xs">
              💡
            </span>
            Examples
          </h2>
          <div className="space-y-3">
            {[
              { text: 'Follow up with Sarah next week', category: 'People' },
              { text: 'Build landing page for new project', category: 'Project' },
              { text: 'Great quote from the podcast today', category: 'Idea' },
              { text: 'Pay electricity bill by Friday', category: 'Admin' },
              { text: 'https://example.com/article', category: 'Link' },
            ].map((example, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-[var(--bg-elevated)] px-3 py-2"
              >
                <span className="text-sm text-[var(--text-secondary)]">&ldquo;{example.text}&rdquo;</span>
                <span className={`text-xs font-medium ${example.category === 'Link' ? 'text-[#10b981]' : 'text-[var(--text-muted)]'}`}>
                  {example.category}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
