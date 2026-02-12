import { NextResponse } from 'next/server';
import { isGoogleConnected, getSelectedCalendarIds, setSelectedCalendarIds } from '@/services/google/auth';
import { fetchCalendarList } from '@/services/google/calendar';

// GET — List available calendars with selection state
export async function GET() {
  const connected = await isGoogleConnected();
  if (!connected) {
    return NextResponse.json({ connected: false, calendars: [] });
  }

  try {
    const [allCalendars, selectedIds] = await Promise.all([
      fetchCalendarList(),
      getSelectedCalendarIds(),
    ]);

    const selectedSet = new Set(selectedIds);
    const calendars = allCalendars.map(cal => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary,
      enabled: selectedSet.has(cal.id) || (cal.primary && selectedSet.has('primary')),
    }));

    return NextResponse.json({ connected: true, calendars });
  } catch {
    return NextResponse.json({ connected: true, calendars: [], error: 'Failed to fetch calendars' });
  }
}

// POST — Update selected calendar IDs
export async function POST(req: Request) {
  const connected = await isGoogleConnected();
  if (!connected) {
    return NextResponse.json({ success: false, error: 'Not connected' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const calendarIds: string[] = body.calendarIds;

    if (!Array.isArray(calendarIds) || calendarIds.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one calendar must be selected' }, { status: 400 });
    }

    await setSelectedCalendarIds(calendarIds);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
  }
}
