import { createInterface } from "readline";
import { runFullSystem } from "./workflows/fullSystem.workflow.ts";
import type { CampaignInput } from "./utils/context.ts";

// ─── CLI Input ────────────────────────────────────────────────────────────────

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => resolve(answer.trim()));
  });
}

async function getInput(): Promise<CampaignInput> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const industry       = await ask(rl, "  Industry        : ");
  const targetAudience = await ask(rl, "  Target Audience : ");
  const goal           = await ask(rl, "  Goal            : ");
  const brandVoice     = await ask(rl, "  Brand Voice     : (e.g. professional, bold, empathetic — press Enter to skip) ");

  rl.close();
  return { industry, targetAudience, goal, brandVoice: brandVoice || undefined };
}

// ─── Output Printer ───────────────────────────────────────────────────────────

function hr(char = "═", len = 64) { return char.repeat(len); }

function printFinalOutput(ctx: Awaited<ReturnType<typeof runFullSystem>>): void {
  const line = hr();
  const thin = hr("─");

  console.log(`\n${line}`);
  console.log(`  20-AGENT MARKETING AI SYSTEM — RESULTS`);
  console.log(`${line}`);

  // ── Final Content ──────────────────────────────────────────────────────────
  const finalOut = ctx.finalOutput?.["final_output"] as Record<string, string> | undefined;
  if (finalOut) {
    console.log(`\n  FINAL CAMPAIGN CONTENT`);
    console.log(thin);
    if (finalOut.headline)    console.log(`  HEADLINE    : ${finalOut.headline}`);
    if (finalOut.subheadline) console.log(`  SUBHEADLINE : ${finalOut.subheadline}`);
    if (finalOut.body_copy)   console.log(`\n  BODY:\n  ${finalOut.body_copy}`);
    if (finalOut.cta)         console.log(`\n  CTA         : ${finalOut.cta}`);
    if (finalOut.social_proof) console.log(`  PROOF       : ${finalOut.social_proof}`);
    if (finalOut.urgency_line) console.log(`  URGENCY     : ${finalOut.urgency_line}`);
  }

  // ── Campaign Concept ───────────────────────────────────────────────────────
  const concept = ctx.finalOutput?.["campaign_concept"] as string | undefined;
  if (concept) {
    console.log(`\n${thin}\n  CAMPAIGN CONCEPT\n${thin}`);
    console.log(`  ${concept}`);
  }

  // ── Scores ─────────────────────────────────────────────────────────────────
  console.log(`\n${thin}\n  EVALUATION SCORES\n${thin}`);
  console.log(`  Final Score   : ${ctx.score}/10`);
  console.log(`  Iterations    : ${ctx.metadata.totalIterations}`);
  console.log(`  Verdict       : ${ctx.evaluation.scoringOutput?.["verdict"] ?? (ctx.score >= 8 ? "pass" : "borderline")}`);

  // ── Platform Versions ──────────────────────────────────────────────────────
  const platforms = ctx.execution.platformVersions?.["platforms"] as Array<Record<string, string>> | undefined;
  if (platforms?.length) {
    console.log(`\n${thin}\n  PLATFORM-OPTIMIZED VERSIONS\n${thin}`);
    platforms.slice(0, 3).forEach((p) => {
      console.log(`  [${p.platform?.toUpperCase() ?? "PLATFORM"}] ${p.copy?.slice(0, 100)}...`);
    });
  }

  // ── Learning Patterns ──────────────────────────────────────────────────────
  const successPatterns = ctx.learning.patterns?.["success_patterns"] as Array<Record<string, unknown>> | undefined;
  if (successPatterns?.length) {
    console.log(`\n${thin}\n  LEARNED PATTERNS (stored to DB)\n${thin}`);
    successPatterns.slice(0, 3).forEach((p, i) => {
      console.log(`  ${i + 1}. [${p.type}] ${p.pattern}`);
    });
  }

  // ── Creative Director Notes ────────────────────────────────────────────────
  const cdNotes = ctx.finalOutput?.["creative_director_notes"] as string | undefined;
  if (cdNotes) {
    console.log(`\n${thin}\n  CREATIVE DIRECTOR NOTES\n${thin}`);
    console.log(`  ${cdNotes}`);
  }

  // ── Next Steps ─────────────────────────────────────────────────────────────
  const nextSteps = ctx.finalOutput?.["recommended_next_steps"] as string[] | undefined;
  if (nextSteps?.length) {
    console.log(`\n${thin}\n  RECOMMENDED NEXT STEPS\n${thin}`);
    nextSteps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  }

  // ── Agent Log ─────────────────────────────────────────────────────────────
  console.log(`\n${thin}\n  AGENT EXECUTION LOG\n${thin}`);
  ctx.metadata.agentLogs.forEach((log) => {
    console.log(`  [${log.timestamp}] ${log.agent.padEnd(35)} ${log.note}`);
  });

  const elapsed = ctx.metadata.completedAt
    ? ((new Date(ctx.metadata.completedAt).getTime() - new Date(ctx.metadata.startedAt).getTime()) / 1000).toFixed(1)
    : "?";

  console.log(`\n${line}`);
  console.log(`  Pipeline complete in ${elapsed}s | Score: ${ctx.score}/10 | Iterations: ${ctx.metadata.totalIterations}`);
  console.log(line);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║      20-Agent AI Marketing System — OpenClaw / Ollama          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");
  console.log("  Enter campaign details:\n");

  const input = await getInput();

  console.log("\n  Layers: Intelligence → Strategy → Creation → Evaluation Loop → Execution → Learning\n");

  try {
    const ctx = await runFullSystem(input);
    printFinalOutput(ctx);
  } catch (err) {
    console.error("\n[FATAL] Pipeline failed:", err);
    process.exit(1);
  }
}

main();
