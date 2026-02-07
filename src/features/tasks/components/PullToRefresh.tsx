'use client';

import { useState, useRef, useCallback, ReactNode } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const currentDistance = useRef(0); // Track actual distance for threshold check

  const threshold = 60; // Lowered for easier triggering
  const maxPull = 100;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isRefreshing) return;

    // Check window scroll position (page scrolls, not container)
    const isAtTop = window.scrollY <= 0;

    if (isAtTop) {
      startY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    if (diff > 0 && window.scrollY <= 0) {
      // Prevent browser's default pull-to-refresh
      e.preventDefault();
      // Apply resistance to pull
      const distance = Math.min(diff * 0.5, maxPull);
      currentDistance.current = distance; // Track in ref for accurate threshold check
      setPullDistance(distance);
    } else if (diff < 0) {
      // User is scrolling down, stop the pull
      isPulling.current = false;
      currentDistance.current = 0;
      setPullDistance(0);
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    // Use ref for accurate threshold check (state may be stale)
    const reachedThreshold = currentDistance.current >= threshold;
    currentDistance.current = 0;

    if (reachedThreshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(40); // Keep indicator visible during refresh

      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isRefreshing, onRefresh]);

  const progress = Math.min(pullDistance / threshold, 1);

  const reachedThreshold = pullDistance >= threshold;

  return (
    <div
      ref={containerRef}
      className="relative overflow-visible"
      style={{ touchAction: pullDistance > 0 ? 'none' : 'auto' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator - fixed at top center */}
      {pullDistance > 0 && (
        <div
          className="fixed left-1/2 z-50 flex flex-col items-center pointer-events-none"
          style={{
            top: Math.max(10, pullDistance - 30),
            transform: 'translateX(-50%)',
          }}
        >
          <div
            className={`w-10 h-10 rounded-full border-3 flex items-center justify-center bg-[var(--bg-base)] ${
              isRefreshing
                ? 'animate-spin border-[var(--accent-cyan)]'
                : reachedThreshold
                  ? 'border-green-500'
                  : 'border-[var(--accent-cyan)]'
            }`}
            style={{
              borderTopColor: isRefreshing ? 'transparent' : undefined,
              borderWidth: '3px',
            }}
          >
            {isRefreshing ? (
              <span className="text-[var(--accent-cyan)]">↻</span>
            ) : reachedThreshold ? (
              <span className="text-green-500 text-lg">✓</span>
            ) : (
              <span className="text-[var(--accent-cyan)]">↓</span>
            )}
          </div>
          <span className={`text-xs mt-1 ${reachedThreshold ? 'text-green-500' : 'text-[var(--text-muted)]'}`}>
            {isRefreshing ? 'Refreshing...' : reachedThreshold ? 'Release!' : 'Pull down'}
          </span>
        </div>
      )}

      {/* Content */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling.current ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}
