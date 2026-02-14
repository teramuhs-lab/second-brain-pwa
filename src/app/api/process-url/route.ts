import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { YoutubeTranscript } from 'youtube-transcript';
import { createEntry } from '@/services/db/entries';

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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

// Format seconds to MM:SS
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Fetch YouTube transcript with timestamps
interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

async function fetchYouTubeTranscript(videoId: string): Promise<{
  fullText: string;
  segments: TranscriptSegment[];
  formattedTranscript: string;
} | null> {
  try {
    const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcriptData || transcriptData.length === 0) {
      return null;
    }

    const segments: TranscriptSegment[] = transcriptData.map(item => ({
      text: item.text,
      offset: item.offset / 1000, // Convert ms to seconds
      duration: item.duration / 1000,
    }));

    const fullText = segments.map(s => s.text).join(' ');

    // Format transcript with timestamps for AI analysis
    const formattedTranscript = segments.map(s =>
      `[${formatTimestamp(s.offset)}] ${s.text}`
    ).join('\n');

    return { fullText, segments, formattedTranscript };
  } catch (error) {
    console.error('Failed to fetch YouTube transcript:', error);
    return null;
  }
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

    // Try to fetch full transcript with timestamps (best for detailed summaries)
    const videoId = extractYouTubeId(url);
    let hasTranscript = false;

    if (videoId) {
      const transcript = await fetchYouTubeTranscript(videoId);
      if (transcript && transcript.fullText.length > 100) {
        // Use the formatted transcript with timestamps
        content = `FULL VIDEO TRANSCRIPT WITH TIMESTAMPS:\n\n${transcript.formattedTranscript}`;
        hasTranscript = true;
      }
    }

    // Fallback to description if no transcript available
    if (!hasTranscript) {
      const videoDescription = fetchYouTubeDescription(html);
      if (videoDescription && videoDescription.length > 20) {
        content = videoDescription;
      } else {
        content = description || 'No video description available.';
      }
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

// Ultra-detailed summary structure - complete knowledge extraction
interface RichSummary {
  one_liner: string;
  tldr: string;
  full_summary: string;  // Comprehensive 500-800 word summary
  main_ideas: Array<{
    title: string;
    explanation: string;
    details: string[];  // Bullet points with specifics
  }>;
  key_takeaways: string[];
  notable_quotes: string[];
  statistics_and_data: string[];  // All numbers, stats, data points
  examples_and_cases: string[];   // Case studies, examples mentioned
  frameworks_and_models: Array<{  // Systems, methodologies, frameworks
    name: string;
    description: string;
    steps?: string[];
  }>;
  tools_and_resources: string[];  // Tools, apps, resources mentioned
  definitions: Array<{            // Key terms explained
    term: string;
    definition: string;
  }>;
  action_items: string[];
  questions_to_consider: string[];
  related_topics: string[];
  timestamps?: Array<{            // For videos - chapter markers
    time: string;
    topic: string;
  }>;
  category: string;
  complexity: 'Beginner' | 'Intermediate' | 'Advanced';
  content_type: string;
}

// Generate ultra-comprehensive summary with OpenAI
async function generateSummary(
  title: string,
  content: string,
  urlType: UrlType
): Promise<RichSummary> {
  const defaultSummary: RichSummary = {
    one_liner: 'AI summary unavailable',
    tldr: content.slice(0, 300),
    full_summary: content.slice(0, 800),
    main_ideas: [],
    key_takeaways: [],
    notable_quotes: [],
    statistics_and_data: [],
    examples_and_cases: [],
    frameworks_and_models: [],
    tools_and_resources: [],
    definitions: [],
    action_items: [],
    questions_to_consider: [],
    related_topics: [],
    category: 'Tech',
    complexity: 'Intermediate',
    content_type: urlType === 'youtube' ? 'Video' : 'Article',
  };

  if (!OPENAI_API_KEY) {
    return defaultSummary;
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const contentType = urlType === 'youtube' ? 'video' : 'article';
  const isVideo = urlType === 'youtube';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 6000,
    messages: [
      {
        role: 'system',
        content: `You are an expert knowledge curator creating EXHAUSTIVE summaries for a personal Second Brain. Your goal is to extract EVERY piece of valuable information so the user NEVER needs to read/watch the original content. Be thorough, specific, and detailed. Include all numbers, names, examples, and specifics mentioned.`
      },
      {
        role: 'user',
        content: `Create an EXHAUSTIVELY DETAILED summary of this ${contentType}. Extract EVERYTHING valuable - the user should never need to view the original.

TITLE: ${title}

CONTENT:
${content}

Generate a COMPREHENSIVE analysis with ALL sections below. Be SPECIFIC - include actual names, numbers, examples, not generic statements:

1. **one_liner**: A compelling 1-sentence hook that captures the core insight

2. **tldr**: 4-5 sentence executive summary - thesis, key points, conclusion

3. **full_summary**: A COMPLETE 500-800 word summary that covers EVERYTHING important. Write it as if explaining the entire content to someone who will never see the original. Include:
   - The main argument/thesis
   - All supporting points with specifics
   - Any methodology or process described
   - Key examples mentioned
   - The conclusion and implications
   Structure with paragraphs, be thorough.

4. **main_ideas**: 4-6 main concepts, each with:
   - "title": Descriptive title (3-8 words)
   - "explanation": 3-4 sentence thorough explanation
   - "details": Array of 2-4 specific bullet points with details/examples

5. **key_takeaways**: 7-10 specific, memorable points. Be precise with names/numbers.

6. **notable_quotes**: 3-5 direct quotes or key statements (most impactful lines)

7. **statistics_and_data**: ALL numbers, percentages, data points, research findings mentioned (e.g., "85% of users...", "$50M revenue", "3x improvement")

8. **examples_and_cases**: ALL examples, case studies, stories, or real-world applications mentioned with specifics

9. **frameworks_and_models**: Any systems, methodologies, frameworks, or models presented:
   - "name": Name of the framework
   - "description": What it is/does
   - "steps": Array of steps if it's a process (optional)

10. **tools_and_resources**: ALL tools, apps, books, websites, or resources mentioned by name

11. **definitions**: Key terms or concepts that are defined or explained:
    - "term": The term
    - "definition": Clear explanation

12. **action_items**: 5-10 EXHAUSTIVELY DETAILED action items. Each MUST be a COMPLETE, SELF-CONTAINED GUIDE (100-300 words) the user can follow WITHOUT the original content.

    CRITICAL - Include ALL specifics from the content:
    - EXERCISE routine: Full workout with sets, reps, rest times, form cues, breathing
    - DIET plan: Complete meal plan with portions, timing, specific foods, prep instructions
    - RECIPE: ALL ingredients with exact quantities and full step-by-step cooking instructions
    - SYSTEM/PROCESS: Every step with specific details, examples, and edge cases
    - ADVICE: Complete reasoning, real examples, and step-by-step implementation

    Structure each action as a complete mini-guide:
    - What: The specific action to take
    - How: Complete step-by-step with ALL details mentioned in content
    - Specifics: Exact numbers, quantities, durations, techniques, ingredients
    - Tips: Pro tips, variations, common mistakes to avoid
    - Result: What success looks like

    Example for fitness: "Build morning mobility routine (15 min): Start with Cat-Cow stretches 60 seconds - inhale arching, exhale rounding. Move to World's Greatest Stretch - 5 reps each side, hold 3 seconds at each position. Add 90/90 hip stretches 45 seconds per side. Finish with 10 wall slides keeping lower back against wall. Do immediately upon waking. Tip: Set alarm 15 min earlier first week. Mistake to avoid: rushing - prioritize feeling each stretch."

    Example for cooking: "Make garlic butter sauce: Melt 4 tbsp unsalted butter over medium-low heat. Add 6 minced garlic cloves, cook 1-2 min until fragrant (NOT brown). Remove from heat, add 2 tbsp fresh lemon juice, 1/4 cup chopped parsley, 1/2 tsp red pepper flakes, 1/2 tsp salt. Should be pourable - if thick, add 1 tbsp warm water. Store refrigerated up to 5 days. Warning: garlic burns quickly, watch heat."

13. **questions_to_consider**: 3-4 thought-provoking questions for reflection

14. **related_topics**: 5-8 related concepts, fields, or topics to explore

${isVideo ? `15. **timestamps**: CRITICAL FOR VIDEOS - Create a comprehensive chapter breakdown from the transcript:
    - Analyze the transcript and identify 8-15 distinct topic sections/chapters
    - Each timestamp should mark where a NEW topic or subtopic begins
    - "time": The timestamp in MM:SS format (e.g., "02:15", "15:30")
    - "topic": A descriptive title for what is discussed (5-10 words, like a chapter title)

    Guidelines for timestamps:
    - First timestamp should be "0:00" for the intro/opening
    - Look for topic transitions, new questions, new concepts being introduced
    - Space them logically (not too close together, not too far apart)
    - Make topic titles descriptive and specific (e.g., "Why Tesla Will 10x in 5 Years" not just "Tesla")
    - Include timestamps for key moments like important reveals, actionable advice, conclusions` : ''}

16. **category**: One of: Business, Tech, Life, Creative

17. **complexity**: One of: Beginner, Intermediate, Advanced

Output STRICT JSON (no markdown):
{
  "one_liner": "...",
  "tldr": "...",
  "full_summary": "...",
  "main_ideas": [{"title": "...", "explanation": "...", "details": ["...", "..."]}, ...],
  "key_takeaways": ["...", ...],
  "notable_quotes": ["...", ...],
  "statistics_and_data": ["...", ...],
  "examples_and_cases": ["...", ...],
  "frameworks_and_models": [{"name": "...", "description": "...", "steps": ["...", ...]}],
  "tools_and_resources": ["...", ...],
  "definitions": [{"term": "...", "definition": "..."}],
  "action_items": ["...", ...],
  "questions_to_consider": ["...", ...],
  "related_topics": ["...", ...]${isVideo ? ',\n  "timestamps": [{"time": "...", "topic": "..."}]' : ''},
  "category": "Tech",
  "complexity": "Intermediate"
}`
      }
    ],
  });

  const text = response.choices[0]?.message?.content || '';

  // Parse JSON from response
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        one_liner: parsed.one_liner || defaultSummary.one_liner,
        tldr: parsed.tldr || defaultSummary.tldr,
        full_summary: parsed.full_summary || defaultSummary.full_summary,
        main_ideas: (parsed.main_ideas || []).map((idea: { title?: string; explanation?: string; details?: string[] }) => ({
          title: idea.title || '',
          explanation: idea.explanation || '',
          details: idea.details || [],
        })),
        key_takeaways: parsed.key_takeaways || [],
        notable_quotes: parsed.notable_quotes || [],
        statistics_and_data: parsed.statistics_and_data || [],
        examples_and_cases: parsed.examples_and_cases || [],
        frameworks_and_models: (parsed.frameworks_and_models || []).map((fw: { name?: string; description?: string; steps?: string[] }) => ({
          name: fw.name || '',
          description: fw.description || '',
          steps: fw.steps || [],
        })),
        tools_and_resources: parsed.tools_and_resources || [],
        definitions: (parsed.definitions || []).map((def: { term?: string; definition?: string }) => ({
          term: def.term || '',
          definition: def.definition || '',
        })),
        action_items: parsed.action_items || [],
        questions_to_consider: parsed.questions_to_consider || [],
        related_topics: parsed.related_topics || [],
        timestamps: isVideo ? (parsed.timestamps || []).map((ts: { time?: string; topic?: string }) => ({
          time: ts.time || '',
          topic: ts.topic || '',
        })) : undefined,
        category: parsed.category || 'Tech',
        complexity: parsed.complexity || 'Intermediate',
        content_type: contentType === 'video' ? 'Video' : 'Article',
      };
    }
  } catch (e) {
    console.error('Failed to parse AI response:', e);
  }

  return defaultSummary;
}

