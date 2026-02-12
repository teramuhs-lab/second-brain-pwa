'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/components/ThemeProvider';

type GoogleStatus = boolean | null; // null = loading

interface CalendarInfo {
  id: string;
  summary: string;
  primary: boolean;
  enabled: boolean;
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [googleConnected, setGoogleConnected] = useState<GoogleStatus>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [calendarsLoading, setCalendarsLoading] = useState(false);

  useEffect(() => {
    fetch('/api/google/status')
      .then((r) => r.json())
      .then((data) => setGoogleConnected(data.connected))
      .catch(() => setGoogleConnected(false));
  }, []);

  // Fetch calendars when connected
  useEffect(() => {
    if (googleConnected !== true) return;
    setCalendarsLoading(true);
    fetch('/api/google/calendars')
      .then((r) => r.json())
      .then((data) => setCalendars(data.calendars || []))
      .catch(() => setCalendars([]))
      .finally(() => setCalendarsLoading(false));
  }, [googleConnected]);

  const handleToggleCalendar = async (calId: string, enabled: boolean) => {
    // Optimistic update
    const updated = calendars.map(c =>
      c.id === calId ? { ...c, enabled } : c
    );
    setCalendars(updated);

    const enabledIds = updated.filter(c => c.enabled).map(c => c.id);
    // Ensure primary is always included
    const primaryCal = calendars.find(c => c.primary);
    if (primaryCal && !enabledIds.includes(primaryCal.id)) {
      enabledIds.unshift(primaryCal.id);
    }

    try {
      await fetch('/api/google/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarIds: enabledIds }),
      });
    } catch {
      // Revert on failure
      setCalendars(calendars);
    }
  };

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

      {/* Calendars — only when Google is connected */}
      {googleConnected && (
        <section className="mt-8 animate-fade-up delay-3">
          <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Calendars
          </p>
          <div className="rounded-xl bg-[var(--bg-elevated)] overflow-hidden">
            {calendarsLoading ? (
              <div className="px-4 py-4">
                <p className="text-xs text-[var(--text-muted)]">Loading calendars...</p>
              </div>
            ) : calendars.length === 0 ? (
              <div className="px-4 py-4">
                <p className="text-xs text-[var(--text-muted)]">No calendars found</p>
              </div>
            ) : (
              calendars.map((cal, idx) => (
                <div key={cal.id}>
                  {idx > 0 && (
                    <div className="mx-4 border-t border-[var(--border-subtle)]" />
                  )}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-[var(--text-primary)] truncate block">
                        {cal.summary}
                      </span>
                      {cal.primary && (
                        <span className="text-[10px] text-[var(--text-muted)]">Primary</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleToggleCalendar(cal.id, !cal.enabled)}
                      disabled={cal.primary}
                      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                        cal.enabled
                          ? 'bg-[var(--accent-cyan)]'
                          : 'bg-[var(--text-muted)]/30'
                      } ${cal.primary ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          cal.enabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
