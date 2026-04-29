/**
 * Workers AI wrapper for the /enrich endpoint. Uses the same hosted
 * llama-3.2-3b-instruct that search-proxy already uses for query rewriting,
 * so we share the AI Gateway cache. The AI binding handles auth, no extra
 * secret needed.
 */

import type { Env } from "./index";

// llama-3.2-3b-instruct is the model search-proxy already uses successfully
// (`workers/search-proxy/src/rewrite.ts`). Cheap, fast, predictable response
// shape `{ response: string }`. We're not doing anything clever so the small
// model is fine.
const SUMMARY_MODEL = "@cf/meta/llama-3.2-3b-instruct";

export interface EnrichOutput {
  summary: string;
  suggested_tags: string[];
}

const SYSTEM = `You write concise queer-relevant content summaries for queer.guide moderators.
Rules:
- One or two sentences, neutral tone, max 240 characters.
- Output the summary in English only. No preamble, no quotes, no markdown.
- If the input is too thin, output a short summary anyway. Never invent facts.`;

export async function enrich(env: Env, input: { url: string; title?: string; description?: string; }): Promise<EnrichOutput> {
  const userMsg = [
    input.title ? `Title: ${input.title}` : null,
    input.description ? `Description: ${input.description.slice(0, 1500)}` : null,
    `URL: ${input.url}`,
  ].filter(Boolean).join("\n");

  const gateway = env.AI_GATEWAY_NAME ? { id: env.AI_GATEWAY_NAME } : undefined;
  const res = (await env.AI.run(
    SUMMARY_MODEL as Parameters<Ai["run"]>[0],
    {
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg },
      ],
      max_tokens: 256,
      temperature: 0.3,
    } as Parameters<Ai["run"]>[1],
    gateway ? { gateway } : undefined,
  )) as { response?: unknown } | string | unknown;

  const summary = extractText(res).replace(/^["'\s]+|["'\s]+$/g, "").slice(0, 240);
  return { summary, suggested_tags: [] };
}

/**
 * Pull tags from the metadata of nearby entities in content_embeddings.
 * Best-effort: returns at most `count` tags ranked by frequency × similarity.
 * Empty if the RPC call fails or no neighbours found.
 */
export async function suggestTagsFromNeighbours(
  env: Env,
  embedding: number[],
  userJwt: string | undefined,
  count = 5,
): Promise<string[]> {
  try {
    const headers: Record<string, string> = {
      apikey: env.SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    };
    if (userJwt) headers["Authorization"] = `Bearer ${userJwt}`;
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/match_content_embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query_embedding: `[${embedding.join(",")}]`,
        similarity_threshold: 0.3,
        match_count: 25,
      }),
    });
    if (!res.ok) return [];
    const hits = (await res.json()) as Array<{ similarity: number; metadata: { tags?: unknown } | null }>;
    const score = new Map<string, number>();
    for (const h of hits) {
      const tags = (h.metadata?.tags as unknown[] | undefined) ?? [];
      if (!Array.isArray(tags)) continue;
      for (const t of tags) {
        if (typeof t !== "string") continue;
        const key = t.toLowerCase().trim();
        if (!key) continue;
        score.set(key, (score.get(key) ?? 0) + h.similarity);
      }
    }
    return [...score.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([k]) => k);
  } catch {
    return [];
  }
}

const EMBED_MODEL = "@cf/baai/bge-m3";

export async function embedText(env: Env, text: string): Promise<number[]> {
  const gateway = env.AI_GATEWAY_NAME ? { id: env.AI_GATEWAY_NAME, cacheTtl: 60 * 60 * 24 * 7 } : undefined;
  const res = (await env.AI.run(
    EMBED_MODEL as Parameters<Ai["run"]>[0],
    { text: [text] } as Parameters<Ai["run"]>[1],
    gateway ? { gateway } : undefined,
  )) as { data?: unknown[][] } | { data?: unknown[] };
  const data = (res as { data?: unknown[][] }).data;
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error("embed: no vector");
  return data[0] as number[];
}

function extractText(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    const r = raw as { response?: unknown };
    if (typeof r.response === "string") return r.response.trim();
    if (r.response && typeof r.response === "object") {
      const inner = (r.response as { response?: unknown; text?: unknown });
      if (typeof inner.response === "string") return inner.response.trim();
      if (typeof inner.text === "string") return inner.text.trim();
    }
  }
  return "";
}

