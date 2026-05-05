/**
 * Database access layer for the marketing AI system.
 * All DB operations go through this file. Graceful fallbacks when Supabase is not configured.
 */

import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient.ts";
import { generateEmbedding, cosineSimilarity, type Embedding } from "./embeddings.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoldStandard {
  id?: string;
  content: string;
  industry: string;
  content_type: string;
  embedding?: Embedding | null;
  metadata?: Record<string, unknown>;
}

export interface GeneratedOutput {
  id?: string;
  content: string;
  input: Record<string, unknown>;
  embedding?: Embedding | null;
  version?: number;
  created_at?: string;
}

export interface Evaluation {
  id?: string;
  generated_output_id: string;
  score: number;
  critic_score: number;
  comparator_score: number;
  feedback: string;
  created_at?: string;
}

export interface LearnedPattern {
  id?: string;
  pattern: string;
  type: string;
  confidence: number;
  created_at?: string;
}

// ─── In-Memory Fallback Store ─────────────────────────────────────────────────
// Used when Supabase is not configured — keeps the pipeline runnable.

const memStore = {
  goldStandards: [] as GoldStandard[],
  generatedOutputs: [] as (GeneratedOutput & { id: string })[],
  evaluations: [] as (Evaluation & { id: string })[],
  learnedPatterns: [] as (LearnedPattern & { id: string })[],
};

function memId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Track which IDs were stored in Supabase vs locally — prevents FK violations
const supabaseIds = new Set<string>();

// ─── Gold Standards ───────────────────────────────────────────────────────────

export async function retrieveSimilarGoldStandards(
  input: string,
  industry?: string,
  limit = 3
): Promise<GoldStandard[]> {
  if (!isSupabaseConfigured()) {
    log("DB", "Supabase not configured — using in-memory gold standards");
    const pool = industry
      ? memStore.goldStandards.filter((g) => g.industry.toLowerCase() === industry.toLowerCase())
      : memStore.goldStandards;
    return pool.slice(0, limit);
  }

  try {
    const supabase = getSupabaseClient();
    const queryEmbedding = await generateEmbedding(input);

    // Fetch candidates (filter by industry if provided)
    let query = supabase
      .from("gold_standards")
      .select("id, content, industry, content_type, embedding, metadata")
      .limit(50);

    if (industry) {
      query = query.eq("industry", industry);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) return [];

    // Rank by cosine similarity client-side (use pgvector RPC when available)
    const ranked = (data as GoldStandard[])
      .map((row) => ({
        row,
        score: row.embedding ? cosineSimilarity(queryEmbedding, row.embedding as Embedding) : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ row }) => row);

    log("DB", `Retrieved ${ranked.length} similar gold standards`);
    return ranked;
  } catch (err) {
    log("DB", `Error retrieving gold standards: ${(err as Error).message} — using fallback`);
    return memStore.goldStandards.slice(0, limit);
  }
}

export async function insertGoldStandard(gs: GoldStandard): Promise<void> {
  if (!isSupabaseConfigured()) {
    memStore.goldStandards.push(gs);
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const embedding = await generateEmbedding(gs.content);
    const { error } = await supabase
      .from("gold_standards")
      .insert({ ...gs, embedding });
    if (error) throw error;
    log("DB", "Inserted gold standard");
  } catch (err) {
    log("DB", `Failed to insert gold standard: ${(err as Error).message}`);
  }
}

// ─── Generated Outputs ────────────────────────────────────────────────────────

export async function storeGeneratedOutput(output: GeneratedOutput): Promise<string> {
  const embedding = await generateEmbedding(output.content);

  if (!isSupabaseConfigured()) {
    const id = memId();
    memStore.generatedOutputs.push({ ...output, embedding, id, version: output.version ?? 1 });
    log("DB", `Stored generated output in memory: ${id}`);
    return id;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("generated_outputs")
      .insert({ ...output, embedding })
      .select("id")
      .single();

    if (error) throw error;
    const id = (data as { id: string }).id;
    supabaseIds.add(id);
    log("DB", `Stored generated output in Supabase: ${id}`);
    return id;
  } catch (err) {
    log("DB", `Failed to store output in Supabase: ${(err as Error).message} — using memory`);
    const id = memId();
    memStore.generatedOutputs.push({ ...output, embedding, id, version: output.version ?? 1 });
    return id;
  }
}

// ─── Evaluations ──────────────────────────────────────────────────────────────

export async function storeEvaluation(evaluation: Evaluation): Promise<string> {
  const id = memId();

  // If the output ID was never written to Supabase, store evaluation in memory only
  // (Supabase would reject it: FK constraint on generated_output_id)
  if (!isSupabaseConfigured() || !supabaseIds.has(evaluation.generated_output_id)) {
    memStore.evaluations.push({ ...evaluation, id });
    log("DB", `Stored evaluation in memory: ${id}`);
    return id;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("evaluations")
      .insert(evaluation)
      .select("id")
      .single();

    if (error) throw error;
    const evalId = (data as { id: string }).id;
    log("DB", `Stored evaluation in Supabase: ${evalId}`);
    return evalId;
  } catch (err) {
    log("DB", `Failed to store evaluation: ${(err as Error).message} — using memory`);
    memStore.evaluations.push({ ...evaluation, id });
    return id;
  }
}

// ─── Learned Patterns ─────────────────────────────────────────────────────────

export async function storePattern(pattern: LearnedPattern): Promise<string> {
  if (!isSupabaseConfigured()) {
    const id = memId();
    memStore.learnedPatterns.push({ ...pattern, id });
    log("DB", `Stored pattern in memory: ${id}`);
    return id;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("learned_patterns")
      .insert(pattern)
      .select("id")
      .single();

    if (error) throw error;
    const id = (data as { id: string }).id;
    log("DB", `Stored pattern in Supabase: ${id}`);
    return id;
  } catch (err) {
    log("DB", `Failed to store pattern: ${(err as Error).message} — using memory`);
    const id = memId();
    memStore.learnedPatterns.push({ ...pattern, id });
    return id;
  }
}

export async function storePatterns(patterns: LearnedPattern[]): Promise<void> {
  await Promise.all(patterns.map((p) => storePattern(p)));
}

// ─── Inspect Memory Store (debug) ─────────────────────────────────────────────

export function getMemStore() {
  return memStore;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function log(tag: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${tag}] ${msg}`);
}
