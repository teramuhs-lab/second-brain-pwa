// Google Calendar API operations

import { getAccessToken, getSelectedCalendarIds } from './auth';
import type { CalendarEvent, CalendarListResponse } from './types';

// ============= Timezone helpers =============

let cachedTimezone: string | null = null;

async function getUserTimezone(): Promise<string> {
  if (process.env.USER_TIMEZONE) return process.env.USER_TIMEZONE;
  if (cachedTimezone) return cachedTimezone;

  try {
    const accessToken = await getAccessToken();
    if (accessToken) {
      const res = await fetch(
        'https://www.googleapis.com/calendar/v3/users/me/settings/timezone',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        cachedTimezone = data.value;
        return cachedTimezone!;
      }
    }
  } catch {
    // Fall through to default
  }
  return 'UTC';
}

function getLocalDateStr(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTimezoneOffsetStr(tz: string): string {
  const now = new Date();
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = now.toLocaleString('en-US', { timeZone: tz });
  const diffMinutes = (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000;
  const sign = diffMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(diffMinutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function midnightRFC3339(dateStr: string, tz: string): string {
  return `${dateStr}T00:00:00${getTimezoneOffsetStr(tz)}`;
}

// ============= API functions =============

export async function fetchCalendarList(): Promise<Array<{ id: string; summary: string; primary: boolean }>> {
  const accessToken = await getAccessToken();
  if (!accessToken) return [];

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    console.error('CalendarList fetch error:', res.status, await res.text());
    return [];
  }
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.items || [])
    .filter((cal: any) => cal.selected !== false)
    .map((cal: any) => ({ id: cal.id, summary: cal.summary || cal.id, primary: !!cal.primary }));
}

export async function fetchCalendarEvents(
  timeMin: string,
  timeMax: string,
  calendarId: string = 'primary',
  timeZone?: string
): Promise<CalendarEvent[]> {
  const accessToken = await getAccessToken();
  if (!accessToken) return [];

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '20',
  });
  if (timeZone) params.set('timeZone', timeZone);

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    console.error('Calendar fetch error:', await res.text());
    return [];
  }

  const data: CalendarListResponse = await res.json();
  return data.items || [];
}

async function fetchSelectedCalendarsEvents(
  timeMin: string,
  timeMax: string,
  timeZone?: string
): Promise<CalendarEvent[]> {
  const selectedIds = await getSelectedCalendarIds();
  if (selectedIds.length === 0) return fetchCalendarEvents(timeMin, timeMax, 'primary', timeZone);

  // Only need calendar names if multiple calendars selected
  let calendarMap = new Map<string, string>();
  if (selectedIds.length > 1) {
    const allCalendars = await fetchCalendarList();
    calendarMap = new Map(allCalendars.map(c => [c.id, c.summary]));
  }

  const allEvents = await Promise.all(
    selectedIds.map(async (calId) => {
      const events = await fetchCalendarEvents(timeMin, timeMax, calId, timeZone);
      return events.map(e => ({
        ...e,
        calendarId: calId,
        calendarName: calendarMap.get(calId) || calId,
      }));
    })
  );

  return allEvents.flat().sort((a, b) => {
    const aTime = a.start.dateTime || a.start.date || '';
    const bTime = b.start.dateTime || b.start.date || '';
    return aTime.localeCompare(bTime);
  });
}

export async function fetchTodaysEvents(): Promise<CalendarEvent[]> {
  const tz = await getUserTimezone();
  const today = getLocalDateStr(tz);
  const tomorrow = addDays(today, 1);
  return fetchSelectedCalendarsEvents(midnightRFC3339(today, tz), midnightRFC3339(tomorrow, tz), tz);
}

export async function fetchTomorrowsEvents(): Promise<CalendarEvent[]> {
  const tz = await getUserTimezone();
  const today = getLocalDateStr(tz);
  const tomorrow = addDays(today, 1);
  const dayAfter = addDays(today, 2);
  return fetchSelectedCalendarsEvents(midnightRFC3339(tomorrow, tz), midnightRFC3339(dayAfter, tz), tz);
}

export async function fetchWeekEvents(): Promise<CalendarEvent[]> {
  const tz = await getUserTimezone();
  const today = getLocalDateStr(tz);
  const weekEnd = addDays(today, 7);
  return fetchSelectedCalendarsEvents(midnightRFC3339(today, tz), midnightRFC3339(weekEnd, tz), tz);
}

export async function createCalendarEvent(event: {
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  timeZone?: string;
}): Promise<CalendarEvent> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Not authenticated with Google');

  const body: Record<string, unknown> = {
    summary: event.summary,
    start: { dateTime: event.start, timeZone: event.timeZone },
    end: { dateTime: event.end, timeZone: event.timeZone },
  };
  if (event.description) body.description = event.description;
  if (event.location) body.location = event.location;

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Calendar API error: ${res.status} - ${error}`);
  }

  return res.json();
}

export async function deleteCalendarEvent(eventId: string, calendarId: string = 'primary'): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Not authenticated with Google');

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok && res.status !== 204) {
    const error = await res.text();
    throw new Error(`Calendar API error: ${res.status} - ${error}`);
  }
}
