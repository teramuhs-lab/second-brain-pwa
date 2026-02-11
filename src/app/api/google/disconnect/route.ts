import { NextResponse } from 'next/server';
import { removeRefreshToken } from '@/services/google/auth';

export async function POST() {
  try {
    await removeRefreshToken();
    return NextResponse.json({ status: 'disconnected' });
  } catch (error) {
    console.error('Google disconnect error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
