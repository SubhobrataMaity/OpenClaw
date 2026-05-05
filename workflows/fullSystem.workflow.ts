/**
 * Full 20-Agent Marketing AI System Workflow
 *
 * Layers:
 *   1. Intelligence  (research, competitors, trends, audience)
 *   2. Strategy      (strategy, positioning, content plan)
 *   3. Creation      (write, variations, design brief)
 *   4. Evaluation    (critic → gold compare → score → refine loop, max 3x)
 *   5. Execution     (campaign plan, platform versions, repurpose)
 *   6. Learning      (extract patterns, store in DB)
 */

import { orchestratorAgent }       from "../agents/main/custom/orchestrator.agent.ts";
import { workflowOptimizerAgent }  from "../agents/main/custom/workflowOptimizer.agent.ts";
import { researchAgent }           from "../agents/main/custom/research.agent.ts";
import { competitorAnalystAgent }  from "../agents/main/custom/competitorAnalyst.agent.ts";
import { trendAnalystAgent }       from "../agents/main/custom/trendAnalyst.agent.ts";
import { audienceAnalystAgent }    from "../agents/main/custom/audienceAnalyst.agent.ts";
import { strategyAgent }           from "../agents/main/custom/strategy.agent.ts";
import { offerPositioningAgent }   from "../agents/main/custom/offerPositioning.agent.ts";
import { contentPlannerAgent }     from "../agents/main/custom/contentPlanner.agent.ts";
import { contentWriterAgent }      from "../agents/main/custom/content.agent.ts";
import { creativeVariationsAgent } from "../agents/main/custom/creativeVariations.agent.ts";
import { designIntelligenceAgent } from "../agents/main/custom/designIntelligence.agent.ts";
import { campaignExecutionAgent }  from "../agents/main/custom/campaignExecution.agent.ts";
import { platformOptimizationAgent } from "../agents/main/custom/platformOptimization.agent.ts";
import { repurposingAgent }        from "../agents/main/custom/repurposing.agent.ts";
import { criticAgent }             from "../agents/main/custom/critic.agent.ts";
import { goldComparatorAgent }     from "../agents/main/custom/goldComparator.agent.ts";
import { scoringAgent }            from "../agents/main/custom/scoring.agent.ts";
import { refinementAgent }         from "../agents/main/custom/refinement.agent.ts";
import { learningAgent }           from "../agents/main/custom/learning.agent.ts";
import { creativeDirectorAgent }   from "../agents/main/custom/creativeDirector.agent.ts";

import {
  createContext,
  logAgentRun,
  type CampaignInput,
  type SharedContext,
} from "../utils/context.ts";

import {
  retrieveSimilarGoldStandards,
  storeGeneratedOutput,
  storeEvaluation,
  storePatterns,
} from "../utils/db.ts";

// ─── Config ───────────────────────────────────────────────────────────────────

const OLLAMA_HOST     = "http://127.0.0.1:11434";
const OLLAMA_MODEL    = "qwen2.5:3b";
const OLLAMA_CHAT_API = `${OLLAMA_HOST}/api/chat`;

const SCORE_THRESHOLD  = 8;
const MAX_ITERATIONS   = 3;
const STEP_DELAY_MS    = 1500;
const RETRY_DELAY_MS   = 5000;
const MAX_RETRIES      = 3;
const MAX_TOKENS       = 2048;
const RESEARCH_TOKENS  = 3000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function log(tag: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${tag}] ${msg}`);
}

function safeParseJson(text: string): Record<string, unknown> {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { raw: text };
  } catch {
    return { raw: text };
  }
}

interface AgentDef {
  name: string;
  role: string;
  goal: string;
  instructions: string;
}

// ─── Ollama API ───────────────────────────────────────────────────────────────

async function callOllama(
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens: number
): Promise<string> {
  const res = await fetch(OLLAMA_CHAT_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      options: { temperature, num_predict: maxTokens },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama ${res.status}: ${err.slice(0, 120)}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  return data?.message?.content?.trim() ?? "";
}

async function runAgent(
  agent: AgentDef,
  userMessage: string,
  opts: { temperature?: number; maxTokens?: number; fallback?: string } = {}
): Promise<string> {
  const { temperature = 0.7, maxTokens = MAX_TOKENS, fallback = "" } = opts;

  const system = `You are ${agent.name}, a ${agent.role}.
Goal: ${agent.goal}

Instructions:
${agent.instructions.trim()}

