import { NextResponse } from 'next/server';
import { isGoogleConnected, getSelectedTaskListIds, setSelectedTaskListIds } from '@/services/google/auth';
import { fetchTaskLists } from '@/services/google/tasks';

// GET — List available task lists with selection state
export async function GET() {
  const connected = await isGoogleConnected();
  if (!connected) {
    return NextResponse.json({ connected: false, taskLists: [] });
  }

  try {
    const [allLists, selectedIds] = await Promise.all([
      fetchTaskLists(),
      getSelectedTaskListIds(),
    ]);

    // null = unconfigured → all enabled by default
    const selectedSet = selectedIds ? new Set(selectedIds) : null;
    const taskLists = allLists.map(list => ({
      id: list.id,
      title: list.title,
      enabled: selectedSet ? selectedSet.has(list.id) : true,
    }));

    return NextResponse.json({ connected: true, taskLists });
  } catch {
    return NextResponse.json({ connected: true, taskLists: [], error: 'Failed to fetch task lists' });
  }
}

// POST — Update selected task list IDs
export async function POST(req: Request) {
  const connected = await isGoogleConnected();
  if (!connected) {
    return NextResponse.json({ success: false, error: 'Not connected' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const taskListIds: string[] = body.taskListIds;

    if (!Array.isArray(taskListIds)) {
      return NextResponse.json({ success: false, error: 'taskListIds must be an array' }, { status: 400 });
    }

    await setSelectedTaskListIds(taskListIds);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to update' }, { status: 500 });
  }
}
