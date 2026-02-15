'use client';

export function DigestSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 bg-[var(--bg-elevated)] rounded w-3/4" />
      <div className="h-4 bg-[var(--bg-elevated)] rounded w-full" />
      <div className="h-4 bg-[var(--bg-elevated)] rounded w-5/6" />
      <div className="h-4 bg-[var(--bg-elevated)] rounded w-2/3" />
      <div className="h-8" />
      <div className="h-4 bg-[var(--bg-elevated)] rounded w-1/2" />
      <div className="h-4 bg-[var(--bg-elevated)] rounded w-full" />
      <div className="h-4 bg-[var(--bg-elevated)] rounded w-4/5" />
    </div>
  );
}
