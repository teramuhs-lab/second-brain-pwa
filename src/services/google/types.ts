// Google service types

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  htmlLink: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType: string;
      uri: string;
      label?: string;
    }>;
  };
  calendarId?: string;
  calendarName?: string;
}

export interface CalendarListResponse {
  items: CalendarEvent[];
  nextPageToken?: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body?: string;
}

export interface GmailListResponse {
  messages: Array<{ id: string; threadId: string }>;
  resultSizeEstimate: number;
}
