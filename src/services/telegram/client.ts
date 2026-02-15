// Telegram Bot API client
// Sends messages and manages webhook registration

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

interface SendMessageOptions {
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  reply_markup?: InlineKeyboardMarkup;
  disable_web_page_preview?: boolean;
}

interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

interface TelegramResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
}

async function callApi<T = unknown>(method: string, body?: Record<string, unknown>): Promise<TelegramResponse<T>> {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<TelegramResponse<T>>;
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  options?: SendMessageOptions
): Promise<TelegramResponse> {
  // Telegram message limit is 4096 chars — truncate if needed
  const trimmed = text.length > 4000 ? text.slice(0, 3997) + '...' : text;

  return callApi('sendMessage', {
    chat_id: chatId,
    text: trimmed,
    parse_mode: options?.parse_mode,
    reply_markup: options?.reply_markup,
    disable_web_page_preview: options?.disable_web_page_preview ?? true,
  });
}

export async function sendMarkdown(
  chatId: string | number,
  markdown: string
): Promise<TelegramResponse> {
  // Use HTML parse mode — more forgiving than MarkdownV2 with special chars
  const html = markdownToTelegramHtml(markdown);
  return sendMessage(chatId, html, { parse_mode: 'HTML' });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<TelegramResponse> {
  return callApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
  });
}

export async function setWebhook(url: string): Promise<TelegramResponse> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  return callApi('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
  });
}

export async function deleteWebhook(): Promise<TelegramResponse> {
  return callApi('deleteWebhook');
}

export async function setMyCommands(): Promise<TelegramResponse> {
  return callApi('setMyCommands', {
    commands: [
      { command: 'capture', description: 'Save a thought to your brain' },
      { command: 'ask', description: 'Ask your brain a question' },
      { command: 'search', description: 'Search your entries' },
      { command: 'digest', description: 'Get daily or weekly digest' },
      { command: 'clear', description: 'Reset conversation history' },
      { command: 'help', description: 'Show available commands' },
    ],
  });
}

// Convert basic markdown to Telegram-safe HTML
// Handles: **bold**, *italic*, `code`, ```code blocks```
function markdownToTelegramHtml(md: string): string {
  let html = md
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Code blocks (must come before inline code)
    .replace(/```[\s\S]*?```/g, (match) => {
      const code = match.slice(3, -3).trim();
      return `<pre>${code}</pre>`;
    })
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold (**text** or __text__)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<b>$1</b>')
    // Italic (*text* or _text_) — but not inside words
    .replace(/(?<!\w)\*([^*]+)\*(?!\w)/g, '<i>$1</i>')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<i>$1</i>')
    // Bullet points: • or - at start of line
    .replace(/^[-•]\s+/gm, '• ');

  return html;
}

export function isConfigured(): boolean {
  return !!BOT_TOKEN;
}