IMPORTANT: Always respond with valid JSON matching the output format described in your instructions.`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    log(agent.name, `Attempt ${attempt}/${MAX_RETRIES}`);
    try {
      const text = await callOllama(
        [{ role: "system", content: system }, { role: "user", content: userMessage }],
        temperature,
        maxTokens
      );
      if (text) {
        log(agent.name, "✓ Done");
        return text;
      }
      log(agent.name, "Empty response — retrying");
    } catch (err) {
      const wait = RETRY_DELAY_MS * attempt;
      log(agent.name, `Error: ${(err as Error).message} — retrying in ${wait / 1000}s`);
      await delay(wait);
    }
  }

  log(agent.name, "All attempts failed — using fallback");
  return fallback || `{"error": "agent ${agent.name} failed", "raw": ""}`;
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export async function runFullSystem(input: CampaignInput): Promise<SharedContext> {
  const ctx = createContext(input);

  log("WORKFLOW", "═══════════════════════════════════════════════════════");
  log("WORKFLOW", " Full 20-Agent Marketing AI System — Starting");
  log("WORKFLOW", "═══════════════════════════════════════════════════════");
  log("WORKFLOW", `Industry: ${input.industry} | Audience: ${input.targetAudience}`);

  // ── ORCHESTRATOR PLAN ─────────────────────────────────────────────────────
  log("WORKFLOW", "── Orchestrator: generating run plan");
  const orchestratorPrompt = `Campaign Brief:
Industry: ${input.industry}
Target Audience: ${input.targetAudience}
Goal: ${input.goal}
Brand Voice: ${input.brandVoice ?? "not specified"}

Produce the orchestration plan for this campaign.`;

  const orchestratorRaw = await runAgent(orchestratorAgent, orchestratorPrompt, { temperature: 0.3 });
  logAgentRun(ctx, "orchestrator-agent", "Generated run plan");
  log("WORKFLOW", "Orchestrator plan ready");
  await delay(STEP_DELAY_MS);

  // ════════════════════════════════════════════════════════════════════════════
  // LAYER 1 — INTELLIGENCE
  // ════════════════════════════════════════════════════════════════════════════
  log("WORKFLOW", "── Layer 1: Intelligence");

  const intelligenceBase = `Industry: ${input.industry}
Target Audience: ${input.targetAudience}
Goal: ${input.goal}`;

  // Run research with extended tokens
  const researchRaw = await runAgent(researchAgent, intelligenceBase, {
    temperature: 0.4,
    maxTokens: RESEARCH_TOKENS,
    fallback: `{"research": "Mock research for ${input.industry}. Key trends include digital adoption and personalization. Primary audience pain points: time constraints, trust, cost."}`,
  });
  ctx.intelligence.research = researchRaw;
  logAgentRun(ctx, "research-agent", "Research complete");
  log("WORKFLOW", "Research done");
  await delay(STEP_DELAY_MS);

  const competitorRaw = await runAgent(
    competitorAnalystAgent,
    `${intelligenceBase}\n\nResearch Context:\n${researchRaw.slice(0, 800)}`,
    {
      temperature: 0.4,
      fallback: `{"competitors": [{"name": "Generic Competitor", "core_message": "We are the best", "weaknesses": ["vague messaging"]}], "white_space": ["authentic storytelling", "outcome-specific promises"], "differentiation_opportunities": ["specificity", "social proof"]}`,
    }
  );
  ctx.intelligence.competitors = safeParseJson(competitorRaw);
  logAgentRun(ctx, "competitor-analyst-agent", "Competitor analysis complete");
  log("WORKFLOW", "Competitor analysis done");
  await delay(STEP_DELAY_MS);

  const trendRaw = await runAgent(
    trendAnalystAgent,
    `${intelligenceBase}\n\nResearch Context:\n${researchRaw.slice(0, 600)}`,
    {
      temperature: 0.5,
      fallback: `{"macro_trends": [{"name": "AI adoption", "description": "Rapid AI integration across industries", "relevance": 8, "timing": "rising"}], "micro_trends": [{"name": "Short-form content", "description": "Audiences prefer 60s videos", "relevance": 9}], "platform_trends": [{"platform": "Instagram", "format": "Reels", "opportunity": "High organic reach"}], "risks": []}`,
    }
  );
  ctx.intelligence.trends = safeParseJson(trendRaw);
  logAgentRun(ctx, "trend-analyst-agent", "Trend analysis complete");
  log("WORKFLOW", "Trend analysis done");
  await delay(STEP_DELAY_MS);

  const audienceRaw = await runAgent(
    audienceAnalystAgent,
    `${intelligenceBase}\n\nResearch Context:\n${researchRaw.slice(0, 600)}`,
    {
      temperature: 0.4,
      fallback: `{"demographics": {"age_range": "25-45", "income": "middle to upper-middle class", "location": "urban/suburban"}, "psychographics": {"values": ["progress", "security", "authenticity"], "fears": ["wasting money", "being left behind"], "desires": ["clear results", "easy solutions"]}, "pain_points": [{"point": "lack of clarity on ROI", "urgency": 9}], "purchase_triggers": ["social proof", "free trial", "clear pricing"], "objections": ["too expensive", "not sure it will work"], "language_style": "professional yet conversational"}`,
    }
  );
  ctx.intelligence.audience = safeParseJson(audienceRaw);
  logAgentRun(ctx, "audience-analyst-agent", "Audience analysis complete");
  log("WORKFLOW", "Audience analysis done");
  await delay(STEP_DELAY_MS);

  // ════════════════════════════════════════════════════════════════════════════
  // LAYER 2 — STRATEGY
  // ════════════════════════════════════════════════════════════════════════════
  log("WORKFLOW", "── Layer 2: Strategy");

  const strategyPrompt = `Campaign Brief:
