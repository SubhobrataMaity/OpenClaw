import { researchAgent } from "../agents/main/custom/research.agent.ts";
import { contentAgent } from "../agents/main/custom/content.agent.ts";
import { creativeDirectorAgent } from "../agents/main/custom/creativeDirector.agent.ts";
// criticAgent is kept but not used in the current pipeline (removed to reduce API calls)
// import { criticAgent } from "../agents/main/custom/critic.agent.ts";

// ─── Config ───────────────────────────────────────────────────────────────────

const IS_TEST_MODE = true; // set false for full output; true = faster, minimal

const OLLAMA_HOST = "http://127.0.0.1:11434";
const OLLAMA_MODEL = "qwen2.5:3b";
const OLLAMA_CHAT_API = `${OLLAMA_HOST}/api/chat`;
const OLLAMA_WEB_SEARCH_API = `${OLLAMA_HOST}/api/experimental/web_search`;

const STEP_DELAY_MS = IS_TEST_MODE ? 2000 : 3000;
const RETRY_DELAY_MS = IS_TEST_MODE ? 5000 : 10000;
const MAX_RETRIES = 3;
const MAX_TOKENS = IS_TEST_MODE ? 1200 : 2048;
// Research gets more tokens to produce a full cited report
const RESEARCH_MAX_TOKENS = IS_TEST_MODE ? 2048 : 4096;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PipelineInput {
  industry: string;
  targetAudience: string;
  goal: string;
}

export interface PipelineResult {
  research: string;
  content: string;
  final: string;
  cached: boolean;
}

interface AgentDef {
  name: string;
  role: string;
  goal: string;
  instructions: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Simple in-memory cache keyed by a string hash of the input
const cache = new Map<string, string>();

function cacheKey(...parts: string[]): string {
  return parts.join("|").toLowerCase().trim();
}

function log(tag: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${tag}] ${msg}`);
}

// ─── Mock Fallbacks ───────────────────────────────────────────────────────────

const MOCK: Record<string, string> = {
  research: `[MOCK] Investment & Insurance industry: key players include LIC, HDFC Life, SBI Life.
Trend: digital-first products, rising awareness among 25–40 working professionals.
Opportunity: simplified UX, transparent fee structures, tax-saving messaging.`,

  content: `[MOCK] Headline: "Grow Smarter. Protect Stronger."
Body: Your career is your biggest asset. Safeguard it with investment-linked insurance plans
designed for working professionals — flexible premiums, guaranteed returns, and peace of mind built in.
CTA: Get Your Free Plan Review Today →`,

  final: `[MOCK FINAL] "Grow Smarter. Protect Stronger."
Your career, protected and invested — all in one place.
Plans starting at ₹500/month. Zero jargon. Full transparency.
[CTA] Start Your Free Review →`,
};

// ─── Ollama API ───────────────────────────────────────────────────────────────

async function callOllama(messages: { role: string; content: string }[], temperature: number, maxTokens: number): Promise<string> {
  const response = await fetch(OLLAMA_CHAT_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      options: { temperature, num_predict: maxTokens },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama error ${response.status}: ${err.slice(0, 120)}`);
  }

  const data = (await response.json()) as { message?: { content?: string } };
  return data?.message?.content?.trim() ?? "";
}

async function fetchWebSearchContext(query: string): Promise<string> {
  try {
    const response = await fetch(OLLAMA_WEB_SEARCH_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, max_results: 5 }),
    });
    if (!response.ok) return "";
    const data = (await response.json()) as { results?: { title: string; url: string; content: string }[] };
    if (!data.results?.length) return "";
    return data.results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content?.slice(0, 400)}`)
      .join("\n\n");
  } catch {
    return "";
  }
}

/**
 * Runs the research agent with Ollama web search context injected into the prompt.
 * Falls back to runAgent (no search) if web search is unavailable.
 */
async function runResearchAgent(agent: AgentDef, userMessage: string): Promise<string> {
  const key = cacheKey(agent.name, userMessage);
  if (cache.has(key)) {
    log("CACHE", `Hit for ${agent.name} — skipping API call`);
    return cache.get(key)!;
  }

  const systemPrompt = `You are ${agent.name}, a ${agent.role}.
Goal: ${agent.goal}

