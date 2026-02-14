'use client';

import { ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';
import { ToastProvider } from '@/shared/components/Toast';
import { ErrorBoundary } from './ErrorBoundary';
import { QuickCapture } from '@/features/capture/components/QuickCapture';

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