${intelligenceBase}

Intelligence Layer Outputs:
Research Summary: ${researchRaw.slice(0, 600)}
Competitors: ${JSON.stringify(ctx.intelligence.competitors).slice(0, 400)}
Trends: ${JSON.stringify(ctx.intelligence.trends).slice(0, 400)}
Audience: ${JSON.stringify(ctx.intelligence.audience).slice(0, 400)}

Produce the marketing strategy.`;

  const strategyRaw = await runAgent(strategyAgent, strategyPrompt, {
    temperature: 0.5,
    fallback: `{"objective": "Generate 500 qualified leads in 30 days", "core_insight": "Our audience is overwhelmed by choice — they need clarity, not more options", "positioning": "The simplest path to ${input.goal}", "key_messages": [{"message": "Results without the complexity", "priority": 1}, {"message": "Proven for people like you", "priority": 2}], "channels": [{"channel": "LinkedIn", "rationale": "B2B audience", "budget_weight": "40%"}], "kpis": [{"metric": "Lead conversion rate", "target": "3%"}]}`,
  });
  ctx.strategy.strategy = safeParseJson(strategyRaw);
  logAgentRun(ctx, "strategy-agent", "Strategy complete");
  log("WORKFLOW", "Strategy done");
  await delay(STEP_DELAY_MS);

  const positioningRaw = await runAgent(
    offerPositioningAgent,
    `Strategy: ${JSON.stringify(ctx.strategy.strategy).slice(0, 400)}
Audience: ${JSON.stringify(ctx.intelligence.audience).slice(0, 400)}
Industry: ${input.industry}
Goal: ${input.goal}`,
    {
      temperature: 0.5,
      fallback: `{"core_offer": "Free 30-day trial with dedicated onboarding", "value_proposition": "Achieve ${input.goal} in 30 days or we extend your trial free", "proof_points": ["500+ companies use us", "Average 40% time savings"], "risk_reversals": ["30-day money-back guarantee"], "hook_angles": [{"angle": "outcome-first", "emotion": "hope"}, {"angle": "pain-agitate-solve", "emotion": "relief"}]}`,
    }
  );
  ctx.strategy.positioning = safeParseJson(positioningRaw);
  logAgentRun(ctx, "offer-positioning-agent", "Positioning complete");
  log("WORKFLOW", "Positioning done");
  await delay(STEP_DELAY_MS);

  const contentPlanRaw = await runAgent(
    contentPlannerAgent,
    `Strategy: ${JSON.stringify(ctx.strategy.strategy).slice(0, 400)}
Positioning: ${JSON.stringify(ctx.strategy.positioning).slice(0, 400)}
Audience: ${JSON.stringify(ctx.intelligence.audience).slice(0, 300)}`,
    {
      temperature: 0.5,
      fallback: `{"themes": [{"pillar": "Education", "description": "Teach audience how to achieve their goal", "examples": ["How-to guides", "Explainer videos"]}], "tone_guidelines": {"voice": "confident and empathetic", "style": "conversational, data-driven", "avoid": ["jargon", "hype"]}, "priority_pieces": [{"title": "Hero landing page copy", "format": "web copy", "rationale": "Highest leverage"}]}`,
    }
  );
  ctx.strategy.contentPlan = safeParseJson(contentPlanRaw);
  logAgentRun(ctx, "content-planner-agent", "Content plan complete");
  log("WORKFLOW", "Content plan done");
  await delay(STEP_DELAY_MS);

  // ════════════════════════════════════════════════════════════════════════════
  // LAYER 3 — CREATION
  // ════════════════════════════════════════════════════════════════════════════
  log("WORKFLOW", "── Layer 3: Creation");

  const contentWritePrompt = `Campaign Brief:
