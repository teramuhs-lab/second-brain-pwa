'use client';

import { ReactNode } from 'react';
import { ToastProvider } from './Toast';
import { ErrorBoundary } from './ErrorBoundary';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        {children}
      </ToastProvider>
    </ErrorBoundary>
  );
}
