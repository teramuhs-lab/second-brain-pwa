import { NextResponse } from 'next/server';
import { isGoogleConnected } from '@/services/google/auth';

export async function GET() {
  const connected = await isGoogleConnected();
  return NextResponse.json({ connected });
}