Instructions:
${agent.instructions.trim()}`;

  log(agent.name, "Fetching live web search context...");
  const searchContext = await fetchWebSearchContext(userMessage);

  const augmentedMessage = searchContext
    ? `${userMessage}\n\n--- Live Web Search Results ---\n${searchContext}`
    : userMessage;

  if (!searchContext) {
    log(agent.name, "Web search unavailable — proceeding without live data");
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log(agent.name, `Calling ${OLLAMA_MODEL} (attempt ${attempt}/${MAX_RETRIES})`);
    try {
      const text = await callOllama(
        [{ role: "system", content: systemPrompt }, { role: "user", content: augmentedMessage }],
        0.4,
        RESEARCH_MAX_TOKENS,
      );
      if (!text) {
        log(agent.name, "Empty response — retrying");
        continue;
      }
      cache.set(key, text);
      log(agent.name, `Done (${OLLAMA_MODEL})`);
      return text;
    } catch (err) {
      const wait = RETRY_DELAY_MS * attempt;
      log(agent.name, `Error: ${(err as Error).message} — retrying in ${wait / 1000}s`);
      await delay(wait);
    }
  }

  log(agent.name, "All attempts failed. Using mock fallback.");
  const fallback = MOCK["research"];
  cache.set(key, fallback);
  return fallback;
}

async function runAgent(agent: AgentDef, userMessage: string, fallbackKey: string): Promise<string> {
  const key = cacheKey(agent.name, userMessage);
  if (cache.has(key)) {
    log("CACHE", `Hit for ${agent.name} — skipping API call`);
    return cache.get(key)!;
  }

  const systemPrompt = `You are ${agent.name}, a ${agent.role}.
Goal: ${agent.goal}

Instructions:
${agent.instructions.trim()}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log(agent.name, `Calling ${OLLAMA_MODEL} (attempt ${attempt}/${MAX_RETRIES})`);
    try {
      const text = await callOllama(
        [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
        0.7,
        MAX_TOKENS,
      );
      if (!text) {
        log(agent.name, "Empty response — retrying");
        continue;
      }
      cache.set(key, text);
      log(agent.name, `Done (${OLLAMA_MODEL})`);
      return text;
    } catch (err) {
      const wait = RETRY_DELAY_MS * attempt;
      log(agent.name, `Error: ${(err as Error).message} — retrying in ${wait / 1000}s`);
      await delay(wait);
    }
  }

  log(agent.name, `All attempts failed. Using mock fallback.`);
  const fallback = MOCK[fallbackKey] ?? `[FALLBACK] No output available for ${agent.name}.`;
  cache.set(key, fallback);
  return fallback;
}

// ─── Pipeline: Research → Content → Creative Director ─────────────────────────

export async function runMvpPipeline(input: PipelineInput): Promise<PipelineResult> {
  let usedCache = false;

  // ── Step 1: Research ──────────────────────────────────────────────────────
  log("PIPELINE", "Step 1/3 — Research Agent");

  const researchPrompt = `Industry: ${input.industry}
Target Audience: ${input.targetAudience}
Goal: ${input.goal}

Research this industry thoroughly using live web search.
Produce a structured report covering competitors, trends, audience pain points, and opportunities.
Use the deep-research-pro format with an Executive Summary, sections, and Key Takeaways.`;

  const hadResearchCache = cache.has(cacheKey(researchAgent.name, researchPrompt));

  // Uses Google Search grounding via deep-research-pro methodology
  const research = await runResearchAgent(researchAgent, researchPrompt);
  if (!hadResearchCache) await delay(STEP_DELAY_MS);
  else usedCache = true;

  // ── Step 2: Content ───────────────────────────────────────────────────────
  log("PIPELINE", "Step 2/3 — Content Agent");

  const contentPrompt = `Industry: ${input.industry}
Target Audience: ${input.targetAudience}
Goal: ${input.goal}

Research Findings:
${research}

Write ONE strong, concise marketing piece including:
- A punchy headline
- 2–3 sentence body copy
- A clear call-to-action

Keep it direct. No variations needed.`;

  const hadContentCache = cache.has(cacheKey(contentAgent.name, contentPrompt));

  const content = await runAgent(contentAgent, contentPrompt, "content");
  if (!hadContentCache) await delay(STEP_DELAY_MS);
  else usedCache = true;

  // ── Step 3: Creative Director ─────────────────────────────────────────────
  log("PIPELINE", "Step 3/3 — Creative Director Agent");

  const creativePrompt = `Refine and polish this marketing content to a premium level.

Content:
${content}

Industry: ${input.industry} | Audience: ${input.targetAudience} | Goal: ${input.goal}

Improve tone, sharpness, and conversion potential. Return only the final version.`;

  const final = await runAgent(creativeDirectorAgent, creativePrompt, "final");

  log("PIPELINE", "Complete");

  return { research, content, final, cached: usedCache };
}
