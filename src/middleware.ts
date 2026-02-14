import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

const API_SECRET = process.env.API_SECRET;

// Routes that handle their own auth
const EXEMPT_ROUTES = [
  '/api/auth',
  '/api/google/callback',
  '/api/telegram/webhook',
  '/api/cron/daily-email',
];

// AI-heavy routes get stricter rate limits
const AI_ROUTES = ['/api/agent', '/api/agent/research', '/api/search', '/api/digest', '/api/process-url'];

function isExempt(pathname: string): boolean {
  return EXEMPT_ROUTES.some(r => pathname.startsWith(r));
}

function isAIRoute(pathname: string): boolean {
  return AI_ROUTES.some(r => pathname.startsWith(r));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /api/* routes
  if (!pathname.startsWith('/api/')) {
    // For non-API routes, redirect to /login if not authenticated (and not already on /login)
    if (API_SECRET && pathname !== '/login') {
      const authCookie = request.cookies.get('sb_auth')?.value;
      if (authCookie !== API_SECRET) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
    }
    return NextResponse.next();
  }

  // Skip auth for exempt routes
  if (isExempt(pathname)) {
    return NextResponse.next();
  }

  // Auth check (only if API_SECRET is configured)
  if (API_SECRET) {
    // Check bearer token (for external API calls)
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // Check cookie (for browser/same-origin requests)
    const authCookie = request.cookies.get('sb_auth')?.value;

    if (bearerToken !== API_SECRET && authCookie !== API_SECRET) {
      return NextResponse.json(
        { status: 'error', error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  // Rate limiting
  const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateKey = `${clientIP}:${pathname}`;

  const maxRequests = isAIRoute(pathname) ? 10 : 60;
  const windowMs = 60_000; // 1 minute

  const result = checkRateLimit(rateKey, maxRequests, windowMs);

  if (!result.allowed) {
    return NextResponse.json(
      { status: 'error', error: 'Too many requests. Try again shortly.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(result.resetMs / 1000)),
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  return response;
}

export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
    // Match all pages except static assets and login
    '/((?!_next/static|_next/image|favicon|manifest|icons|apple-touch-icon|login).*)',
  ],
};
