import { NextResponse } from 'next/server';
import { isGoogleConnected } from '@/services/google/auth';
import { fetchTodaysEvents } from '@/services/google/calendar';

export async function GET() {
  try {
    const connected = await isGoogleConnected();
    if (!connected) {
      return NextResponse.json({ connected: false, events: [] });
    }

    const events = await fetchTodaysEvents();
    return NextResponse.json(
      { connected: true, events },
      {
        headers: {
          'Cache-Control': 's-maxage=120, stale-while-revalidate=60',
        },
      }
    );
  } catch (error) {
    console.error('Calendar events error:', error);
    return NextResponse.json({ connected: true, events: [], error: 'Failed to fetch' });
  }
}
