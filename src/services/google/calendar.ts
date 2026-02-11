// Google Calendar API operations

import { getAccessToken } from './auth';
import type { CalendarEvent, CalendarListResponse } from './types';

export async function fetchCalendarEvents(
  timeMin: string,
  timeMax: string
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

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    console.error('Calendar fetch error:', await res.text());
    return [];
  }

  const data: CalendarListResponse = await res.json();
  return data.items || [];
}

export async function fetchTodaysEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  return fetchCalendarEvents(startOfDay.toISOString(), endOfDay.toISOString());
}

export async function fetchTomorrowsEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const endOfTomorrow = new Date(startOfTomorrow);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);

  return fetchCalendarEvents(startOfTomorrow.toISOString(), endOfTomorrow.toISOString());
}

export async function fetchWeekEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfWeek = new Date(startOfDay);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  return fetchCalendarEvents(startOfDay.toISOString(), endOfWeek.toISOString());
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

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Not authenticated with Google');

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
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
