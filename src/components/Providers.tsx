'use client';

import { ReactNode } from 'react';
import { ToastProvider } from './Toast';
import { ErrorBoundary } from './ErrorBoundary';
import { QuickCapture } from './QuickCapture';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        {children}
        <QuickCapture />
      </ToastProvider>
    </ErrorBoundary>
  );
}
