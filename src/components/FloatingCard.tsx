'use client';

import { useRef, useEffect, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface FloatingCardProps {
  isOpen: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}

export function FloatingCard({ isOpen, anchorRef, onClose, children }: FloatingCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    arrowLeft: 0,
    side: 'bottom' as 'top' | 'bottom'
  });

  // Mount check for SSR
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate position when opened
  useEffect(() => {
    if (!isOpen || !anchorRef.current || !mounted) return;

    const calculatePosition = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;

      const cardHeight = 320; // Estimated height
      const cardWidth = Math.min(320, window.innerWidth - 32);
      const padding = 12;
      const navHeight = 80; // Bottom nav

      // Try bottom placement first
      let top = anchor.bottom + padding;
      let side: 'top' | 'bottom' = 'bottom';

      // If overflows bottom, place above
      if (top + cardHeight > window.innerHeight - navHeight) {
        top = anchor.top - cardHeight - padding;
        side = 'top';

        // If still overflows top, position at top of viewport
        if (top < 20) {
          top = 20;
        }
      }

      // Center horizontally relative to anchor, clamp to viewport
      let left = anchor.left + anchor.width / 2 - cardWidth / 2;
      left = Math.max(16, Math.min(left, window.innerWidth - cardWidth - 16));

      // Arrow position relative to card
      const arrowLeft = anchor.left + anchor.width / 2 - left;

      setPosition({
        top,
        left,
        arrowLeft: Math.max(24, Math.min(arrowLeft, cardWidth - 24)),
        side
      });
    };

    calculatePosition();

    // Recalculate on scroll or resize
    window.addEventListener('resize', calculatePosition);
    window.addEventListener('scroll', calculatePosition, true);

    return () => {
      window.removeEventListener('resize', calculatePosition);
      window.removeEventListener('scroll', calculatePosition, true);
    };
  }, [isOpen, anchorRef, mounted]);

  // Close on outside click/touch
  useEffect(() => {
    if (!isOpen || !mounted) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        cardRef.current &&
        !cardRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    };

    // Small delay to prevent immediate close on open
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose, anchorRef, mounted]);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <>
      {/* Invisible backdrop for catching outside clicks */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Floating Card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        className="fixed z-50 w-[calc(100vw-32px)] max-w-[320px] rounded-2xl shadow-2xl overflow-hidden"
        style={{
          top: position.top,
          left: position.left,
          background: 'rgba(26, 26, 36, 0.98)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          animation: 'floatIn 0.2s ease-out'
        }}
      >
        {/* Arrow pointer */}
        <div
          className="absolute w-4 h-4 rotate-45"
          style={{
            left: position.arrowLeft - 8,
            [position.side === 'bottom' ? 'top' : 'bottom']: -8,
            background: 'rgba(26, 26, 36, 0.98)',
            borderLeft: position.side === 'bottom' ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
            borderTop: position.side === 'bottom' ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
            borderRight: position.side === 'top' ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
            borderBottom: position.side === 'top' ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
          }}
        />

        {/* Content */}
        <div className="relative z-10 p-4">
          {children}
        </div>
      </div>

      <style jsx global>{`
        @keyframes floatIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(${position.side === 'bottom' ? '-8px' : '8px'});
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </>,
    document.body
  );
}
