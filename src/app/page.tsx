'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { CaptureInput } from '@/features/capture/components/CaptureInput';
import { ConfirmCard } from '@/features/capture/components/ConfirmCard';
import { LinkSummaryCard } from '@/features/reading/components/LinkSummaryCard';
import { captureThought, recategorize, processUrl } from '@/lib/api';
import { getPendingItems, syncQueue } from '@/lib/offline-queue';
import type { Category, ConfirmationState, UrlProcessResult } from '@/lib/types';

// Progress stages for URL processing
const URL_STAGES = [
  'Detecting content type...',
  'Fetching transcript...',
  'Analyzing with AI...',
  'Creating entry...',
];

export default function CapturePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [urlResult, setUrlResult] = useState<UrlProcessResult | null>(null);
  const [lastText, setLastText] = useState('');
  const [processingStage, setProcessingStage] = useState(0);
  const [isUrlProcessing, setIsUrlProcessing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Check offline queue on mount and on reconnect
  useEffect(() => {
    async function checkQueue() {
      try {
        const pending = await getPendingItems();
        setPendingCount(pending.length);
      } catch {
        // IndexedDB not available
      }
    }
    checkQueue();

    async function handleOnline() {
      const pending = await getPendingItems();
      if (pending.length > 0) {
        setIsSyncing(true);
        const result = await syncQueue();
        setPendingCount(result.failed);
        setIsSyncing(false);
      }
    }

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const handleCapture = useCallback(async (text: string, reminderDate?: string) => {
    setIsLoading(true);
    setLastText(text);

    try {
      const response = await captureThought(text, reminderDate);

      // Check for offline save
      if ('offline' in response && response.offline) {
        setPendingCount(p => p + 1);
        setConfirmation({
          show: true,
          text,
          category: 'Admin',
          confidence: 0,
          page_id: undefined,
        });
      } else if (response.status === 'captured' && response.category) {
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
      {/* Offline sync banner */}
      {pendingCount > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-4 py-2.5 text-sm text-yellow-400">
          {isSyncing ? (
            <>
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
              <span>Syncing {pendingCount} pending item{pendingCount !== 1 ? 's' : ''}...</span>
            </>
          ) : (
            <>
              <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <span>{pendingCount} item{pendingCount !== 1 ? 's' : ''} pending sync</span>
            </>
          )}
        </div>
      )}

      {/* Header - zen styling */}
      <header className="mb-10 animate-fade-up">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Capture
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]/70">
          Thoughts become knowledge
        </p>
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
