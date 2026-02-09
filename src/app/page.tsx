'use client';

import { useState, useCallback, useRef } from 'react';
import { CaptureInput } from '@/components/CaptureInput';
import { ConfirmCard } from '@/components/ConfirmCard';
import { LinkSummaryCard } from '@/components/LinkSummaryCard';
import { ThemeToggle } from '@/components/ThemeToggle';
import { captureThought, recategorize, processUrl, sendSlackNotification } from '@/lib/api';
import type { Category, ConfirmationState, UrlProcessResult } from '@/lib/types';

// Progress stages for URL processing
const URL_STAGES = [
  'Detecting content type...',
  'Fetching transcript...',
  'Analyzing with AI...',
  'Creating Notion entry...',
];

export default function CapturePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [urlResult, setUrlResult] = useState<UrlProcessResult | null>(null);
  const [lastText, setLastText] = useState('');
  const [processingStage, setProcessingStage] = useState(0);
  const [isUrlProcessing, setIsUrlProcessing] = useState(false);

  const handleCapture = useCallback(async (text: string, reminderDate?: string) => {
    setIsLoading(true);
    setLastText(text);

    try {
      const response = await captureThought(text, reminderDate);

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
    setIsUrlProcessing(true);
    setConfirmation(null);
    setUrlResult(null);
    setProcessingStage(0);

    // Start progress animation
    const stageInterval = setInterval(() => {
      setProcessingStage((prev) => Math.min(prev + 1, URL_STAGES.length - 1));
    }, 8000);

    try {
      const result = await processUrl(url);
      clearInterval(stageInterval);
      setUrlResult(result);
    } catch (error) {
      clearInterval(stageInterval);
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
      setIsUrlProcessing(false);
      setProcessingStage(0);
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
      category: urlResult.category,
      readTime: urlResult.readTime,
      // Rich summary fields
      tldr: urlResult.tldr,
      key_takeaways: urlResult.key_takeaways,
      action_items: urlResult.action_items,
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
      {/* Header - zen styling */}
      <header className="mb-10 animate-fade-up">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              Capture
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]/70">
              Thoughts become knowledge
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Capture Input */}
      <div className="mb-8 animate-fade-up delay-1">
        <CaptureInput
          onSubmit={handleCapture}
          onUrlSubmit={handleUrlCapture}
          isLoading={isLoading}
        />
      </div>

      {/* URL Processing Progress - zen styling */}
      {isUrlProcessing && !urlResult && (
        <div className="mb-8 animate-fade-up rounded-xl bg-[var(--bg-surface)]/50 border border-[var(--border-subtle)]/50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <svg className="h-5 w-5 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-[var(--text-primary)]">Processing</h3>
              <p className="text-xs text-[var(--text-muted)]/60">This may take a moment</p>
            </div>
          </div>

          {/* Progress bar - muted */}
          <div className="h-1 w-full rounded-full bg-[var(--bg-elevated)] overflow-hidden mb-3">
            <div
              className="h-full bg-[var(--text-muted)]/40 transition-all duration-1000 ease-out"
              style={{ width: `${((processingStage + 1) / URL_STAGES.length) * 100}%` }}
            />
          </div>

          {/* Stage text - subtle */}
          <p className="text-xs text-[var(--text-muted)]/60">
            {URL_STAGES[processingStage]}
          </p>
        </div>
      )}

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

      {/* Quick tips - zen styling */}
      {!confirmation?.show && !urlResult && (
        <div className="animate-fade-up delay-2 pt-8">
          <p className="text-sm text-[var(--text-muted)]/60 mb-3">Try saying...</p>
          <div className="space-y-2.5">
            {[
              'Follow up with Sarah next week',
              'Build landing page for new project',
              'Great insight from the podcast',
              'Pay electricity bill by Friday',
            ].map((example, i) => (
              <p
                key={i}
                className="text-base text-[var(--text-secondary)]/80"
              >
                &ldquo;{example}&rdquo;
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
