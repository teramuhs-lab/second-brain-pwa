// Google Tasks API operations (read-only)

import { getAccessToken } from './auth';
import type { GoogleTaskList, GoogleTaskListsResponse, GoogleTask, GoogleTasksResponse } from './types';

const TASKS_API_BASE = 'https://tasks.googleapis.com/tasks/v1';

/** Fetch all task lists for the authenticated user */
export async function fetchTaskLists(): Promise<GoogleTaskList[]> {
  const accessToken = await getAccessToken();
  if (!accessToken) return [];

  const res = await fetch(`${TASKS_API_BASE}/users/@me/lists`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('TaskLists fetch error:', res.status, errorText);
    if (res.status === 403 && errorText.includes('SERVICE_DISABLED')) {
      throw new Error('Google Tasks API is not enabled. Enable it in Google Cloud Console → APIs & Services → Enable "Google Tasks API".');
    }
    if (res.status === 403 || (res.status === 401 && errorText.includes('insufficient'))) {
      throw new Error('Google Tasks scope not authorized. Please reconnect Google from Settings to enable Tasks.');
    }
    return [];
  }

  const data: GoogleTaskListsResponse = await res.json();
  return data.items || [];
}

/** Fetch tasks from a specific task list */
export async function fetchTasks(
  taskListId: string,
  options?: {
    showCompleted?: boolean;
    showHidden?: boolean;
    maxResults?: number;
    dueMin?: string;
    dueMax?: string;
  }
): Promise<GoogleTask[]> {
  const accessToken = await getAccessToken();
  if (!accessToken) return [];

  const params = new URLSearchParams();
  if (options?.showCompleted !== undefined) {
    params.set('showCompleted', String(options.showCompleted));
  }
  if (options?.showHidden !== undefined) {
    params.set('showHidden', String(options.showHidden));
  }
  if (options?.maxResults) {
    params.set('maxResults', String(options.maxResults));
  }
  if (options?.dueMin) {
    params.set('dueMin', options.dueMin);
  }
  if (options?.dueMax) {
    params.set('dueMax', options.dueMax);
  }

  const queryString = params.toString();
  const url = `${TASKS_API_BASE}/lists/${encodeURIComponent(taskListId)}/tasks${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Tasks fetch error:', res.status, errorText);
    if (res.status === 403 && errorText.includes('SERVICE_DISABLED')) {
      throw new Error('Google Tasks API is not enabled. Enable it in Google Cloud Console → APIs & Services → Enable "Google Tasks API".');
    }
    if (res.status === 403 || (res.status === 401 && errorText.includes('insufficient'))) {
      throw new Error('Google Tasks scope not authorized. Please reconnect Google from Settings to enable Tasks.');
    }
    return [];
  }

  const data: GoogleTasksResponse = await res.json();
  return data.items || [];
}
