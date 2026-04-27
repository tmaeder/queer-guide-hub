/**
 * Naive sliding-window rate limit using a single KV counter per user-minute.
 * Good enough for a 10/min cap. KV is eventually consistent so the limit may
 * be slightly exceeded across regions; that is acceptable for an anti-abuse
 * speed bump, not a hard quota.
 */
export async function rateLimit(
  kv: KVNamespace,
  userId: string,
  perMinute: number,
): Promise<{ ok: boolean; retryAfter: number; remaining: number }> {
  const minute = Math.floor(Date.now() / 60_000);
  const key = `rl:${userId}:${minute}`;
  const current = parseInt((await kv.get(key)) || "0", 10);
  if (current >= perMinute) {
    return { ok: false, retryAfter: 60 - (Math.floor(Date.now() / 1000) % 60), remaining: 0 };
  }
  await kv.put(key, String(current + 1), { expirationTtl: 120 });
  return { ok: true, retryAfter: 0, remaining: perMinute - current - 1 };
}
