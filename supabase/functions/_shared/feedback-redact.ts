// Strip personally-identifying / sensitive fields before a feedback payload
// is shipped to a Claude routine. Conservative — when in doubt, redact.

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const IPV4_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;

export function redactString(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(EMAIL_RE, '<email>').replace(IPV4_RE, '<ip>');
}

const SENSITIVE_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token',
]);

function redactHeaders(headers: Record<string, unknown> | undefined | null): Record<string, unknown> {
  if (!headers || typeof headers !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? '<redacted>' : v;
  }
  return out;
}

interface FeedbackData {
  title?: string;
  description?: string;
  contact_email?: string | null;
  context?: {
    url?: string;
    user_agent?: string;
    errors?: Array<{ message?: string; stack?: string; ts?: string }>;
    network_failures?: Array<{
      method?: string;
      url?: string;
      status?: number;
      ts?: string;
      headers?: Record<string, unknown>;
    }>;
  };
  replies?: Array<{ from_email?: string; body?: string }>;
  handoffs?: unknown;
  [k: string]: unknown;
}

/**
 * Returns a deep-cloned copy of the submission with PII stripped.
 * Mutates nothing.
 */
export function redactSubmissionForClaude<T extends { data?: FeedbackData; [k: string]: unknown }>(submission: T): T {
  const data = submission.data ?? {};
  const ctx = data.context ?? {};
  const cleaned: FeedbackData = {
    ...data,
    contact_email: null,
    title: redactString(data.title),
    description: redactString(data.description),
    context: {
      ...ctx,
      errors: (ctx.errors ?? []).map((e) => ({
        ...e,
        message: redactString(e.message),
        stack: redactString(e.stack),
      })),
      network_failures: (ctx.network_failures ?? []).map((n) => ({
        ...n,
        url: redactString(n.url),
        headers: redactHeaders(n.headers),
      })),
    },
    // Replies often contain user emails verbatim — drop them entirely.
    replies: undefined,
    // Old handoff blob isn't relevant to the prompt.
    handoffs: undefined,
  };
  return { ...submission, data: cleaned };
}

/**
 * Hash a prompt deterministically so dispatch_claude_routine can dedupe
 * identical re-dispatches. Browser-compatible (Deno + browser both have
 * crypto.subtle).
 */
export async function hashPrompt(prompt: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(prompt));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
