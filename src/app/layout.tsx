import type { Metadata, Viewport } from 'next';
import { Nav } from '@/components/Nav';
import { Providers } from '@/components/Providers';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#1a1a24',
};

export const metadata: Metadata = {
  title: 'Second Brain',
  description: 'AI-powered personal knowledge management',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Second Brain',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        {/* Theme flash prevention - runs before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('theme');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

                  if (stored === 'light' || (!stored && !prefersDark)) {
                    document.documentElement.classList.add('light');
                  } else if (stored === 'dark') {
                    document.documentElement.classList.add('dark');
                  }

                  // Update theme-color meta tag
                  var isDark = stored === 'dark' || (stored !== 'light' && prefersDark);
                  var meta = document.querySelector('meta[name="theme-color"]');
                  if (meta) {
                    meta.setAttribute('content', isDark ? '#1a1a24' : '#f5f5f0');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <Providers>
          <div className="min-h-screen pb-24">
            {children}
          </div>
          <Nav />
        </Providers>
      </body>
    </html>
  );
}
