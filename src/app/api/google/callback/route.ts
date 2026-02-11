import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { storeRefreshToken } from '@/services/google/auth';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/google/callback`
  : 'http://localhost:3000/api/google/callback';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/digest?google=error', request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/digest?google=error', request.url));
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const storedState = cookieStore.get('google_oauth_state')?.value;
  cookieStore.delete('google_oauth_state');

  if (state !== storedState) {
    return NextResponse.redirect(new URL('/digest?google=error', request.url));
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL('/digest?google=error', request.url));
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    console.error('Google token exchange failed:', await tokenRes.text());
    return NextResponse.redirect(new URL('/digest?google=error', request.url));
  }

  const tokens = await tokenRes.json();

  if (!tokens.refresh_token) {
    console.error('No refresh token received. User may need to re-consent.');
    return NextResponse.redirect(new URL('/digest?google=error', request.url));
  }

  await storeRefreshToken(tokens.refresh_token);

  return NextResponse.redirect(new URL('/digest?google=connected', request.url));
}
