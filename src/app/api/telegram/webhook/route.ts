import { NextRequest, NextResponse } from 'next/server';
import { handleUpdate, type TelegramUpdate } from '@/services/telegram/handlers';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret if configured
    if (WEBHOOK_SECRET) {
      const secretHeader = request.headers.get('x-telegram-bot-api-secret-token');
      if (secretHeader !== WEBHOOK_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const update: TelegramUpdate = await request.json();

    // Process asynchronously — Telegram expects a fast 200 OK
    // Using waitUntil would be ideal but isn't available in all runtimes,
    // so we fire-and-forget with error logging
    handleUpdate(update).catch((error) => {
      console.error('Telegram update handler error:', error);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    // Always return 200 to prevent Telegram from retrying
    return NextResponse.json({ ok: true });
  }
}

// GET endpoint to register/check webhook
export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  if (action === 'set') {
    const { setWebhook } = await import('@/services/telegram/client');
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL not set' }, { status: 500 });
    }
    const result = await setWebhook(`${baseUrl}/api/telegram/webhook`);
    return NextResponse.json(result);
  }

  if (action === 'delete') {
    const { deleteWebhook } = await import('@/services/telegram/client');
    const result = await deleteWebhook();
    return NextResponse.json(result);
  }

  return NextResponse.json({
    status: 'ok',
    message: 'Telegram webhook endpoint. Use ?action=set to register or ?action=delete to remove.',
  });
}
