import type { ZodTypeAny } from 'zod';

/** First Zod issue message per top-level field. Empty object = valid. */
export function zodFieldErrors(schema: ZodTypeAny, values: unknown): Record<string, string> {
  const result = schema.safeParse(values);
  const out: Record<string, string> = {};
  if (result.success) return out;
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !(key in out)) out[key] = issue.message;
  }
  return out;
}
