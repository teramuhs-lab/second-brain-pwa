import { NextRequest, NextResponse } from 'next/server';

const API_SECRET = process.env.API_SECRET;

/** POST /api/auth — Login: set auth cookie */
export async function POST(request: NextRequest) {
  if (!API_SECRET) {
    return NextResponse.json({ status: 'error', error: 'Auth not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const password = body?.password;

  if (!password || password !== API_SECRET) {
    return NextResponse.json({ status: 'error', error: 'Invalid password' }, { status: 401 });
  }

  const response = NextResponse.json({ status: 'ok' });
  response.cookies.set('sb_auth', API_SECRET, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
}

/** DELETE /api/auth — Logout: clear auth cookie */
export async function DELETE() {
  const response = NextResponse.json({ status: 'ok' });
  response.cookies.delete('sb_auth');
  return response;
}
