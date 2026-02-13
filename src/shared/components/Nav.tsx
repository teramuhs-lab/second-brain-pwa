'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

// Primary tabs shown in bottom nav
const PRIMARY_ITEMS = [
  {
    href: '/',
    label: 'Capture',
    icon: (
      <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
  {
    href: '/tasks',
    label: 'Tasks',
    icon: (
      <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  {
    href: '/ask',
    label: 'Ask',
    icon: (
      <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 3L13.8 9.2L20 11L13.8 12.8L12 19L10.2 12.8L4 11L10.2 9.2L12 3Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/search',
    label: 'Search',
    icon: (
      <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    href: '/digest',
    label: 'Digest',
    icon: (
      <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
];

// Items tucked under the "More" menu
const MORE_ITEMS = [
  {
    href: '/reading',
    label: 'Read',
    description: 'Saved articles & reading list',
    icon: (
      <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    description: 'Connections & preferences',
    icon: (
      <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
];

const MORE_HREFS = MORE_ITEMS.map((item) => item.href);

export function Nav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close sheet on route change
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Close on Escape key
  useEffect(() => {
    if (!moreOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [moreOpen]);

  const closeSheet = useCallback(() => setMoreOpen(false), []);

  const isMoreActive = MORE_HREFS.includes(pathname);

  const navStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    background: 'var(--nav-bg)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderTop: '1px solid var(--nav-border)',
    paddingBottom: 'env(safe-area-inset-bottom, 0)',
    zIndex: 50,
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    width: '100%',
    height: '60px',
    maxWidth: '400px',
    margin: '0 auto',
  };

  const itemStyle: React.CSSProperties = {
    flex: '1 1 0%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    padding: '8px 0',
    textDecoration: 'none',
    transition: 'all 0.2s ease',
  };

  return (
    <>
      {/* Backdrop overlay */}
      {moreOpen && (
        <div
          onClick={closeSheet}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 49,
            animation: 'fadeIn 0.2s ease',
          }}
        />
      )}

      {/* Slide-up sheet */}
      {moreOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
            left: 0,
            right: 0,
            zIndex: 51,
            display: 'flex',
            justifyContent: 'center',
            padding: '0 16px',
            animation: 'slideUp 0.2s ease',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '400px',
              background: 'var(--nav-bg)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: '16px',
              border: '1px solid var(--nav-border)',
              overflow: 'hidden',
              marginBottom: '8px',
            }}
          >
            {MORE_ITEMS.map((item, i) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '14px 20px',
                    textDecoration: 'none',
                    color: isActive ? 'var(--nav-text-active)' : 'var(--nav-text)',
                    transition: 'all 0.15s ease',
                    borderBottom: i < MORE_ITEMS.length - 1 ? '1px solid var(--nav-border)' : 'none',
                  }}
                >
                  {item.icon}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: isActive ? 600 : 500,
                      letterSpacing: '0.01em',
                    }}>
                      {item.label}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      opacity: 0.5,
                      fontWeight: 400,
                    }}>
                      {item.description}
                    </span>
                  </div>
                  {isActive && (
                    <div style={{
                      marginLeft: 'auto',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'var(--nav-text-active)',
                    }} />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav style={navStyle}>
        <div style={containerStyle}>
          {PRIMARY_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  ...itemStyle,
                  color: isActive ? 'var(--nav-text-active)' : 'var(--nav-text)',
                  opacity: isActive ? 1 : 0.9,
                }}
              >
                {item.icon}
                <span style={{
                  fontSize: '10px',
                  fontWeight: isActive ? 500 : 400,
                  letterSpacing: '0.02em',
                }}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen((prev) => !prev)}
            style={{
              ...itemStyle,
              color: isMoreActive ? 'var(--nav-text-active)' : 'var(--nav-text)',
              opacity: isMoreActive ? 1 : 0.9,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
            </svg>
            <span style={{
              fontSize: '10px',
              fontWeight: isMoreActive ? 500 : 400,
              letterSpacing: '0.02em',
            }}>
              More
            </span>
          </button>
        </div>
      </nav>

      {/* Animations */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