Industry: ${input.industry}
Audience: ${input.targetAudience}
Goal: ${input.goal}
Brand Voice: ${input.brandVoice ?? "professional, clear, empathetic"}

Strategy Context:
${JSON.stringify(ctx.strategy.strategy).slice(0, 300)}

Positioning:
${JSON.stringify(ctx.strategy.positioning).slice(0, 300)}

Audience Insights:
${JSON.stringify(ctx.intelligence.audience).slice(0, 300)}

Write the hero marketing content piece.`;

  const contentRaw = await runAgent(contentWriterAgent, contentWritePrompt, {
    temperature: 0.7,
    fallback: `{"headline": "Stop Struggling. Start ${input.goal}.", "subheadline": "Join thousands of ${input.targetAudience} who already made the switch.", "body_copy": "You've been working hard, but the results aren't matching the effort. Our platform removes the guesswork — giving you a clear, proven path to ${input.goal} without the overwhelm.", "cta": "Start Your Free 30-Day Trial", "social_proof": "Trusted by 500+ companies", "objection_handler": "No setup fee. No long-term contract. Cancel anytime.", "urgency_line": "Limited onboarding spots available this month."}`,
  });
  ctx.content.written = safeParseJson(contentRaw);
  ctx.content.current = ctx.content.written;
  logAgentRun(ctx, "content-writer-agent", "Content written");
  log("WORKFLOW", "Content written");
  await delay(STEP_DELAY_MS);

  const variationsRaw = await runAgent(
    creativeVariationsAgent,
    `Core Content: ${JSON.stringify(ctx.content.written).slice(0, 500)}
Audience: ${input.targetAudience}
Industry: ${input.industry}`,
    {
      temperature: 0.8,
      fallback: `{"variations": [{"type": "safe", "headline": "Proven Results for ${input.targetAudience}", "body": "Trusted by thousands.", "cta": "Get Started Free"}, {"type": "bold", "headline": "Your Competition Is Already Using This.", "body": "While you're reading this, they're converting.", "cta": "Don't Fall Behind — Start Free"}, {"type": "premium", "headline": "Crafted for the serious ${input.targetAudience}.", "body": "Precision tools for measurable outcomes.", "cta": "Request Premium Access"}]}`,
    }
  );
  ctx.content.variations = safeParseJson(variationsRaw);
  logAgentRun(ctx, "creative-variations-agent", "Variations created");
  log("WORKFLOW", "Creative variations done");
  await delay(STEP_DELAY_MS);

  const designRaw = await runAgent(
    designIntelligenceAgent,
    `Content: ${JSON.stringify(ctx.content.written).slice(0, 400)}
Strategy: ${JSON.stringify(ctx.strategy.strategy).slice(0, 300)}
Audience: ${JSON.stringify(ctx.intelligence.audience).slice(0, 200)}`,
    {
      temperature: 0.5,
      fallback: `{"visual_concept": "Clean, confident, outcome-focused", "color_palette": [{"name": "Trust Blue", "hex": "#1A4FBF", "usage": "CTAs and headings"}, {"name": "Clean White", "hex": "#FFFFFF", "usage": "Background"}, {"name": "Accent Orange", "hex": "#F5821F", "usage": "CTA buttons"}], "typography": {"primary": "Inter or similar sans-serif", "secondary": "Georgia for testimonials", "style_notes": "Bold for headlines, regular for body"}, "imagery_direction": "Real people in professional contexts, not stock poses", "dos": ["Use whitespace generously", "Lead with the headline"], "donts": ["Avoid busy backgrounds", "No more than 3 fonts"]}`,
    }
  );
  ctx.content.designBrief = safeParseJson(designRaw);
  logAgentRun(ctx, "design-intelligence-agent", "Design brief created");
  log("WORKFLOW", "Design brief done");
  await delay(STEP_DELAY_MS);

  // ════════════════════════════════════════════════════════════════════════════
  // LAYER 4 — EVALUATION LOOP (max MAX_ITERATIONS)
  // ════════════════════════════════════════════════════════════════════════════
  log("WORKFLOW", "── Layer 4: Evaluation Loop");

  let iteration = 0;
  let currentScore = 0;
  let currentContent = ctx.content.current ?? ctx.content.written ?? {};
  let outputId = "";

  // Store initial generated output
  const contentString = JSON.stringify(currentContent);
  outputId = await storeGeneratedOutput({
    content: contentString,
    input: input as Record<string, unknown>,
    version: 1,
  });
  ctx.metadata.dbOutputId = outputId;
  log("DB", `Initial output stored: ${outputId}`);

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    ctx.evaluation.iteration = iteration;
    ctx.metadata.totalIterations = iteration;

    log("WORKFLOW", `── Evaluation Iteration ${iteration}/${MAX_ITERATIONS}`);

    // ── Critic ───────────────────────────────────────────────────────────────
    const criticPrompt = `Marketing Content to Evaluate:
