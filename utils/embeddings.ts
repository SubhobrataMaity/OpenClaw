/**
 * Embedding utilities.
 * Uses a deterministic mock by default. Swap generateEmbedding() for a real
 * provider (OpenAI, Cohere, Ollama nomic-embed-text) without changing callers.
 */

export type Embedding = number[];

/**
 * Deterministic mock embedding (128 dims).
 * Replace this function body with a real API call when you have an embedding provider.
 *
 * Real Ollama example:
 *   const res = await fetch("http://127.0.0.1:11434/api/embeddings", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ model: "nomic-embed-text", prompt: text }),
 *   });
 *   const data = await res.json();
 *   return data.embedding as Embedding;
 */
export async function generateEmbedding(text: string): Promise<Embedding> {
  const dims = 128;
  const embedding: number[] = new Array(dims).fill(0);

  for (let i = 0; i < text.length; i++) {
    embedding[i % dims] += text.charCodeAt(i) / 1000;
  }

  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
  return embedding.map((v) => v / magnitude);
}

export function cosineSimilarity(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}
