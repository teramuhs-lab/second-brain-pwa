'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';

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
  const currentDistance = useRef(0);

  const threshold = 60;
  const maxPull = 100;

  // Use refs to store latest values for event handlers
  const isRefreshingRef = useRef(isRefreshing);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;

      const isAtTop = window.scrollY <= 0;
      if (isAtTop) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || isRefreshingRef.current) return;

      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;

      if (diff > 0 && window.scrollY <= 0) {
        e.preventDefault(); // This works because we use { passive: false }
        const distance = Math.min(diff * 0.5, maxPull);
        currentDistance.current = distance;
        setPullDistance(distance);
      } else if (diff < 0) {
        isPulling.current = false;
        currentDistance.current = 0;
        setPullDistance(0);
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling.current) return;
      isPulling.current = false;

      const reachedThreshold = currentDistance.current >= threshold;
      currentDistance.current = 0;

      if (reachedThreshold && !isRefreshingRef.current) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);
        setPullDistance(40);

        try {
          await onRefreshRef.current();
        } finally {
          isRefreshingRef.current = false;
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    };

    // Add event listeners with { passive: false } to allow preventDefault
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  const progress = Math.min(pullDistance / threshold, 1);

  const reachedThreshold = pullDistance >= threshold;

  return (
    <div
      ref={containerRef}
      className="relative overflow-visible"
      style={{ touchAction: pullDistance > 0 ? 'none' : 'pan-y' }}
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
