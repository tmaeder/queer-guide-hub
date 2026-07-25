/**
 * Naive sliding-window rate limit using a single KV counter per key-minute.
 * KV is eventually consistent so the cap may be slightly exceeded across
 * regions; that is acceptable for an anti-abuse speed bump on a public,
 * unauthenticated 70B endpoint — not a hard quota. Mirrors the helper in
 * workers/submit/src/rate-limit.ts (there keyed by user; here keyed by IP).
 */
export async function rateLimit(
	kv: KVNamespace,
	key: string,
	perMinute: number,
): Promise<{ ok: boolean; retryAfter: number; remaining: number }> {
	const minute = Math.floor(Date.now() / 60_000);
	const k = `rl:${key}:${minute}`;
	const current = parseInt((await kv.get(k)) || "0", 10);
	if (current >= perMinute) {
		return { ok: false, retryAfter: 60 - (Math.floor(Date.now() / 1000) % 60), remaining: 0 };
	}
	await kv.put(k, String(current + 1), { expirationTtl: 120 });
	return { ok: true, retryAfter: 0, remaining: perMinute - current - 1 };
}
