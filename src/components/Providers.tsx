'use client';

import { ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';
import { ToastProvider } from './Toast';
import { ErrorBoundary } from './ErrorBoundary';
import { QuickCapture } from './QuickCapture';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          {children}
          <QuickCapture />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
