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

    // Must await — Vercel kills the function after response is sent
    try {
      await handleUpdate(update);
      return NextResponse.json({ ok: true, handled: true });
    } catch (handlerError) {
      const errMsg = handlerError instanceof Error ? handlerError.message : String(handlerError);
      const errStack = handlerError instanceof Error ? handlerError.stack : undefined;
      console.error('Telegram update handler error:', errMsg, errStack);
      return NextResponse.json({ ok: true, error: errMsg });
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Telegram webhook error:', errMsg);
    return NextResponse.json({ ok: true, error: errMsg });
  }
}

// GET endpoint — also serves as diagnostic
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

  // Diagnostic: check which env vars are set
  if (action === 'debug') {
    return NextResponse.json({
      TELEGRAM_BOT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_CHAT_ID: !!process.env.TELEGRAM_CHAT_ID,
      TELEGRAM_WEBHOOK_SECRET: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
      DATABASE_URL: !!process.env.DATABASE_URL,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    });
  }

  return NextResponse.json({
    status: 'ok',
    message: 'Telegram webhook endpoint. Use ?action=set to register, ?action=delete to remove, ?action=debug to check env.',
  });
}