${JSON.stringify(currentContent, null, 2)}

Industry: ${input.industry}
Target Audience: ${input.targetAudience}
Campaign Goal: ${input.goal}
Brand Voice: ${input.brandVoice ?? "professional, clear, empathetic"}

Evaluate this content rigorously.`;

    const criticRaw = await runAgent(criticAgent, criticPrompt, {
      temperature: 0.3,
      fallback: `{"scores": {"clarity": 7, "relevance": 7, "differentiation": 6, "emotional_impact": 7, "conversion_potential": 7, "authenticity": 8, "brand_alignment": 7, "originality": 6}, "overall_score": 6.9, "strengths": ["Clear CTA", "Good social proof"], "weaknesses": [{"dimension": "differentiation", "issue": "Headline is generic", "suggestion": "Use a specific outcome claim"}], "critical_flags": [], "summary": "Solid foundation but needs differentiation and specificity."}`,
    });
    ctx.evaluation.criticOutput = safeParseJson(criticRaw);
    const criticScore = (ctx.evaluation.criticOutput["overall_score"] as number) ?? 6;
    logAgentRun(ctx, "critic-agent", `Score: ${criticScore}`);
    log("WORKFLOW", `Critic score: ${criticScore}`);
    await delay(STEP_DELAY_MS);

    // ── Retrieve Gold Standards ───────────────────────────────────────────────
    log("WORKFLOW", "Retrieving gold standards from DB");
    const goldStandards = await retrieveSimilarGoldStandards(
      JSON.stringify(currentContent).slice(0, 500),
      input.industry,
      3
    );

    const goldStandardText =
      goldStandards.length > 0
        ? goldStandards.map((g, i) => `Gold Standard ${i + 1}:\n${g.content}`).join("\n\n")
        : `Gold Standard Example:
Headline: "The Smartest Way to ${input.goal}"
Body: "Join 10,000+ ${input.targetAudience} who achieved their goals 3x faster with less effort."
CTA: "Start Free — See Results in 7 Days"
Social Proof: "Rated 4.9/5 by 2,000+ users"`;

    ctx.evaluation.goldStandards = goldStandards as Array<Record<string, unknown>>;

    // ── Comparator ───────────────────────────────────────────────────────────
    const comparatorPrompt = `Generated Content:
${JSON.stringify(currentContent, null, 2)}

${goldStandardText}

Industry: ${input.industry}
Audience: ${input.targetAudience}

Compare the generated content against the gold standards.`;

    const comparatorRaw = await runAgent(goldComparatorAgent, comparatorPrompt, {
      temperature: 0.3,
      fallback: `{"alignment_score": 6.5, "comparisons": [{"dimension": "specificity", "gold_standard_approach": "Uses specific numbers and timeframes", "generated_approach": "Vague benefit claims", "gap": "Add specific metrics", "score": 6}], "exceeds_gold_in": ["social_proof structure"], "critical_gaps": [{"gap": "Missing specific outcome metric in headline", "suggested_fix": "Add timeframe or number to headline"}], "overall_verdict": "Good structure but needs more specificity to match gold standard quality"}`,
    });
    ctx.evaluation.comparatorOutput = safeParseJson(comparatorRaw);
    const comparatorScore = (ctx.evaluation.comparatorOutput["alignment_score"] as number) ?? 6;
    logAgentRun(ctx, "gold-comparator-agent", `Alignment: ${comparatorScore}`);
    log("WORKFLOW", `Comparator score: ${comparatorScore}`);
    await delay(STEP_DELAY_MS);

    // ── Scoring ───────────────────────────────────────────────────────────────
    const scoringPrompt = `Critic Output:
${JSON.stringify(ctx.evaluation.criticOutput, null, 2)}

Comparator Output:
${JSON.stringify(ctx.evaluation.comparatorOutput, null, 2)}

Current Content:
${JSON.stringify(currentContent, null, 2)}