// Create Idea entry
async function createIdeaEntry(data: {
  title: string;
  url: string;
  summary: RichSummary;
}): Promise<string | null> {
  try {
    const newEntry = await createEntry({
      category: 'Idea',
      title: data.title.slice(0, 100),
      content: {
        oneLiner: data.summary.one_liner.slice(0, 200),
        rawInsight: data.summary.tldr,
        source: data.url,
        ideaCategory: data.summary.category,
        // Store full structured summary in jsonb for rich rendering
        structuredSummary: data.summary,
      },
    });

    return newEntry.id;
  } catch (error) {
    console.error('Failed to create idea entry:', error);
    return null;
  }
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

    // Create Idea entry
    const pageId = await createIdeaEntry({
      title: extracted.title,
      url: url,
      summary: summary,
    });

    // Return ultra-detailed result
    return NextResponse.json({
      status: 'success',
      url,
      urlType,
      title: extracted.title,
      author: extracted.author,
      readTime: extracted.readTime,
      page_id: pageId,
      // Ultra-detailed summary fields
      one_liner: summary.one_liner,
      tldr: summary.tldr,
      full_summary: summary.full_summary,
      main_ideas: summary.main_ideas,
      key_takeaways: summary.key_takeaways,
      notable_quotes: summary.notable_quotes,
      statistics_and_data: summary.statistics_and_data,
      examples_and_cases: summary.examples_and_cases,
      frameworks_and_models: summary.frameworks_and_models,
      tools_and_resources: summary.tools_and_resources,
      definitions: summary.definitions,
      action_items: summary.action_items,
      questions_to_consider: summary.questions_to_consider,
      related_topics: summary.related_topics,
      timestamps: summary.timestamps,
      category: summary.category,
      complexity: summary.complexity,
      content_type: summary.content_type,
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
