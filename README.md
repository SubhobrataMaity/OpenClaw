# OpenClaw — 20-Agent AI Marketing Pipeline

A fully local, multi-agent AI system that takes a campaign brief and returns production-ready marketing content — headlines, body copy, CTAs, platform-specific versions, and more.

```
Brief → Research → Strategy → Content → Evaluate/Refine → Deploy → Learn
```

Runs entirely on your machine using [Ollama](https://ollama.com). No cloud AI required. Supabase is optional for persistence.

---

## What It Does

You provide:
- Industry (e.g. "SaaS", "Health & Wellness")
- Target audience (e.g. "B2B marketing leaders at mid-size companies")
- Campaign goal (e.g. "lead generation", "product launch")
- Brand voice (optional — e.g. "professional, bold, empathetic")

You get back:
- Hero headline, subheadline, body copy, CTA, social proof, urgency line
- 3 tonal variations (Safe / Bold / Premium)
- Platform-optimized copy for Instagram, LinkedIn, Facebook, Twitter/X, YouTube, Email, Google Ads
- Content repurposed into 7 formats (blog, email newsletter, social captions, video script, etc.)
- Quality score /10 with iteration count
- Design brief (colors, typography, imagery direction)
- Learned patterns stored for future runs

---

## Architecture

20 agents across 6 layers:

| Layer | Agents | What Happens |
|---|---|---|
| 1 · Intelligence | Research, Competitor Analyst, Trend Analyst, Audience Analyst | Deep market research |
| 2 · Strategy | Strategy, Offer Positioning, Content Planner | Campaign blueprint |
| 3 · Creation | Content Writer, Creative Variations, Design Intelligence | Asset generation |
| 4 · Evaluation Loop | Critic, Gold Comparator, Scoring, Refinement | Quality gate (up to 3 iterations) |
| 5 · Execution | Campaign Execution, Platform Optimization, Repurposing | Deployment-ready output |
| 6 · Learning | Learning, Workflow Optimizer | Pattern extraction + storage |

---

## Prerequisites

- [Node.js](https://nodejs.org) v18 or later
- [Ollama](https://ollama.com) installed and running locally
- `qwen2.5:3b` model pulled (or any model you prefer)

Optional:
- [Supabase](https://supabase.com) account for persistent storage and gold standard comparisons

---

## Local Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-username/openclaw-pipeline.git
cd openclaw-pipeline
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start Ollama and pull the model

```bash
# Start the Ollama server (keep this running in a separate terminal)
ollama serve

# Pull the default model
ollama pull qwen2.5:3b
```

> You can use any Ollama model. To switch, change `OLLAMA_MODEL` in `workflows/fullSystem.workflow.ts`.

### 4. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in your values. Supabase is optional — the pipeline runs fine without it using in-memory storage.

```env
# Optional — leave blank to use in-memory fallback
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### 5. (Optional) Set up Supabase

If you want data to persist across runs:

1. Create a project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor and run the contents of `supabase_schema.sql`
3. Copy your project URL and anon key into `.env`

### 6. Configure openclaw.json

Copy the example config and update it with your settings:

```bash
cp openclaw.json.example openclaw.json
```

> `openclaw.json` is excluded from git because it contains local paths and API keys. See the [Configuration](#configuration) section below.

### 7. Run

```bash
npm start
```

You'll be prompted for campaign details:

```
Industry        : SaaS
Target Audience : B2B marketing leaders at mid-size companies
Goal            : lead generation
Brand Voice     : professional, bold  (press Enter to skip)
```

The pipeline runs for ~70–90 seconds and prints the full campaign output.

---

## Quick Test (MVP Mode)

To run a fast 3-agent version (~10 seconds) for testing:

```bash
npx tsx --env-file=.env workflows/mvp.workflow.ts
```

This runs: Research → Content Writer → Creative Director only.

---

## Configuration

### `openclaw.json`

This file is not committed to the repo. Create it by copying `openclaw.json.example` and updating:

- `models.providers.ollama.baseUrl` — Ollama server URL (default: `http://127.0.0.1:11434`)
- `models.providers.ollama.models[0].id` — model name to use
- `plugins.entries.google.config.webSearch.apiKey` — Google Custom Search API key (optional, for live web search in the research agent)

### Key constants in `workflows/fullSystem.workflow.ts`

```typescript
const OLLAMA_MODEL     = "qwen2.5:3b"   // change to any pulled model
const SCORE_THRESHOLD  = 8              // quality gate (0–10)
const MAX_ITERATIONS   = 3              // max refinement retries
const STEP_DELAY_MS    = 1500           // pause between agent calls
const MAX_TOKENS       = 2048           // token budget per agent
```

---

## Embeddings

By default the system uses a mock embedding (deterministic, not semantic). To enable real semantic similarity for the gold standard comparator, update `utils/embeddings.ts`:

**Option A — Ollama (free, local):**
```bash
ollama pull nomic-embed-text
```
Then replace the function body in `utils/embeddings.ts` with the Ollama embeddings call (see comments in that file).

**Option B — OpenAI:**
Add `OPENAI_API_KEY` to `.env` and use the OpenAI embeddings API (see comments in `utils/embeddings.ts`).

---

## Project Structure

```
├── index.ts                        ← CLI entry point
├── workflows/
│   ├── fullSystem.workflow.ts      ← Full 20-agent pipeline
│   └── mvp.workflow.ts             ← Fast 3-agent pipeline for testing
├── agents/main/custom/             ← 20 agent definitions
├── utils/
│   ├── context.ts                  ← SharedContext type
│   ├── db.ts                       ← Supabase + in-memory fallback
│   ├── embeddings.ts               ← Embedding generation
│   └── supabaseClient.ts           ← Supabase client init
├── extensions/
│   └── openclaw-web-search/        ← Web search plugin
├── supabase_schema.sql             ← DB schema + seed data
├── .env.example                    ← Environment variable template
└── DEVELOPER_GUIDE.md              ← Deep technical documentation
```

---

## Troubleshooting

**Pipeline stalls or times out**
Ollama isn't running or the model isn't pulled.
```bash
ollama list                   # check qwen2.5:3b is available
curl http://127.0.0.1:11434   # check server is up
```

**All agents return mock responses**
The pipeline exhausted retries and fell back to hardcoded mocks. Run `ollama serve` and check for errors.

**Score never reaches 8**
Try lowering `SCORE_THRESHOLD` to `7`, or switch to a larger model like `qwen2.5:14b`.

**Supabase errors**
The pipeline auto-falls back to in-memory — no crash. Verify your `.env` values and that the schema has been applied.

For more, see [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md).

---

## License

MIT