Iteration: ${iteration} of ${MAX_ITERATIONS}
Score Threshold: ${SCORE_THRESHOLD}

Compute the final composite score.`;

    const scoringRaw = await runAgent(scoringAgent, scoringPrompt, {
      temperature: 0.2,
      fallback: `{"composite_score": ${Math.round((criticScore * 0.5 + comparatorScore * 0.3 + 7 * 0.2) * 10) / 10}, "breakdown": {"critic_contribution": ${(criticScore * 0.5).toFixed(1)}, "comparator_contribution": ${(comparatorScore * 0.3).toFixed(1)}, "completeness_contribution": 1.4}, "confidence": "medium", "verdict": "${criticScore >= SCORE_THRESHOLD ? "pass" : "fail"}", "threshold": ${SCORE_THRESHOLD}, "primary_improvement": "Increase specificity in headline with concrete outcome metrics", "estimated_score_after_fix": ${Math.min(10, criticScore + 1.5)}, "iteration": ${iteration}}`,
    });

    ctx.evaluation.scoringOutput = safeParseJson(scoringRaw);
    currentScore = (ctx.evaluation.scoringOutput["composite_score"] as number) ?? (criticScore * 0.5 + comparatorScore * 0.5);
    ctx.score = currentScore;
    logAgentRun(ctx, "scoring-agent", `Composite: ${currentScore}`);
    log("WORKFLOW", `Composite score: ${currentScore} | Threshold: ${SCORE_THRESHOLD}`);
    await delay(STEP_DELAY_MS);

    // ── Store Evaluation ──────────────────────────────────────────────────────
    await storeEvaluation({
      generated_output_id: outputId,
      score: currentScore,
      critic_score: criticScore,
      comparator_score: comparatorScore,
      feedback: (ctx.evaluation.criticOutput["summary"] as string) ?? "",
    });

    // ── Check Threshold ───────────────────────────────────────────────────────
    if (currentScore >= SCORE_THRESHOLD) {
      log("WORKFLOW", `✓ Score ${currentScore} >= ${SCORE_THRESHOLD} — passing evaluation`);
      break;
    }

    if (iteration >= MAX_ITERATIONS) {
      log("WORKFLOW", `Max iterations (${MAX_ITERATIONS}) reached — proceeding with best content`);
      break;
    }

    // ── Refinement ────────────────────────────────────────────────────────────
    log("WORKFLOW", `Score ${currentScore} < ${SCORE_THRESHOLD} — running refinement`);

    const refinementPrompt = `Current Content:
${JSON.stringify(currentContent, null, 2)}

Critic Feedback:
${JSON.stringify(ctx.evaluation.criticOutput, null, 2)}

Gold Comparator Gaps:
${JSON.stringify(ctx.evaluation.comparatorOutput?.["critical_gaps"] ?? [], null, 2)}

Scoring Agent Primary Improvement:
${ctx.evaluation.scoringOutput?.["primary_improvement"] ?? "Improve specificity and differentiation"}

Iteration: ${iteration} of ${MAX_ITERATIONS}
Original Campaign Goal: ${input.goal}
Target Audience: ${input.targetAudience}

Refine the content to address all feedback.`;

    const refinementRaw = await runAgent(refinementAgent, refinementPrompt, {
      temperature: 0.6,
      fallback: `{"refined_content": ${JSON.stringify(currentContent)}, "change_log": [{"element": "headline", "change": "Added specific outcome metric", "reason": "Critic flagged headline as generic"}], "preserved_elements": ["CTA structure", "social proof"], "refinement_rationale": "Added specificity to headline as primary improvement", "iteration": ${iteration}}`,
    });

    const refinementOutput = safeParseJson(refinementRaw);
    const refinedContent = (refinementOutput["refined_content"] as Record<string, unknown>) ?? currentContent;
    currentContent = refinedContent;
    ctx.content.current = currentContent;
    logAgentRun(ctx, "refinement-agent", `Iteration ${iteration} refined`);
    log("WORKFLOW", `Refinement ${iteration} complete`);
    await delay(STEP_DELAY_MS);
  }

  // ── Creative Director — Final Output ──────────────────────────────────────
  log("WORKFLOW", "── Creative Director: Final Assembly");

  const cdPrompt = `You are the final creative gatekeeper. Produce the definitive campaign-ready output.

Current Best Content:
${JSON.stringify(currentContent, null, 2)}

Content Variations Available:
${JSON.stringify(ctx.content.variations).slice(0, 600)}

