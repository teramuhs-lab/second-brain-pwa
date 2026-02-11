'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/components/ThemeProvider';

type GoogleStatus = boolean | null; // null = loading

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [googleConnected, setGoogleConnected] = useState<GoogleStatus>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  useEffect(() => {
    fetch('/api/google/status')
      .then((r) => r.json())
      .then((data) => setGoogleConnected(data.connected))
      .catch(() => setGoogleConnected(false));
  }, []);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await fetch('/api/google/disconnect', { method: 'POST' });
      setGoogleConnected(false);
    } catch {
      // silently fail
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-5 pt-8 pb-24">
      {/* Header */}
      <header className="mb-8 animate-fade-up">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--text-muted)]/70">Preferences</p>
      </header>

      {/* Appearance */}
      <section className="mb-10 animate-fade-up delay-1">
        <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
          Appearance
        </p>
        <div className="flex rounded-xl bg-[var(--bg-elevated)] p-1 gap-1">
          {(['system', 'light', 'dark'] as const).map((t) => {
            const isActive = theme === t;
            const label = t === 'system' ? 'Auto' : t === 'light' ? 'Light' : 'Dark';
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Connections */}
      <section className="animate-fade-up delay-2">
        <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
          Connections
        </p>
        <div className="rounded-xl bg-[var(--bg-elevated)] overflow-hidden">
          {/* Header row */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-primary)]">Google</span>
              {googleConnected === null ? (
                <span className="text-xs text-[var(--text-muted)]">Checking...</span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  {googleConnected ? 'Connected' : 'Not connected'}
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      googleConnected ? 'bg-[var(--accent-green)]' : 'bg-[var(--text-muted)]/40'
                    }`}
                  />
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)]/70 mt-0.5">
              {googleConnected
                ? 'Calendar & Gmail (read-only)'
                : 'See your schedule and search emails'}
            </p>
          </div>

          {/* Divider */}
          <div className="mx-4 border-t border-[var(--border-subtle)]" />

          {/* Action rows */}
          {googleConnected ? (
            <>
              <a
                href="/api/google/auth"
                className="flex items-center justify-between px-4 py-3 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors"
              >
                Switch account
                <svg
                  className="h-4 w-4 text-[var(--text-muted)]/50"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </a>
              <div className="mx-4 border-t border-[var(--border-subtle)]" />
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="flex w-full items-center justify-between px-4 py-3 text-sm text-[var(--accent-red)] hover:bg-[var(--bg-surface)] transition-colors disabled:opacity-50"
              >
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                <svg
                  className="h-4 w-4 text-[var(--accent-red)]/50"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </>
          ) : googleConnected === false ? (
            <a
              href="/api/google/auth"
              className="flex items-center justify-between px-4 py-3 text-sm text-[var(--accent-cyan)] hover:bg-[var(--bg-surface)] transition-colors"
            >
              Connect
              <svg
                className="h-4 w-4 text-[var(--accent-cyan)]/50"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </a>
          ) : null}
        </div>
      </section>
    </div>
  );
}
