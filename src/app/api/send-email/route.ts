import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { validate, sendEmailSchema } from '@/lib/validation';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const USER_EMAIL = process.env.USER_EMAIL;

interface ArticleSummary {
  title: string;
  url: string;
  one_liner: string;
  full_summary: string;
  key_points: string[];
  category: string;
  readTime?: string;
}

interface EmailRequest {
  articles: ArticleSummary[];
  subject?: string;
}

function generateNewsletterHtml(articles: ArticleSummary[], date: string): string {
  const articleHtml = articles.map((article, index) => `
    <tr>
      <td style="padding: 24px 0; border-bottom: 1px solid #e5e7eb;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <span style="display: inline-block; background-color: ${getCategoryColor(article.category)}; color: white; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                ${article.category}
              </span>
              ${article.readTime ? `<span style="color: #6b7280; font-size: 12px; margin-left: 12px;">${article.readTime}</span>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding-top: 12px;">
              <a href="${article.url}" style="color: #111827; font-size: 18px; font-weight: 600; text-decoration: none; line-height: 1.4;">
                ${index + 1}. ${article.title}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 8px; color: #6b7280; font-size: 12px;">
              ${getHostname(article.url)}
            </td>
          </tr>
          <tr>
            <td style="padding-top: 16px;">
              <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0; font-style: italic;">
                "${article.one_liner}"
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-top: 16px;">
              <p style="color: #374151; font-size: 14px; line-height: 1.7; margin: 0;">
                ${article.full_summary.slice(0, 500)}${article.full_summary.length > 500 ? '...' : ''}
              </p>
            </td>
          </tr>
          ${article.key_points.length > 0 ? `
          <tr>
            <td style="padding-top: 16px;">
              <p style="color: #111827; font-size: 13px; font-weight: 600; margin: 0 0 8px 0;">Key Points:</p>
              <ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 13px; line-height: 1.6;">
                ${article.key_points.slice(0, 3).map(p => `<li style="margin-bottom: 4px;">${p}</li>`).join('')}
              </ul>
            </td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding-top: 16px;">
              <a href="${article.url}" style="display: inline-block; background-color: #10b981; color: white; font-size: 13px; font-weight: 500; padding: 10px 20px; border-radius: 8px; text-decoration: none;">
                Read Full Article →
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Daily Knowledge Digest</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: white; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 16px 16px 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size: 28px;">📰</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 12px;">
                    <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 700;">Your Daily Knowledge Digest</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 8px;">
                    <p style="margin: 0; color: rgba(255, 255, 255, 0.9); font-size: 14px;">
                      ${date} • ${articles.length} article${articles.length !== 1 ? 's' : ''} saved
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Articles -->
          <tr>
            <td style="padding: 8px 32px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${articleHtml}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f9fafb; border-radius: 0 0 16px 16px; border-top: 1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://second-brain.vercel.app'}/reading" style="display: inline-block; color: #10b981; font-size: 14px; font-weight: 500; text-decoration: none;">
                      View all in Second Brain App →
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 16px;">
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                      Powered by Second Brain • Your AI Knowledge Assistant
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'Business': return '#3b82f6';
    case 'Tech': return '#8b5cf6';
    case 'Life': return '#10b981';
    case 'Creative': return '#f59e0b';
    default: return '#6b7280';
  }
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!RESEND_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'Email not configured (RESEND_API_KEY missing)' },
        { status: 500 }
      );
    }

    if (!USER_EMAIL) {
      return NextResponse.json(
        { status: 'error', error: 'User email not configured (USER_EMAIL missing)' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const parsed = validate(sendEmailSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ status: 'error', error: parsed.error }, { status: 400 });
    }
    const { articles, subject } = parsed.data;

    if (articles.length === 0) {
      return NextResponse.json(
        { status: 'error', error: 'No articles provided' },
        { status: 400 }
      );
    }

    const resend = new Resend(RESEND_API_KEY);
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const { data, error } = await resend.emails.send({
      from: 'Second Brain <onboarding@resend.dev>',
      to: USER_EMAIL,
      subject: subject || `📰 Your Daily Knowledge Digest - ${date}`,
      html: generateNewsletterHtml(articles, date),
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json(
        { status: 'error', error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'sent',
      id: data?.id,
      to: USER_EMAIL,
      articleCount: articles.length,
    });

  } catch (error) {
    console.error('Send email error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to send email',
      },
      { status: 500 }
    );
  }
}