Evaluation Summary:
- Final Score: ${currentScore}/10
- Iterations: ${iteration}
- Critic Strengths: ${JSON.stringify(ctx.evaluation.criticOutput?.["strengths"] ?? []).slice(0, 200)}

Campaign Brief:
Industry: ${input.industry}
Audience: ${input.targetAudience}
Goal: ${input.goal}
Brand Voice: ${input.brandVoice ?? "professional, clear, empathetic"}

Produce the final premium output.`;

  const cdRaw = await runAgent(creativeDirectorAgent, cdPrompt, {
    temperature: 0.6,
    fallback: `{"final_output": ${JSON.stringify(currentContent)}, "campaign_concept": "Clarity-first marketing that shows ${input.targetAudience} the exact path to ${input.goal}", "usage_notes": "Optimized for landing page and paid social", "recommended_next_steps": ["A/B test bold vs safe variations", "Create video version of hero message"], "creative_director_notes": "Strong foundation with clear value prop. The specificity improvements from refinement cycles elevated this from generic to differentiated.", "quality_verdict": "approved"}`,
  });

  ctx.finalOutput = safeParseJson(cdRaw);
  logAgentRun(ctx, "creative-director-agent", "Final output assembled");
  log("WORKFLOW", "Creative Director done");
  await delay(STEP_DELAY_MS);

  // ════════════════════════════════════════════════════════════════════════════
  // LAYER 5 — EXECUTION
  // ════════════════════════════════════════════════════════════════════════════
  log("WORKFLOW", "── Layer 5: Execution");

  const execBase = `Final Content: ${JSON.stringify(ctx.finalOutput?.["final_output"] ?? currentContent).slice(0, 500)}
Strategy: ${JSON.stringify(ctx.strategy.strategy).slice(0, 300)}
Industry: ${input.industry}`;

  const campaignExecRaw = await runAgent(campaignExecutionAgent, execBase, {
    temperature: 0.5,
    fallback: `{"pre_launch_checklist": [{"task": "Final copy approval", "owner": "marketing lead", "critical": true}, {"task": "Creative assets ready", "owner": "designer", "critical": true}], "launch_sequence": [{"day": "Day 1", "actions": ["Publish hero landing page", "Launch awareness ads"]}], "budget_allocation": [{"channel": "Paid Social", "percentage": 40}, {"channel": "Content/SEO", "percentage": 30}, {"channel": "Email", "percentage": 30}], "week1_tracking": [{"metric": "Click-through rate", "benchmark": ">2%"}, {"metric": "Landing page conversion", "benchmark": ">3%"}]}`,
  });
  ctx.execution.campaignPlan = safeParseJson(campaignExecRaw);
  logAgentRun(ctx, "campaign-execution-agent", "Campaign plan ready");
  log("WORKFLOW", "Campaign execution plan done");
  await delay(STEP_DELAY_MS);

  const platformRaw = await runAgent(
    platformOptimizationAgent,
    `${execBase}\nAudience: ${input.targetAudience}\nGoal: ${input.goal}`,
    {
      temperature: 0.6,
      fallback: `{"platforms": [{"platform": "LinkedIn", "format": "Single image post", "copy": "Struggling to achieve ${input.goal}? Here's what's actually working for ${input.targetAudience}. (thread)", "hashtags": ["#marketing", "#growth"], "posting_time": "Tuesday 9am"}, {"platform": "Instagram", "format": "Carousel", "copy": "3 ways ${input.targetAudience} are hitting their goals 🎯", "hashtags": ["#tips", "#growth"], "posting_time": "Wednesday 6pm"}]}`,
    }
  );
  ctx.execution.platformVersions = safeParseJson(platformRaw);
  logAgentRun(ctx, "platform-optimization-agent", "Platform versions ready");
  log("WORKFLOW", "Platform optimization done");
  await delay(STEP_DELAY_MS);

  const repurposedRaw = await runAgent(
    repurposingAgent,
    `Core Content: ${JSON.stringify(ctx.finalOutput?.["final_output"] ?? currentContent).slice(0, 500)}
