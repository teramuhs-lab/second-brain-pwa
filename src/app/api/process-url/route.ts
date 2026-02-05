import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';

// Environment variables
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Notion Database IDs
const IDEAS_DB_ID = '2f092129-b3db-8121-b140-f7a8f4ec2a45';

// URL type detection
type UrlType = 'youtube' | 'twitter' | 'article' | 'generic';

function detectUrlType(url: string): UrlType {
  const hostname = new URL(url).hostname.toLowerCase();

  if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
    return 'youtube';
  }
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    return 'twitter';
  }
  // Common article/blog patterns
  if (url.includes('/blog/') || url.includes('/article/') || url.includes('/post/')) {
    return 'article';
  }
  return 'generic';
}

// Extract YouTube video ID
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Fetch YouTube video info via oEmbed API
async function fetchYouTubeInfo(url: string): Promise<{
  title: string;
  author: string;
  thumbnail: string;
} | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oembedUrl);
    if (!response.ok) return null;

    const data = await response.json();
    return {
      title: data.title || '',
      author: data.author_name || '',
      thumbnail: data.thumbnail_url || '',
    };
  } catch {
    return null;
  }
}

// Extract YouTube video description from page's embedded JSON
function fetchYouTubeDescription(html: string): string {
  // Method 1: Direct extraction of shortDescription (most reliable)
  // Match everything between "shortDescription":" and the next unescaped quote
  // This handles escaped characters like \n, \", etc.
  const directMatch = html.match(/"shortDescription"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (directMatch && directMatch[1]) {
    try {
      // Parse the JSON string to unescape \n, \u0026, etc.
      const description = JSON.parse(`"${directMatch[1]}"`);
      if (description && description.length > 20) {
        return description;
      }
    } catch {
      // If JSON parse fails, do manual unescaping
      const desc = directMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\u0026/g, '&')
        .replace(/\\\\/g, '\\');
      if (desc && desc.length > 20) {
        return desc;
      }
    }
  }

  // Method 2: Try to extract from ytInitialPlayerResponse JSON blob
  // Use a greedy match to capture the entire JSON object
  const playerResponseMatch = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});\s*var\s+/);
  if (playerResponseMatch) {
    try {
      const data = JSON.parse(playerResponseMatch[1]);
      const description = data?.videoDetails?.shortDescription;
      if (description && description.length > 20) return description;
    } catch {
      // JSON parsing failed, continue to next method
    }
  }

  // Method 3: Look for videoDetails object pattern
  const videoDetailsMatch = html.match(/"videoDetails"\s*:\s*\{[^}]*"shortDescription"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (videoDetailsMatch && videoDetailsMatch[1]) {
    try {
      return JSON.parse(`"${videoDetailsMatch[1]}"`);
    } catch {
      return videoDetailsMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
  }

  return '';
}

// Fetch and extract content from URL
async function extractContent(url: string, urlType: UrlType): Promise<{
  title: string;
  content: string;
  description: string;
  author?: string;
  publishDate?: string;
  readTime?: string;
}> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract common metadata
  const title = $('meta[property="og:title"]').attr('content')
    || $('meta[name="twitter:title"]').attr('content')
    || $('title').text()
    || 'Untitled';

  const description = $('meta[property="og:description"]').attr('content')
    || $('meta[name="description"]').attr('content')
    || $('meta[name="twitter:description"]').attr('content')
    || '';

  const author = $('meta[name="author"]').attr('content')
    || $('meta[property="article:author"]').attr('content')
    || $('[rel="author"]').text()
    || '';

  const publishDate = $('meta[property="article:published_time"]').attr('content')
    || $('time[datetime]').attr('datetime')
    || '';

  // Extract main content based on URL type
  let content = '';
  let finalTitle = title;
  let finalAuthor = author;

  if (urlType === 'youtube') {
    // For YouTube, get video info from oEmbed API (most reliable for title/author)
    const youtubeInfo = await fetchYouTubeInfo(url);
    if (youtubeInfo) {
      finalTitle = youtubeInfo.title || title;
      finalAuthor = youtubeInfo.author || author;
    }

    // Extract the actual video description from page's embedded JSON
    const videoDescription = fetchYouTubeDescription(html);
    if (videoDescription && videoDescription.length > 20) {
      content = videoDescription;
    } else {
      // Fallback: try meta description (less reliable but better than nothing)
      content = description || 'No video description available.';
    }

    // Add context about this being a video
    if (finalAuthor) {
      content = `Video by ${finalAuthor}\n\n${content}`;
    }
  } else if (urlType === 'article') {
    // Extract article content
    const articleSelectors = [
      'article',
      '[role="main"]',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.content',
      'main',
    ];

    for (const selector of articleSelectors) {
      const element = $(selector);
      if (element.length) {
        // Remove scripts, styles, and nav elements
        element.find('script, style, nav, aside, .comments, .related').remove();
        content = element.text().trim();
        if (content.length > 200) break;
      }
    }

    // Fallback to paragraphs
    if (!content || content.length < 200) {
      const paragraphs: string[] = [];
      $('p').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 50) {
          paragraphs.push(text);
        }
      });
      content = paragraphs.slice(0, 20).join('\n\n');
    }
  } else {
    // Generic extraction
    const paragraphs: string[] = [];
    $('p').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 30) {
        paragraphs.push(text);
      }
    });
    content = paragraphs.slice(0, 15).join('\n\n');

    if (!content) {
      content = description;
    }
  }

  // Clean up content
  content = content
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 8000); // Limit content length for API

  // Estimate read time (average 200 words per minute)
  const wordCount = content.split(/\s+/).length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200)) + ' min read';

  return {
    title: finalTitle.trim(),
    content,
    description: description.trim(),
    author: finalAuthor.trim() || undefined,
    publishDate: publishDate || undefined,
    readTime,
  };
}

