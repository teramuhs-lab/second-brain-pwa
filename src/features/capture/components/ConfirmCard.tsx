'use client';

import { useEffect, useState } from 'react';
import type { Category } from '@/lib/types';
import { CategoryButtons } from './CategoryButtons';

interface ConfirmCardProps {
  text: string;
  category: Category;
  confidence: number;
  pageId?: string;
  onRecategorize: (newCategory: Category | 'Ignore') => Promise<void>;
  onDismiss: () => void;
  autoDismiss?: number;
}

export function ConfirmCard({
  text,
  category,
  confidence,
  onRecategorize,
  onDismiss,
  autoDismiss = 5000,
}: ConfirmCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(autoDismiss / 1000);

  // Countdown timer
  useEffect(() => {
    if (autoDismiss <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [autoDismiss]);

  // Auto-dismiss when timer reaches 0
  useEffect(() => {
    if (timeLeft === 0 && autoDismiss > 0) {
      onDismiss();
    }
  }, [timeLeft, autoDismiss, onDismiss]);

  const handleRecategorize = async (newCategory: Category | 'Ignore') => {
    if (newCategory === category) {
      onDismiss();
      return;
    }

    setIsLoading(true);
    try {
      await onRecategorize(newCategory);
    } finally {
      setIsLoading(false);
    }
  };

  const confidencePercent = Math.round(confidence * 100);
  const confidenceLevel = confidence >= 0.8 ? 'high' : confidence >= 0.6 ? 'medium' : 'low';
  const confidenceColor = {
    high: 'text-[var(--accent-green)]',
    medium: 'text-yellow-400',
    low: 'text-[var(--accent-red)]',
  }[confidenceLevel];

  const categoryIcon = {
    People: '👤',
    Project: '🚀',
    Idea: '💡',
    Admin: '📋',
  }[category];

  return (
    <div className="animate-scale-in glass-card aurora-border p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-elevated)] text-xl">
            {categoryIcon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--text-secondary)]">Captured as</span>
              <span className="font-semibold text-[var(--text-primary)]">{category}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="confidence-meter w-16">
                <div
                  className={`confidence-fill confidence-${confidenceLevel}`}
                  style={{ width: `${confidencePercent}%` }}
                />
              </div>
              <span className={`text-xs font-medium ${confidenceColor}`}>
                {confidencePercent}%
              </span>
            </div>
          </div>
        </div>

        {/* Countdown timer */}
        {autoDismiss > 0 && (
          <button
            onClick={onDismiss}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-xs font-mono text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            {timeLeft}
          </button>
        )}
      </div>

      {/* Original text */}
      <div className="mb-5 rounded-xl bg-[var(--bg-deep)]/50 p-3">
        <p className="line-clamp-2 text-sm text-[var(--text-secondary)] italic">
          &ldquo;{text}&rdquo;
        </p>
      </div>

      {/* Category buttons */}
      <div className="flex items-center justify-between">
        <CategoryButtons
          selected={category}
          onSelect={handleRecategorize}
          disabled={isLoading}
        />
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-[var(--bg-deep)]/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <div className="spinner" />
            <span>Moving...</span>
          </div>
        </div>
      )}
    </div>
  );
}