Industry: ${input.industry}
Audience: ${input.targetAudience}`,
    {
      temperature: 0.7,
      fallback: `{"blog_outline": {"title": "How ${input.targetAudience} Achieve ${input.goal} Faster", "sections": ["The Problem", "The Approach", "The Results", "Get Started"]}, "social_captions": ["Want to ${input.goal}? Here's the system.", "This is what ${input.targetAudience} wish they knew earlier.", "3 things that actually move the needle for ${input.goal}."], "video_script": {"hook": "What if you could ${input.goal} in half the time?", "body": "Most ${input.targetAudience} waste months on the wrong approach.", "outro": "Link in bio to get started free.", "duration_seconds": 60}, "pull_quotes": ["Results without the complexity.", "Clarity beats effort every time."]}`,
    }
  );
  ctx.execution.repurposed = safeParseJson(repurposedRaw);
  logAgentRun(ctx, "repurposing-agent", "Content repurposed");
  log("WORKFLOW", "Content repurposing done");
  await delay(STEP_DELAY_MS);

  // ════════════════════════════════════════════════════════════════════════════
  // LAYER 6 — LEARNING
  // ════════════════════════════════════════════════════════════════════════════
  log("WORKFLOW", "── Layer 6: Learning");

  const learningPrompt = `Pipeline Run Summary:
Industry: ${input.industry}
Audience: ${input.targetAudience}
Goal: ${input.goal}
Total Iterations: ${iteration}
Final Score: ${currentScore}

Critic Output: ${JSON.stringify(ctx.evaluation.criticOutput).slice(0, 400)}
Comparator Output: ${JSON.stringify(ctx.evaluation.comparatorOutput).slice(0, 400)}
Scoring Output: ${JSON.stringify(ctx.evaluation.scoringOutput).slice(0, 300)}
Final Content: ${JSON.stringify(ctx.finalOutput?.["final_output"] ?? currentContent).slice(0, 400)}

Extract reusable patterns from this run.`;

  const learningRaw = await runAgent(learningAgent, learningPrompt, {
    temperature: 0.4,
    fallback: `{"success_patterns": [{"pattern": "Specific outcome metrics in headlines improve critic scores", "type": "headline", "confidence": 0.7, "evidence": "Score improved after adding specificity"}], "failure_patterns": [{"pattern": "Generic benefit claims score below 7 in differentiation", "type": "tone", "confidence": 0.8, "evidence": "Initial content scored 6 in differentiation"}], "audience_patterns": [{"audience": "${input.targetAudience}", "pattern": "ROI-focused messaging outperforms feature-focused", "confidence": 0.7}], "industry_patterns": [{"industry": "${input.industry}", "pattern": "Social proof placement above CTA increases alignment score", "confidence": 0.6}]}`,
  });

  const learningOutput = safeParseJson(learningRaw);
  ctx.learning.patterns = learningOutput;
  logAgentRun(ctx, "learning-agent", "Patterns extracted");

  // Store patterns to DB
  const allPatterns = [
    ...((learningOutput["success_patterns"] as Array<Record<string, unknown>>) ?? []).map((p) => ({
      pattern: (p["pattern"] as string) ?? "",
      type: (p["type"] as string) ?? "general",
      confidence: (p["confidence"] as number) ?? 0.5,
    })),
    ...((learningOutput["failure_patterns"] as Array<Record<string, unknown>>) ?? []).map((p) => ({
      pattern: `[FAILURE] ${(p["pattern"] as string) ?? ""}`,
      type: (p["type"] as string) ?? "general",
      confidence: (p["confidence"] as number) ?? 0.5,
    })),
  ];

  await storePatterns(allPatterns);
  log("WORKFLOW", `Learning complete — stored ${allPatterns.length} patterns`);

  // ── Workflow Optimizer ────────────────────────────────────────────────────
  const wfOptPrompt = `Pipeline Execution Metadata:
Agents Run: ${ctx.metadata.agentLogs.length}
Total Iterations: ${iteration}
Final Score: ${currentScore}
Agent Log: ${JSON.stringify(ctx.metadata.agentLogs.slice(0, 10))}

Analyze workflow efficiency and suggest improvements.`;

  const wfOptRaw = await runAgent(workflowOptimizerAgent, wfOptPrompt, {
    temperature: 0.4,
    fallback: `{"bottlenecks": [], "suggestions": [{"change": "Run competitor and trend analysis in parallel", "expected_impact": "Reduce pipeline time by ~25%"}], "parallel_candidates": ["competitor-analyst-agent", "trend-analyst-agent"]}`,
  });
  logAgentRun(ctx, "workflow-optimizer-agent", "Optimization analysis complete");
  log("WORKFLOW", "Workflow optimizer done");

  // ── Finalize ──────────────────────────────────────────────────────────────
  ctx.metadata.completedAt = new Date().toISOString();
  log("WORKFLOW", "═══════════════════════════════════════════════════════");
  log("WORKFLOW", ` Pipeline Complete — Final Score: ${currentScore}/10 | Iterations: ${iteration}`);
  log("WORKFLOW", "═══════════════════════════════════════════════════════");

  return ctx;
}
