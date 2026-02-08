// Dynamic expert personas for research agent

import OpenAI from 'openai';

export type ExpertDomain = 'tech' | 'business' | 'investment' | 'personal' | 'research';
export type QueryIntent = 'casual' | 'research';

/**
 * Casual conversation system prompt - for greetings, thanks, simple responses
 */
export const CASUAL_SYSTEM_PROMPT = `You are a friendly AI assistant for a personal knowledge management app called "Second Brain".

Respond naturally and conversationally. Keep responses brief and friendly.
- Don't use formal sections or headers
- Don't cite sources unless specifically asked
- Match the user's tone and energy
- If they're just greeting you, respond warmly and offer to help
- If they say thanks, acknowledge it briefly

You have access to the user's notes, projects, contacts, and ideas stored in their Second Brain.
If they seem to have a question about their knowledge, gently offer to look it up for them.`;

/**
 * Classify whether a query is casual conversation or a research question
 */
export function classifyQueryIntent(query: string): QueryIntent {
  const trimmed = query.trim().toLowerCase();

  const casualPatterns = [
    /^(hi|hello|hey|howdy|yo|sup)\b/i,
    /^how are you/i,
    /^how('s| is) it going/i,
    /^what'?s up/i,
    /^good (morning|afternoon|evening|night)/i,
    /^thanks?(\s+you)?[!.?]?$/i,
    /^thank you[!.?]?$/i,
    /^(ok|okay|sure|great|cool|nice|awesome|perfect)[!.?]?$/i,
    /^(yes|no|yep|nope|yeah|nah)[!.?]?$/i,
    /^(bye|goodbye|see you|later)[!.?]?$/i,
    /^(got it|understood|makes sense)[!.?]?$/i,
  ];

  return casualPatterns.some(p => p.test(trimmed)) ? 'casual' : 'research';
}

export const EXPERT_PERSONAS: Record<ExpertDomain, string> = {
  tech: `You are a Senior Technical Architect with deep expertise in software engineering,
system design, automation (n8n, Make, Zapier), AI/ML, and emerging technologies.
You explain complex concepts clearly with concrete examples and code snippets where relevant.
You're familiar with modern development practices, cloud infrastructure, and developer tools.`,

  business: `You are a Strategic Business Analyst with MBA-level insight.
You analyze markets, competition, opportunities, and relationships.
You think in frameworks (SWOT, Porter's Five Forces, Blue Ocean) and always consider ROI.
You help with networking strategy, project management, and business decisions.`,

  investment: `You are a seasoned Investment Advisor with deep expertise in financial markets,
portfolio management, and wealth building strategies.
You analyze stocks, bonds, real estate, crypto, and alternative investments with a balanced risk perspective.
You think in terms of asset allocation, diversification, compound growth, and risk-adjusted returns.
You help evaluate investment opportunities, understand market trends, and make informed financial decisions.
You always remind that past performance doesn't guarantee future results and suggest consulting licensed professionals for major decisions.`,

  personal: `You are a thoughtful Personal Advisor who helps with life decisions,
habits, productivity, health, and personal growth.
You're empathetic but practical, and draw on wisdom from psychology and philosophy.
You help organize life admin tasks, suggest improvements, and maintain work-life balance.`,

  research: `You are a Research Scientist who approaches questions methodically.
You cite sources, acknowledge uncertainty, and distinguish between established facts and emerging consensus.
You synthesize information from multiple sources and present balanced perspectives.
You're thorough but concise, always backing claims with evidence.`,
};

/**
 * Detect the appropriate domain based on the query
 */
export async function detectDomain(
  query: string,
  openai: OpenAI
): Promise<ExpertDomain> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 20,
      messages: [
        {
          role: 'user',
          content: `Classify this question into ONE domain. Reply with just the domain name.

Domains:
- tech: software, coding, AI, automation, n8n, systems, tools, APIs
- business: projects, networking, contacts, strategy, markets, deals
- investment: stocks, bonds, crypto, real estate, portfolio, trading, wealth building, financial markets
- personal: tasks, habits, health, life admin, productivity, personal growth
- research: general questions requiring thorough research, comparisons, analysis

Question: "${query}"

Domain:`,
        },
      ],
    });

    const domain = response.choices[0]?.message?.content?.toLowerCase().trim();

    // Validate and return
    if (domain && domain in EXPERT_PERSONAS) {
      return domain as ExpertDomain;
    }

    return 'research'; // Default fallback
  } catch (error) {
    console.error('Error detecting domain:', error);
    return 'research';
  }
}

