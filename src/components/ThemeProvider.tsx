'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'system' | 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  // Initialize from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored && ['system', 'light', 'dark'].includes(stored)) {
      setTheme(stored);
    }

    // Set initial resolved theme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'light') {
      setResolvedTheme('light');
    } else if (stored === 'dark') {
      setResolvedTheme('dark');
    } else {
      setResolvedTheme(prefersDark ? 'dark' : 'light');
    }
  }, []);

  // Apply theme class and update meta tag when theme changes
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let isDark: boolean;

    if (theme === 'light') {
      root.classList.add('light');
      isDark = false;
    } else if (theme === 'dark') {
      root.classList.add('dark');
      isDark = true;
    } else {
      // System preference - no class needed, CSS media query handles it
      isDark = prefersDark;
    }

    setResolvedTheme(isDark ? 'dark' : 'light');
    localStorage.setItem('theme', theme);

    // Update theme-color meta tag for PWA status bar
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDark ? '#2d2d3a' : '#f5f5f0');
    }
  }, [theme]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      if (theme === 'system') {
        setResolvedTheme(e.matches ? 'dark' : 'light');
        // Update theme-color meta tag
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
          meta.setAttribute('content', e.matches ? '#2d2d3a' : '#f5f5f0');
        }
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