// Generate comprehensive summary with OpenAI
async function generateSummary(
  title: string,
  content: string,
  urlType: UrlType
): Promise<{
  one_liner: string;
  full_summary: string;
  key_points: string[];
  category: string;
}> {
  if (!OPENAI_API_KEY) {
    return {
      one_liner: 'AI summary unavailable',
      full_summary: content.slice(0, 500),
      key_points: [],
      category: 'Tech',
    };
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const contentType = urlType === 'youtube' ? 'video' : 'article';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: `You are a knowledge curator creating comprehensive summaries for a personal Second Brain system.`
      },
      {
        role: 'user',
        content: `Create a detailed summary of this ${contentType} for a personal knowledge base.

TITLE: ${title}

CONTENT:
${content}

Provide a comprehensive analysis including:
1. A one-liner hook (1 sentence that captures the essence)
2. A full summary (300-500 words) with:
   - Main thesis/topic
   - Key arguments or points explained
   - Notable quotes or statistics
   - Actionable takeaways
   - Why this matters
3. 3-5 key bullet points
4. Category: Business, Tech, Life, or Creative

Output STRICT JSON:
{
  "one_liner": "...",
  "full_summary": "...",
  "key_points": ["...", "...", "..."],
  "category": "Tech"
}`
      }
    ],
  });

  const text = response.choices[0]?.message?.content || '';

  // Parse JSON from response
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        one_liner: parsed.one_liner || 'No summary available',
        full_summary: parsed.full_summary || content.slice(0, 500),
        key_points: parsed.key_points || [],
        category: parsed.category || 'Tech',
      };
    }
  } catch (e) {
    console.error('Failed to parse AI response:', e);
  }

  return {
    one_liner: 'Summary generation failed',
    full_summary: content.slice(0, 500),
    key_points: [],
    category: 'Tech',
  };
}

// Create Notion page in Ideas database
async function createNotionIdea(data: {
  title: string;
  url: string;
  one_liner: string;
  full_summary: string;
  key_points: string[];
  category: string;
}): Promise<string | null> {
  if (!NOTION_API_KEY) {
    console.error('NOTION_API_KEY not configured');
    return null;
  }

  // Format the full content with key points
  const rawInsight = `## Summary\n\n${data.full_summary}\n\n## Key Points\n\n${data.key_points.map(p => `- ${p}`).join('\n')}\n\n---\n*Source: ${data.url}*`;

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      parent: { database_id: IDEAS_DB_ID },
      properties: {
        Title: {
          title: [{ text: { content: data.title.slice(0, 100) } }],
        },
        'One-liner': {
          rich_text: [{ text: { content: data.one_liner.slice(0, 200) } }],
        },
        'Raw Insight': {
          rich_text: [{ text: { content: rawInsight.slice(0, 2000) } }],
        },
        Source: {
          url: data.url,
        },
        Category: {
          select: { name: data.category },
        },
        Maturity: {
          select: { name: 'Spark' },
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Notion API error:', error);
    return null;
  }

  const result = await response.json();
  return result.id;
}

// Main POST handler
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    // Validate URL
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { status: 'error', error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      return NextResponse.json(
        { status: 'error', error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Detect URL type
    const urlType = detectUrlType(url);

    // Extract content
    const extracted = await extractContent(url, urlType);

    // Generate AI summary
    const summary = await generateSummary(
      extracted.title,
      extracted.content || extracted.description,
      urlType
    );

    // Create Notion page
    const pageId = await createNotionIdea({
      title: extracted.title,
      url: url,
      one_liner: summary.one_liner,
      full_summary: summary.full_summary,
      key_points: summary.key_points,
      category: summary.category,
    });

    // Return result
    return NextResponse.json({
      status: 'success',
      url,
      urlType,
      title: extracted.title,
      one_liner: summary.one_liner,
      full_summary: summary.full_summary,
      key_points: summary.key_points,
      category: summary.category,
      readTime: extracted.readTime,
      author: extracted.author,
      page_id: pageId,
    });

  } catch (error) {
    console.error('Process URL error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to process URL'
      },
      { status: 500 }
    );
  }
}