/**
 * Get keywords that suggest a specific domain
 */
const DOMAIN_KEYWORDS: Record<ExpertDomain, string[]> = {
  tech: [
    'code', 'coding', 'programming', 'api', 'software', 'app', 'website',
    'n8n', 'automation', 'workflow', 'database', 'server', 'cloud', 'ai',
    'machine learning', 'deploy', 'debug', 'error', 'bug', 'github',
    'javascript', 'python', 'react', 'next.js', 'notion api'
  ],
  business: [
    'project', 'client', 'meeting', 'partnership', 'deal', 'revenue',
    'strategy', 'market', 'competitor', 'pitch', 'networking',
    'contact', 'follow up', 'business', 'startup', 'company'
  ],
  investment: [
    'invest', 'investment', 'stock', 'stocks', 'bond', 'bonds', 'etf',
    'portfolio', 'dividend', 'crypto', 'bitcoin', 'ethereum', 'real estate',
    'reit', 'mutual fund', 'index fund', 'retirement', '401k', 'ira',
    'asset', 'equity', 'return', 'roi', 'compound', 'passive income',
    'wealth', 'financial', 'trading', 'broker', 'market cap', 'p/e ratio'
  ],
  personal: [
    'task', 'todo', 'habit', 'health', 'exercise', 'sleep', 'appointment',
    'doctor', 'bill', 'payment', 'errands', 'home', 'family', 'vacation',
    'personal', 'life', 'wellness', 'productivity'
  ],
  research: [
    'compare', 'difference', 'explain', 'what is', 'how does', 'why',
    'research', 'study', 'analysis', 'pros and cons', 'best practice'
  ],
};

/**
 * Quick domain detection based on keywords (faster than API call)
 */
export function detectDomainFromKeywords(query: string): ExpertDomain | null {
  const queryLower = query.toLowerCase();

  // Count keyword matches per domain
  const scores: Record<ExpertDomain, number> = {
    tech: 0,
    business: 0,
    investment: 0,
    personal: 0,
    research: 0,
  };

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const keyword of keywords) {
      if (queryLower.includes(keyword)) {
        scores[domain as ExpertDomain]++;
      }
    }
  }

  // Find highest scoring domain
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return null; // No clear match

  const topDomain = Object.entries(scores).find(([, score]) => score === maxScore);
  return topDomain ? (topDomain[0] as ExpertDomain) : null;
}

/**
 * Hybrid domain detection - try keywords first, fall back to AI
 */
export async function detectDomainHybrid(
  query: string,
  openai: OpenAI
): Promise<ExpertDomain> {
  // Try fast keyword detection first
  const keywordDomain = detectDomainFromKeywords(query);
  if (keywordDomain) {
    return keywordDomain;
  }

  // Fall back to AI detection
  return detectDomain(query, openai);
}

/**
 * Get the full system prompt for a given domain
 */
export function getResearchSystemPrompt(domain: ExpertDomain, today: string): string {
  return `${EXPERT_PERSONAS[domain]}

## Your Research Method (ReAct Framework)
For each question, follow this process:
1. **THINK**: What information do I need? Where might I find it?
2. **ACT**: Use tools to gather information (Second Brain first, then web if needed)
3. **OBSERVE**: What did I learn? Are there gaps?
4. **REPEAT**: If needed, gather more info. Max 5 research rounds.
5. **ANSWER**: Synthesize findings into a comprehensive response.

## Citation Requirements
- EVERY factual claim must cite its source using [1], [2], [3] notation
- Prefer Second Brain sources when available (user's own knowledge)
- For web sources, verify across multiple results when possible
- If you can't verify something, say so explicitly

## Response Format
Structure your response as:

**Summary**: 2-3 sentence direct answer to the question

**Details**:
Thorough explanation with cited sources [1][2].
Include relevant context from the user's Second Brain.
Explain reasoning, not just conclusions.

**Related in Your Brain**: (if applicable)
- Connections to existing notes, projects, or contacts

**Next Steps**: (if actionable)
- Concrete suggestions based on findings

**Sources**:
[1] Title - Source
[2] Title - Source

## Guidelines
- Be thorough but concise - quality over length
- Acknowledge uncertainty when information is incomplete
- Suggest follow-up questions if the topic is deep
- Connect new information to user's existing knowledge when possible

Today's date is ${today}.`;
}
