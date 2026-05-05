# OpenClaw — Developer Guide

> **Who this is for:** A developer who wants to fully understand the system — not just run it.
> After reading this, you should be able to modify any part of the pipeline, add agents, debug failures, and extend the system confidently.

---

## Table of Contents

1. [What This System Does](#1-what-this-system-does)
2. [Repository Layout](#2-repository-layout)
3. [How to Run](#3-how-to-run)
4. [The Two Workflows](#4-the-two-workflows)
5. [The 6 Layers — Step by Step](#5-the-6-layers--step-by-step)
6. [The SharedContext Object](#6-the-sharedcontext-object)
7. [Agent File Structure](#7-agent-file-structure)
8. [Database Layer](#8-database-layer)
9. [Embeddings](#9-embeddings)
10. [Database Schema](#10-database-schema)
11. [Configuration Files](#11-configuration-files)
12. [Web Search Integration](#12-web-search-integration)
13. [Pipeline Output](#13-pipeline-output)
14. [Scoring Deep Dive](#14-scoring-deep-dive)
15. [Debugging Common Issues](#15-debugging-common-issues)
16. [Tuning Agent Prompts](#16-tuning-agent-prompts)
17. [How to Add a New Agent](#17-how-to-add-a-new-agent)
18. [MVP Workflow](#18-mvp-workflow)
19. [Performance](#19-performance)
20. [Environment Variables](#20-environment-variables)
21. [Design Decisions](#21-design-decisions)
22. [What to Change First](#22-what-to-change-first)

---

## 1. What This System Does

OpenClaw is a **20-agent AI marketing pipeline**. You give it a campaign brief and it returns a production-ready campaign — with platform-specific copy, quality scores, and extracted patterns for future learning.

```
INPUT                          OUTPUT
──────                         ──────
Industry          ──►  Hero headline + subheadline + body copy + CTA
Target Audience   ──►  Platform versions (Instagram, LinkedIn, Google Ads...)
Campaign Goal     ──►  Content repurposed into 7 formats
Brand Voice       ──►  Evaluation score /10 with iteration count
                  ──►  Learned patterns stored for future runs
```

**Key facts at a glance:**

| Property | Value |
|---|---|
| Total agents | 20 |
| Pipeline layers | 6 |
| Model | Ollama (`qwen2.5:3b`) — local, free |
| Database | Supabase (optional — falls back to in-memory) |
| Runtime | ~70–90 seconds |
| Entry point | `index.ts` → `workflows/fullSystem.workflow.ts` |
| Language | TypeScript, runs via `tsx` (no build step) |

**The pipeline in one line:**
```
Brief → Research → Strategy → Content → Evaluate/Refine (×3 max) → Deploy → Learn
```

---

## 2. Repository Layout

```
.openclaw/
│
├── index.ts                          ← CLI: collects input, displays output
├── package.json                      ← deps: @supabase/supabase-js, tsx
├── tsconfig.json                     ← ES2022, strict, moduleResolution: bundler
├── openclaw.json                     ← system config: model, Ollama, plugins
├── .env.example                      ← env template
├── supabase_schema.sql               ← PostgreSQL schema + seed data
│
├── workflows/
│   ├── fullSystem.workflow.ts        ← MAIN: all 20 agents, 6 layers
│   └── mvp.workflow.ts               ← FAST: 3 agents, for testing/demo
│
├── agents/main/custom/               ← 20 agent definitions
│   ├── orchestrator.agent.ts
│   ├── research.agent.ts             ┐
│   ├── competitorAnalyst.agent.ts    │ Layer 1: Intelligence
│   ├── trendAnalyst.agent.ts         │
│   ├── audienceAnalyst.agent.ts      ┘
│   ├── strategy.agent.ts             ┐
│   ├── offerPositioning.agent.ts     │ Layer 2: Strategy
│   ├── contentPlanner.agent.ts       ┘
│   ├── content.agent.ts              ┐
│   ├── creativeVariations.agent.ts   │ Layer 3: Creation
│   ├── designIntelligence.agent.ts   ┘
│   ├── critic.agent.ts               ┐
│   ├── goldComparator.agent.ts       │ Layer 4: Evaluation Loop
│   ├── scoring.agent.ts              │
│   ├── refinement.agent.ts           ┘
│   ├── campaignExecution.agent.ts    ┐
│   ├── platformOptimization.agent.ts │ Layer 5: Execution
│   ├── repurposing.agent.ts          ┘
│   ├── learning.agent.ts             ┐ Layer 6: Learning
│   ├── workflowOptimizer.agent.ts    ┘
│   └── creativeDirector.agent.ts     ← Final quality gate (post-evaluation)
│
├── agents/main/agent/
│   ├── models.json                   ← Ollama model capabilities
│   └── auth-profiles.json            ← Google API key
│
├── utils/
│   ├── context.ts                    ← SharedContext type + createContext()
│   ├── db.ts                         ← Supabase CRUD + in-memory fallback
│   ├── embeddings.ts                 ← mock embedding (128-dim) + real options
│   └── supabaseClient.ts             ← Supabase client init
│
└── extensions/
    └── openclaw-web-search/          ← web search plugin for research agent
```

---

## 3. How to Run

```bash
# 1. Install dependencies
npm install

# 2. Start Ollama (must be running before the pipeline starts)
ollama serve
ollama pull qwen2.5:3b

# 3. Configure environment
cp .env.example .env
# Edit .env — SUPABASE_URL and SUPABASE_ANON_KEY are optional

# 4. Run
npm start
```

`npm start` runs `npx tsx --env-file=.env index.ts`. TypeScript is compiled on the fly — no build step.

**You'll be prompted for:**

```
Industry       →  e.g. "SaaS", "Finance", "Health & Wellness"
Audience       →  e.g. "B2B marketing leaders at mid-size companies"
Goal           →  e.g. "lead generation", "product launch", "brand awareness"
Brand Voice    →  optional — e.g. "professional, bold, empathetic"
```

> **Note:** Supabase is fully optional. If not configured, the pipeline runs fine with in-memory storage. Data just won't persist across sessions.

---

## 4. The Two Workflows

### `fullSystem.workflow.ts` — Production Pipeline

All 20 agents, 6 layers, evaluation loop, DB storage, pattern learning. This is the real thing.

**Key constants (change these to tune the system):**

```typescript
const OLLAMA_HOST      = "http://127.0.0.1:11434"
const OLLAMA_MODEL     = "qwen2.5:3b"    // ← change model here
const SCORE_THRESHOLD  = 8               // ← quality gate (0-10)
const MAX_ITERATIONS   = 3               // ← max refinement retries
const STEP_DELAY_MS    = 1500            // ← pause between agent calls
const MAX_TOKENS       = 2048            // ← token budget per agent
const RESEARCH_TOKENS  = 3000            // ← research gets more tokens
```

**Two core functions everything flows through:**

`callOllama(systemPrompt, userPrompt, options)` — the only HTTP call in the pipeline. POSTs to Ollama's `/api/chat` endpoint, returns the response string.

`runAgent(agent, prompt, options)` — wraps `callOllama()` with:
- 3 retries + 5s backoff on failure
- Mock fallback if all retries fail (pipeline never crashes)
- Auto-logging to `ctx.metadata.agentLogs`

---

### `mvp.workflow.ts` — Fast Testing Pipeline

Three agents only: **Research → Content Writer → Creative Director**

- Runs in ~10 seconds vs 90 seconds
- Has in-memory cache: same input = instant re-run within the same process
- Use this when testing prompt changes or debugging early in the pipeline

---

## 5. The 6 Layers — Step by Step

### Layer 1 · Intelligence
*4 agents — ~12 seconds*

Each agent builds on the previous. All outputs land in `ctx.intelligence.*`.

| Agent | What It Produces | Context Key |
|---|---|---|
| `research-agent` | Deep market research report. Gets 3000 tokens. Can use live web search if configured. | `ctx.intelligence.research` |
| `competitor-analyst-agent` | Top 3–5 competitors: messaging, strengths, weaknesses, white-space angles | `ctx.intelligence.competitors` |
| `trend-analyst-agent` | Macro/micro/platform trends with risk flags for inauthentic usage | `ctx.intelligence.trends` |
| `audience-analyst-agent` | Demographics, psychographics, pain points, purchase triggers, and exact audience vocabulary | `ctx.intelligence.audience` |

> The audience vocabulary extracted here feeds directly into the content writer in Layer 3.

---

### Layer 2 · Strategy
*3 agents — ~8 seconds*

Synthesizes Layer 1 into an actionable blueprint. Outputs go to `ctx.strategy.*`.

| Agent | What It Produces | Context Key |
|---|---|---|
| `strategy-agent` | Campaign objective, core insight, positioning statement, top 3 messages, channel mix + budget weights, KPIs | `ctx.strategy.strategy` |
| `offer-positioning-agent` | Offer structure, value prop, proof points, risk reversals (guarantees/trials), urgency elements, 3 hook angles with emotion tags | `ctx.strategy.positioning` |
| `content-planner-agent` | Content pillars, format guidance per channel, tone guidelines, phased calendar (Awareness → Consideration → Conversion → Retention) | `ctx.strategy.contentPlan` |

---

### Layer 3 · Creation
*3 agents — ~8 seconds*

Generates the actual marketing assets. Outputs go to `ctx.content.*`.

| Agent | What It Produces | Context Key |
|---|---|---|
| `content-writer-agent` | Hero headline, subheadline, body copy, CTA, social proof, objection handler, urgency line | `ctx.content.written` + `ctx.content.current` |
| `creative-variations-agent` | 3 tonal variations: **SAFE** (conservative), **BOLD** (provocative), **PREMIUM** (aspirational) — each with short/long-form + ad headline | `ctx.content.variations` |
| `design-intelligence-agent` | Color palette (hex codes + usage rules), typography, imagery direction, layout principles, DOs and DON'Ts | `ctx.content.designBrief` |

> `ctx.content.current` is the live copy that the evaluation loop mutates. It starts as a copy of `ctx.content.written`.

---

### Layer 4 · Evaluation Loop
*3–4 agents per iteration — up to 3 iterations*

The most complex part. Runs until content scores ≥ 8 or 3 iterations are exhausted.

```
┌─────────────────────────────────────────────────────┐
│  critic-agent        → scores 8 dimensions (1-10)   │
│  gold-comparator     → alignment vs benchmarks       │
│  scoring-agent       → composite score               │
│                                                      │
│  score >= 8          → pass to Creative Director     │
│  score < 8           → refinement-agent rewrites     │
│  iteration >= 3      → pass regardless               │
└─────────────────────────────────────────────────────┘
         ↑_______________repeat if needed______________↓
```

**critic-agent** — Scores 8 dimensions: Clarity, Relevance, Differentiation, Emotional Impact, Conversion Potential, Authenticity, Brand Alignment, Originality. Produces weighted overall + actionable feedback.

**gold-comparator-agent** — Compares content against gold standard examples from the database. Uses cosine similarity on embeddings to find relevant benchmarks. Produces alignment score (0–10) and gap analysis.

**scoring-agent** — Calculates the composite score (see [Scoring Deep Dive](#14-scoring-deep-dive)).

**refinement-agent** — If score < 8: rewrites `ctx.content.current` based on all feedback. Includes a change log and which elements were preserved.

After the loop, **creative-director-agent** does the final pass — synthesizes everything, adds premium polish, and produces the quality verdict (approved / approved with notes / needs revision).

---

### Layer 5 · Execution
*3 agents — ~8 seconds*

Prepares content for actual deployment. Outputs go to `ctx.execution.*`.

| Agent | What It Produces |
|---|---|
| `campaign-execution-agent` | Pre-launch checklist, day-by-day launch sequence, platform specs (sizes/formats/limits), budget allocation, risk flags, Week 1 benchmarks |
| `platform-optimization-agent` | Platform-specific copy for: Instagram, LinkedIn, Facebook, Twitter/X, YouTube, Email, Google Ads — each with hashtags, posting times, algorithm notes |
| `repurposing-agent` | 7 formats: blog outline, email newsletter (hook/value/CTA), 5 social captions, 60s video script, 3 pull-quote graphics, podcast script, infographic outline |

---

### Layer 6 · Learning
*2 agents — ~5 seconds*

**learning-agent** — Extracts patterns from the run: what drove high scores, what caused failures, audience/industry-specific patterns. Each pattern gets a confidence score (0–1). Stored to `learned_patterns` in Supabase — accumulates across runs.

**workflow-optimizer-agent** — Identifies bottlenecks, parallelization opportunities, agents that could be skipped for certain inputs. Output lives in `ctx.learning` for future pipeline tuning.

---

## 6. The SharedContext Object

One object flows through the entire pipeline. Every agent reads from it and writes to it. Defined in `utils/context.ts`.

```typescript
interface SharedContext {
  // ── Input ─────────────────────────────────────────
  input: CampaignInput               // Original user input (never mutated)

  // ── Layer 1: Intelligence ─────────────────────────
  intelligence: {
    research?: string
    competitors?: Record<string, unknown>
    trends?: Record<string, unknown>
    audience?: Record<string, unknown>
  }

  // ── Layer 2: Strategy ─────────────────────────────
  strategy: {
    strategy?: Record<string, unknown>
    positioning?: Record<string, unknown>
    contentPlan?: Record<string, unknown>
  }

  // ── Layer 3: Creation ─────────────────────────────
  content: {
    written?: Record<string, unknown>
    variations?: Record<string, unknown>
    designBrief?: Record<string, unknown>
    current?: Record<string, unknown>  // ← mutated by refinement loop
  }

  // ── Layer 4: Evaluation ───────────────────────────
  evaluation: {
    criticOutput?: Record<string, unknown>
    comparatorOutput?: Record<string, unknown>
    scoringOutput?: Record<string, unknown>
    goldStandards?: Array<Record<string, unknown>>
    iteration?: number
  }

  // ── Layer 5: Execution ────────────────────────────
  execution: {
    campaignPlan?: Record<string, unknown>
    platformVersions?: Record<string, unknown>
    repurposed?: Record<string, unknown>
  }

  // ── Layer 6: Learning ─────────────────────────────
  learning: {
    patterns?: Record<string, unknown>
  }

  // ── Final output + metadata ───────────────────────
  score: number                      // Composite score (0-10)
  finalOutput?: Record<string, unknown>
  metadata: {
    startedAt: string
    completedAt?: string
    totalIterations: number
    agentLogs: Array<{ agent: string; timestamp: string; note: string }>
    dbOutputId?: string              // Supabase generated_outputs UUID
  }
}
```

> **Critical:** `ctx.content.current` is the only field that gets overwritten during normal execution. The refinement agent replaces it on each failed iteration. Whatever is in `ctx.content.current` when the evaluation loop ends is what the creative director polishes.

---

## 7. Agent File Structure

Every agent is a plain TypeScript object:

```typescript
// agents/main/custom/research.agent.ts
export const researchAgent = {
  name: "research-agent",
  role: "Senior Market Research Analyst",
  goal: "Deliver a comprehensive market research report...",
  instructions: `
    You are a senior market research analyst...
    [Detailed system prompt]
    Output format: JSON with keys: { summary, competitors, trends, opportunities }
  `
}
```

| Field | Purpose |
|---|---|
| `name` | Unique ID used in logs |
| `role` | Job title — sets LLM persona |
| `goal` | Mission statement — often injected into user prompt |
| `instructions` | The actual system prompt sent to the LLM |

In the workflow, agents are called like this:

```typescript
const result = await runAgent(
  researchAgent,
  `Industry: ${ctx.input.industry}\nAudience: ${ctx.input.targetAudience}`,
  { maxTokens: RESEARCH_TOKENS, temperature: 0.4 }
)
ctx.intelligence.research = result  // raw string stored directly
// or: ctx.intelligence.competitors = JSON.parse(result)
```

---

## 8. Database Layer

`utils/db.ts` — four functions, each tries Supabase first, falls back to `memStore` (a module-level `Map`) if unavailable.

```
┌──────────────────────────────────────────────────────────┐
│  retrieveSimilarGoldStandards(input, industry, limit)    │
│  → embed input text                                      │
│  → fetch all gold_standards for industry from Supabase   │
│  → rank by cosine similarity                             │
│  → return top N                                          │
├──────────────────────────────────────────────────────────┤
│  storeGeneratedOutput(output)                            │
│  → save final content to generated_outputs               │
│  → returns UUID → stored in ctx.metadata.dbOutputId      │
├──────────────────────────────────────────────────────────┤
│  storeEvaluation(evaluation)                             │
│  → save score + feedback for each iteration              │
│  → requires dbOutputId to exist first (FK constraint)    │
├──────────────────────────────────────────────────────────┤
│  storePatterns(patterns[])                               │
│  → save learning-agent output to learned_patterns        │
│  → accumulates across runs                               │
└──────────────────────────────────────────────────────────┘
```

**Fallback behavior:** If Supabase isn't configured or a query fails, all four functions silently use the in-memory `memStore`. The pipeline never crashes. Data just doesn't persist past the current session.

---

## 9. Embeddings

`utils/embeddings.ts` currently uses a **mock embedding** — converts text to a 128-dim vector using character codes. It's deterministic but not semantic.

**What this means in practice:**
- Different texts → different embeddings ✓
- Similar texts → similar embeddings ✗ (not semantic)
- Cosine similarity math works, but results aren't meaningful ✗

**To enable real embeddings**, replace the function body in `utils/embeddings.ts`:

```typescript
// Option A: Ollama — local, free (pull nomic-embed-text first)
const res = await fetch("http://127.0.0.1:11434/api/embeddings", {
  method: "POST",
  body: JSON.stringify({ model: "nomic-embed-text", prompt: text })
})
const { embedding } = await res.json()
return embedding

// Option B: OpenAI
const res = await fetch("https://api.openai.com/v1/embeddings", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  body: JSON.stringify({ model: "text-embedding-3-small", input: text })
})
const { data } = await res.json()
return data[0].embedding
```

> Also update the Supabase schema to use `pgvector` instead of `jsonb` for the `embedding` column if you want database-level similarity queries.

---

## 10. Database Schema

Four tables defined in `supabase_schema.sql`:

```
gold_standards                     generated_outputs
──────────────                     ─────────────────
id          uuid PK                id          uuid PK
content     text                   content     text
industry    text  (filter key)     input       jsonb  (CampaignInput)
content_type text                  embedding   jsonb
embedding   jsonb                  version     integer
metadata    jsonb                  created_at  timestamptz
created_at  timestamptz

evaluations                        learned_patterns
───────────                        ────────────────
id          uuid PK                id          uuid PK
generated_output_id  uuid FK  →    pattern     text
score       numeric(4,2)           type        text  (headline/cta/tone...)
critic_score  numeric(4,2)         confidence  numeric(4,3)  [0.0–1.0]
comparator_score  numeric(4,2)     created_at  timestamptz
feedback    text
created_at  timestamptz
```

**Seed data included:** 3 gold standard examples for Notion-style SaaS, Acorns-style fintech, and HoneyBook-style creative services. Add more for better comparator quality.

---

## 11. Configuration Files

### `openclaw.json` — Main System Config

```json
{
  "agents.defaults": {
    "model.primary": "ollama/qwen3.5",
    "workspace": "C:\\Users\\Subho\\.openclaw\\workspace"
  },
  "models.providers.ollama": {
    "baseUrl": "http://127.0.0.1:11434",
    "models": [{ "id": "qwen3.5", "contextWindow": 262144, "reasoning": true }]
  },
  "gateway": { "mode": "local", "port": 18789, "bind": "loopback" },
  "plugins": {
    "allow": ["openclaw-web-search", "google"],
    "entries": {
      "google": { "enabled": true, "config.webSearch.apiKey": "..." }
    }
  }
}
```

> **Model mismatch:** `openclaw.json` specifies `qwen3.5` but `fullSystem.workflow.ts` hardcodes `qwen2.5:3b`. The workflow wins because it calls Ollama directly. Change `OLLAMA_MODEL` in the workflow file to switch models.

### `agents/main/agent/models.json`

Declares model capabilities for the agent framework layer: context window size (262k), max tokens (8192), cost (0 for local).

### `agents/main/agent/auth-profiles.json`

Stores the Google API key for web search. Mirrored in `openclaw.json`.

---

## 12. Web Search Integration

When `openclaw-web-search` extension is active and the Google API key is valid, live search results are injected into the research agent's prompt:

```typescript
// Pseudo-code from the workflow
const searchContext = await webSearch(
  `${input.industry} ${input.targetAudience} marketing trends 2024`
)
const researchPrompt = `
  Web search results:
  ${searchContext}

  Based on this, perform deep market research for:
  Industry: ${input.industry}
  ...
`
```

Without web search, the research agent uses training data only — still works, just not current.

**If web search isn't working, check:**
1. Google API key in `openclaw.json` is valid and has Custom Search enabled
2. `openclaw-web-search` is in the `plugins.allow` list
3. The extension in `extensions/openclaw-web-search/` implements the expected interface

---

## 13. Pipeline Output

When the pipeline finishes, `index.ts` displays results in this order:

```
1. Final Campaign Content     ← ctx.finalOutput
   ├── Headline, subheadline, body, CTA, social proof, urgency
   └── Campaign concept statement

2. Evaluation Scores          ← ctx.evaluation.scoringOutput
   ├── Final score /10
   ├── Iteration count
   └── Pass/fail verdict

3. Platform Versions          ← ctx.execution.platformVersions (top 3)

4. Learned Patterns           ← ctx.learning.patterns

5. Creative Director Notes    ← ctx.finalOutput.creativeDirectorNotes

6. Recommended Next Steps     ← ctx.finalOutput.recommendedNextSteps

7. Execution Log              ← ctx.metadata.agentLogs (timestamped per agent)

8. Total pipeline time        ← completedAt - startedAt
```

---

## 14. Scoring Deep Dive

### Critic Dimensions (each scored 1–10)

| Dimension | What It Measures |
|---|---|
| Clarity | Is the message immediately understandable without context? |
| Relevance | Does it speak to the specific audience's needs? |
| Differentiation | Does it stand out from competitor messaging? |
| Emotional Impact | Does it evoke the intended feeling? |
| Conversion Potential | Does it drive the desired action? |
| Authenticity | Does it feel genuine, not corporate-speak? |
| Brand Alignment | Consistent with the stated brand voice? |
| Originality | Fresh angle, not a cliché? |

### Composite Score Formula

```
Final Score = (Critic_Overall × 0.5)
            + (Comparator_Alignment × 0.3)
            + (Completeness × 0.2)

Range: 0–10   |   Pass threshold: ≥ 8
```

Completeness checks that all expected elements are present: headline, subheadline, body copy, CTA, social proof, objection handler, urgency line.

### Refinement Decision Logic

```typescript
if (score >= SCORE_THRESHOLD || iteration >= MAX_ITERATIONS) {
  // proceed to creative director
} else {
  iteration++
  // refinement-agent rewrites ctx.content.current
  // evaluation loop restarts
}
```

`iteration` is tracked in both `ctx.evaluation.iteration` and `ctx.metadata.totalIterations`.

---

## 15. Debugging Common Issues

### Pipeline stalls or times out

Ollama isn't running or the model isn't pulled.

```bash
ollama list                    # check qwen2.5:3b is available
curl http://127.0.0.1:11434    # check server is up
```

---

### All agents return mock responses

`runAgent()` exhausted all 3 retries and fell back to hardcoded mocks. Check Ollama:

```bash
ollama serve    # watch stdout for errors
```

---

### Score never reaches 8

The model consistently produces low-quality structured output. Try:
- Lower `SCORE_THRESHOLD` to `7` in `fullSystem.workflow.ts`
- Switch to a larger model: `qwen2.5:14b` or `llama3.1:8b`
- Add more high-quality gold standard examples to Supabase

---

### Supabase errors

Pipeline auto-falls back to in-memory — no crash. For real persistence:
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env`
- Confirm schema is applied to your Supabase project
- Check RLS policies allow inserts for the anon key

---

### JSON parse errors

LLMs sometimes return markdown-wrapped JSON (`` ```json\n{...}\n``` ``) instead of bare JSON. The workflow calls `JSON.parse()` directly — this triggers the mock fallback.

**Fix:** Add a JSON extraction helper:

```typescript
function extractJSON(text: string) {
  const match = text.match(/```json\n?([\s\S]*?)\n?```/)
              || text.match(/(\{[\s\S]*\})/)
  return match ? JSON.parse(match[1]) : JSON.parse(text)
}
```

Use this instead of raw `JSON.parse()` in the workflow.

---

## 16. Tuning Agent Prompts

Each agent's `instructions` field is its system prompt. Key levers:

**Output format** — Most agents are told to return JSON. If you want a different shape, update both `instructions` and the consumption code in the workflow.

**Temperature** — Controls creativity vs consistency. Passed per-call in the workflow:
- Research, Critic: `0.3–0.4` (consistent, factual)
- Strategy, Creation: `0.5–0.7` (balanced to creative)

**Context injection** — The workflow builds user prompts dynamically from `ctx`. If you add a new Layer 1 field, update Layer 2 prompts to reference it.

**Token budget** — Research gets 3000 tokens, everything else gets 2048. Platform optimization (8 platforms) and repurposing (7 formats) may truncate — increase their `maxTokens` if outputs look cut off.

---

## 17. How to Add a New Agent

Example: a `competitor-monitoring-agent` that detects if competitor messaging has shifted since the last run.

**Step 1 — Create the agent file**

```typescript
// agents/main/custom/competitorMonitoring.agent.ts
export const competitorMonitoringAgent = {
  name: "competitor-monitoring-agent",
  role: "Competitive Intelligence Specialist",
  goal: "Detect shifts in competitor messaging since previous campaign",
  instructions: `
    You are a competitive intelligence specialist.
    Compare current competitor data with historical patterns.
    Output JSON: {
      shifts: string[],
      urgency: "high" | "medium" | "low",
      recommendation: string
    }
  `
}
```

**Step 2 — Add a field to SharedContext** (`utils/context.ts`)

```typescript
intelligence: {
  research?: string
  competitors?: Record<string, unknown>
  trends?: Record<string, unknown>
  audience?: Record<string, unknown>
  competitorShifts?: Record<string, unknown>  // ← add this
}
```

**Step 3 — Import and call in the workflow** (`workflows/fullSystem.workflow.ts`)

```typescript
import { competitorMonitoringAgent } from "../agents/main/custom/competitorMonitoring.agent"

// After competitorAnalystAgent in Layer 1:
const monitoringResult = await runAgent(
  competitorMonitoringAgent,
  `Current competitors: ${JSON.stringify(ctx.intelligence.competitors)}`,
  { temperature: 0.3 }
)
ctx.intelligence.competitorShifts = JSON.parse(monitoringResult)
```

**Step 4 — Consume in downstream agents**

Update the strategy agent's prompt to reference `ctx.intelligence.competitorShifts`.

---

## 18. MVP Workflow

`mvp.workflow.ts` runs 3 agents: **Research → Content Writer → Creative Director**

**Use it when:**
- Testing a prompt change (don't wait 90s for the full pipeline)
- Demonstrating the system quickly
- The full pipeline is breaking and you want to isolate whether it's early or late in the chain

**In-memory caching:**

```typescript
const cache = new Map<string, string>()
const cacheKey = `${input.industry}-${input.targetAudience}-${input.goal}`
if (cache.has(cacheKey)) return cache.get(cacheKey)  // instant on repeat
```

Same input = instant re-run within the same Node process.

---

## 19. Performance

| Layer | Agents | Time |
|---|---|---|
| Intelligence | 4 | ~12s |
| Strategy | 3 | ~8s |
| Creation | 3 | ~8s |
| Evaluation × 1 iter | 3–4 | ~15s |
| Execution | 3 | ~8s |
| Learning | 2 | ~5s |
| **Total (1 eval iter)** | **~18** | **~56s** |
| **Total (3 eval iters)** | **~22** | **~86s** |

Times are for `qwen2.5:3b` on local hardware. Larger models are slower but higher quality.

`STEP_DELAY_MS = 1500` adds 1.5s between every agent call as a conservative rate limit. Reduce it if your Ollama setup handles rapid sequential requests without issue.

**Biggest wins if you want to go faster:**
- Run Layer 1 agents in parallel with `Promise.all()` — saves ~9 seconds
- Reduce `STEP_DELAY_MS` — saves ~30 seconds across 20 agents

---

## 20. Environment Variables

```bash
# .env

# Required for database persistence
# Optional — falls back to in-memory if not set
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJ...

# Optional — only needed if switching from mock embeddings
OPENAI_API_KEY=sk-...
COHERE_API_KEY=...
```

Loaded via `--env-file=.env` in `npm start`. No `dotenv` package needed.

---

## 21. Design Decisions

**Single SharedContext object** — Everything lives on one mutable object instead of discrete function arguments. Adding a new field doesn't require refactoring call signatures. You can also dump `ctx` at any point and see the complete pipeline state.

**Mock fallbacks everywhere** — Every agent has a hardcoded mock response. The pipeline always produces output — even with no Ollama, no internet, no Supabase. This lets you test the display layer independently of the AI layer.

**Sequential execution, not parallel** — Agents run one at a time with a 1.5s pause. Conservative by design to avoid overwhelming local Ollama. The `workflow-optimizer-agent` identifies which agents could safely run in parallel — that optimization just hasn't been implemented yet.

**Evaluation loop capped at 3** — Prevents infinite loops when the model consistently underscores. Three iterations is enough time for meaningful improvement while keeping runtime under 90 seconds.

**Supabase is optional** — The in-memory fallback makes the system runnable for anyone without a Supabase account. The tradeoff is that learned patterns and gold standards don't persist.

---

## 22. What to Change First

### To improve output quality

| Priority | Change | Where |
|---|---|---|
| 1 (highest) | Use a larger model | `OLLAMA_MODEL` in `fullSystem.workflow.ts` |
| 2 | Add real gold standard examples for your industry | `gold_standards` table in Supabase |
| 3 | Enable real embeddings | `utils/embeddings.ts` → replace mock |

### To add features

| Feature | Effort | What to Do |
|---|---|---|
| Parallel agents | Medium | Wrap Layer 1 agents in `Promise.all()` |
| Web UI | Medium | Expose `runFullSystem()` as an API endpoint |
| Real embeddings | Low | Replace mock in `utils/embeddings.ts` |
| Campaign history | Low | Store `ctx` to a `campaigns` table |
| Custom model per agent | Low | Pass different `model` option in `runAgent()` calls |
