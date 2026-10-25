import { readEmailGatewayReceipt } from "../_shared/email-gateway-receipt.ts";

export interface QueueReading {
  available: boolean;
  backlog_count: number | null;
  backlog_bytes: number | null;
  oldest_message_at: string | null;
}
export interface EmailQueueMetrics {
  observed_at: string;
  events: QueueReading;
  dead_letter: QueueReading;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const timestamp = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
function reading(v: unknown): QueueReading | null {
  if (!object(v) || typeof v.available !== "boolean") return null;
  if (!v.available) {
    if (
      v.backlog_count !== null || v.backlog_bytes !== null ||
      v.oldest_message_at !== null
    ) return null;
  } else if (
    !Number.isSafeInteger(v.backlog_count) || Number(v.backlog_count) < 0 ||
    !Number.isSafeInteger(v.backlog_bytes) || Number(v.backlog_bytes) < 0 ||
    (v.oldest_message_at !== null && !timestamp(v.oldest_message_at))
  ) return null;
  return {
    available: v.available,
    backlog_count: v.backlog_count as number | null,
    backlog_bytes: v.backlog_bytes as number | null,
    oldest_message_at: v.oldest_message_at as string | null,
  };
}

/** Admin health enrichment; an unavailable gateway must never become zero backlog. */
export async function readEmailQueueMetrics(options: {
  url?: string;
  secret?: string;
  request?: typeof fetch;
} = {}): Promise<EmailQueueMetrics | null> {
  const base = options.url ?? Deno.env.get("EMAIL_GATEWAY_URL");
  const secret = options.secret ?? Deno.env.get("EMAIL_GATEWAY_SECRET");
  try {
    if (!base || !secret) return null;
    const url = new URL("/queues/metrics", base);
    if (url.protocol !== "https:") return null;
    const response = await (options.request ?? fetch)(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const raw = await readEmailGatewayReceipt(response);
    const events = reading(raw.events), dead_letter = reading(raw.dead_letter);
    if (!timestamp(raw.observed_at) || !events || !dead_letter) return null;
    return { observed_at: raw.observed_at, events, dead_letter };
  } catch {
    return null;
  }
}
