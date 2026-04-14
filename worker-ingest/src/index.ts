/**
 * queer-guide-search-ingest
 *
 * Receives Supabase DB webhooks (INSERT/UPDATE/DELETE) for indexed tables,
 * embeds content via Workers AI, upserts to both:
 *   - content_embeddings (Supabase pgvector)
 *   - Meilisearch index (for lexical + hybrid)
 *
 * Webhook auth: X-QG-Token header must match INGEST_TOKEN secret.
 *
 * Also exposes POST /backfill to re-embed + re-index all rows of a given type,
 * driven by a cursor in kv.
 */

import { Toucan } from "toucan-js";

export interface Env {
	AI: Ai;
	EMBED_CACHE: KVNamespace;
	INGEST_STATE: KVNamespace;
	MEILISEARCH_URL: string;
	MEILISEARCH_ADMIN_KEY: string;
	SUPABASE_URL: string;
	SUPABASE_SERVICE_KEY: string;
	INGEST_TOKEN: string;
	AI_GATEWAY_NAME?: string;
	EMBED_MODEL?: string;
	SENTRY_DSN?: string;
	SENTRY_ENV?: string;
	SENTRY_RELEASE?: string;
}

const DEFAULT_EMBED_MODEL = "@cf/baai/bge-m3"; // 1024-dim, multilingual

// table → {pg content_type, meili index}
const TABLE_MAP: Record<string, { contentType: string; index: string }> = {
	venues: { contentType: "venue", index: "venues" },
	events: { contentType: "event", index: "events" },
	cities: { contentType: "city", index: "cities" },
	countries: { contentType: "country", index: "countries" },
	news_articles: { contentType: "news", index: "news" },
	marketplace_listings: { contentType: "marketplace", index: "marketplace" },
	personalities: { contentType: "personality", index: "personalities" },
	unified_tags: { contentType: "tag", index: "tags" },
	queer_villages: { contentType: "queer_village", index: "queer_villages" },
};

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === "OPTIONS") return new Response(null, { status: 204 });

		// Auth.
		const tok = request.headers.get("X-QG-Token");
		if (tok !== env.INGEST_TOKEN) return jres({ error: "unauthorized" }, 401);

		try {
			if (url.pathname === "/webhook" && request.method === "POST") {
				return await handleWebhook(request, env);
			}
			if (url.pathname === "/backfill" && request.method === "POST") {
				return await handleBackfill(request, env, ctx);
			}
			if (url.pathname === "/reembed-one" && request.method === "POST") {
				const body = (await request.json()) as { table: string; id: string };
				const row = await fetchRow(env, body.table, body.id);
				if (!row) return jres({ error: "not found" }, 404);
				await indexRow(env, body.table, row);
				return jres({ ok: true });
			}
			return jres({ error: "not found" }, 404);
		} catch (e: any) {
			console.error("ingest error", e);
			try {
				if (env.SENTRY_DSN) {
					new Toucan({
						dsn: env.SENTRY_DSN,
						context: ctx,
						request,
						release: env.SENTRY_RELEASE,
						environment: env.SENTRY_ENV || "production",
					}).captureException(e);
				}
			} catch {
				/* best-effort */
			}
			return jres({ error: "internal", details: String(e?.message ?? e) }, 500);
		}
	},
	async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		// Every run: drain up to 200 rows whose row updated_at > embedding updated_at.
		// This catches anything the DB webhook missed (e.g. direct SQL updates).
		// 15 rows × 3 subreqs = 45 — under Workers Free 50 subrequest limit per invocation.
		ctx.waitUntil(drainStale(env, 15));
	},
	async queue(batch: MessageBatch, env: Env): Promise<void> {
		for (const m of batch.messages) {
			const { table, id, op } = m.body as any;
			try {
				if (op === "DELETE") {
					await deleteRow(env, table, id);
				} else {
					const row = await fetchRow(env, table, id);
					if (row) await indexRow(env, table, row);
				}
				m.ack();
			} catch (e) {
				console.error("queue msg failed", e);
				m.retry({ delaySeconds: 30 });
			}
		}
	},
};

async function drainStale(env: Env, limit: number): Promise<void> {
	const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/get_stale_embeddings`, {
		method: "POST",
		headers: {
			apikey: env.SUPABASE_SERVICE_KEY,
			authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ p_limit: limit }),
	});
	if (!res.ok) {
		console.error("drainStale rpc failed", res.status);
		return;
	}
	const stale = (await res.json()) as Array<{ table_name: string; id: string }>;
	console.log(`drain: ${stale.length} stale rows`);
	for (const s of stale) {
		try {
			const row = await fetchRow(env, s.table_name, s.id);
			if (row) await indexRow(env, s.table_name, row);
		} catch (e) {
			console.error("drain one failed", s, e);
		}
	}
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
	const payload = (await request.json()) as SupabaseWebhookPayload;
	const tm = TABLE_MAP[payload.table];
	if (!tm) return jres({ skipped: true });

	if (payload.type === "DELETE") {
		await deleteRow(env, payload.table, payload.old_record?.id);
		return jres({ ok: true });
	}
	const row = payload.record;
	if (!row?.id) return jres({ error: "no id" }, 400);
	await indexRow(env, payload.table, row);
	return jres({ ok: true });
}

async function handleBackfill(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	const { table, batchSize = 50, reset = false } = (await request.json()) as {
		table: string;
		batchSize?: number;
		reset?: boolean;
	};
	if (!TABLE_MAP[table]) return jres({ error: "bad table" }, 400);

	const cursorKey = `backfill:${table}:cursor`;
	if (reset) await env.INGEST_STATE.delete(cursorKey);
	const cursor = ((await env.INGEST_STATE.get(cursorKey)) ?? "") as string;

	const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
	url.searchParams.set("select", "*");
	url.searchParams.set("order", "id");
	url.searchParams.set("limit", String(batchSize));
	if (cursor) url.searchParams.set("id", `gt.${cursor}`);

	const rows = (await (
		await fetch(url.toString(), {
			headers: {
				apikey: env.SUPABASE_SERVICE_KEY,
				authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			},
		})
	).json()) as any[];

	// Advance cursor synchronously so caller can immediately page next.
	const lastIdSync = rows.length ? rows[rows.length - 1].id : cursor;
	if (lastIdSync) {
		try {
			await env.INGEST_STATE.put(cursorKey, lastIdSync);
		} catch (e) {
			console.warn("INGEST_STATE put skipped", (e as Error)?.message);
		}
	}

	// Run actual indexing in background.
	ctx.waitUntil(
		(async () => {
			for (const r of rows) {
				try {
					await indexRow(env, table, r);
				} catch (e) {
					console.error(`backfill ${table} ${r.id}`, e);
				}
			}
		})(),
	);

	return jres({ accepted: rows.length, cursor: lastIdSync, done: rows.length < batchSize });
}

async function indexRow(env: Env, table: string, row: any): Promise<void> {
	const tm = TABLE_MAP[table];
	if (!tm) return;

	// 1. Compose embed text (multilingual concat when available).
	const text = composeEmbedText(table, row);
	const vec = await embedText(env, text);

	// 2. Upsert pgvector embedding.
	await upsertEmbedding(env, tm.contentType, row.id, text, vec, extractMetadata(table, row));

	// 3. Upsert Meili doc.
	const doc = toMeiliDoc(table, row);
	await meiliUpsert(env, tm.index, [doc]);
}

async function deleteRow(env: Env, table: string, id?: string): Promise<void> {
	if (!id) return;
	const tm = TABLE_MAP[table];
	if (!tm) return;
	await Promise.all([
		fetch(
			`${env.SUPABASE_URL}/rest/v1/content_embeddings?content_type=eq.${tm.contentType}&content_id=eq.${id}`,
			{
				method: "DELETE",
				headers: {
					apikey: env.SUPABASE_SERVICE_KEY,
					authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
				},
			},
		),
		fetch(`${env.MEILISEARCH_URL}/indexes/${tm.index}/documents/${id}`, {
			method: "DELETE",
			headers: { Authorization: `Bearer ${env.MEILISEARCH_ADMIN_KEY}` },
		}),
	]);
}

async function fetchRow(env: Env, table: string, id: string): Promise<any | null> {
	const r = await fetch(
		`${env.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&limit=1`,
		{
			headers: {
				apikey: env.SUPABASE_SERVICE_KEY,
				authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			},
		},
	);
	const rows = (await r.json()) as any[];
	return rows?.[0] ?? null;
}

// ─── text composition ─────────────────────────
function composeEmbedText(table: string, r: any): string {
	const parts: string[] = [];
	const title = r.title || r.name || "";
	if (title) parts.push(title);
	const desc = r.description || r.bio || r.summary || "";
	if (desc) parts.push(desc);
	if (Array.isArray(r.tags)) parts.push("Tags: " + r.tags.join(", "));
	if (r.category) parts.push("Category: " + r.category);
	if (r.event_type) parts.push("Type: " + r.event_type);
	if (r.profession) parts.push("Profession: " + r.profession);
	if (r.city) parts.push("City: " + r.city);
	if (r.country) parts.push("Country: " + r.country);
	// news_articles multilingual: fields like title_de, content_de may exist.
	for (const lang of ["de", "es", "fr"]) {
		if (r[`title_${lang}`]) parts.push(r[`title_${lang}`]);
		if (r[`description_${lang}`]) parts.push(r[`description_${lang}`]);
	}
	return parts.filter(Boolean).join(". ").slice(0, 2000);
}

function extractMetadata(table: string, r: any): Record<string, unknown> {
	return {
		city: r.city,
		country: r.country,
		category: r.category || r.event_type || r.profession,
		featured: r.featured || r.is_featured || false,
		tags: r.tags || [],
		slug: r.slug,
	};
}

function toMeiliDoc(table: string, r: any): any {
	const base = {
		id: r.id,
		type: TABLE_MAP[table].contentType,
		title: r.title || r.name,
		description: r.description || r.bio,
		slug: r.slug,
		city: r.city,
		country: r.country,
		category: r.category || r.event_type || r.profession,
		tags: r.tags || [],
		image_url: r.image_url || r.logo_url,
		logo_url: r.logo_url,
		featured: r.featured || r.is_featured || false,
		is_featured: r.is_featured ?? r.featured,
		updated_at: r.updated_at,
	};
	if (r.latitude != null && r.longitude != null) {
		(base as any)._geo = { lat: Number(r.latitude), lng: Number(r.longitude) };
	}
	if (table === "events") {
		return {
			...base,
			event_type: r.event_type,
			start_date: r.start_date ? Math.floor(new Date(r.start_date).getTime() / 1000) : null,
			end_date: r.end_date ? Math.floor(new Date(r.end_date).getTime() / 1000) : null,
			venue_name: r.venue_name,
		};
	}
	if (table === "personalities") {
		return { ...base, profession: r.profession, nationality: r.nationality };
	}
	return base;
}

// ─── AI ───────────────────────────────────────
async function embedText(env: Env, text: string): Promise<number[]> {
	const model = env.EMBED_MODEL || DEFAULT_EMBED_MODEL;
	const key = `emb:${model}:${await sha256(text)}`;
	const cached = (await env.EMBED_CACHE.get(key, { type: "json" })) as number[] | null;
	if (Array.isArray(cached)) return cached;

	const gateway = env.AI_GATEWAY_NAME ? { id: env.AI_GATEWAY_NAME, cacheTtl: 86400 * 7 } : undefined;
	const res: any = await env.AI.run(model as any, { text: [text] } as any, gateway ? { gateway } : undefined);
	const vec: number[] = res?.data?.[0] ?? res?.data ?? res?.[0];
	if (!Array.isArray(vec)) throw new Error("embed: no vector");
	try {
		await env.EMBED_CACHE.put(key, JSON.stringify(vec), { expirationTtl: 86400 * 30 });
	} catch (e) {
		console.warn("EMBED_CACHE put skipped", (e as Error)?.message);
	}
	return vec;
}

// ─── Supabase upsert ──────────────────────────
async function upsertEmbedding(
	env: Env,
	contentType: string,
	contentId: string,
	contentText: string,
	embedding: number[],
	metadata: Record<string, unknown>,
): Promise<void> {
	const body = [
		{
			content_type: contentType,
			content_id: contentId,
			content_text: contentText,
			embedding: `[${embedding.join(",")}]`,
			metadata,
			updated_at: new Date().toISOString(),
		},
	];
	const res = await fetch(`${env.SUPABASE_URL}/rest/v1/content_embeddings?on_conflict=content_type,content_id`, {
		method: "POST",
		headers: {
			apikey: env.SUPABASE_SERVICE_KEY,
			authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			"Content-Type": "application/json",
			Prefer: "resolution=merge-duplicates,return=minimal",
			"Content-Profile": "public",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`pgvector upsert ${res.status}: ${await res.text()}`);
}

// ─── Meilisearch upsert ───────────────────────
async function meiliUpsert(env: Env, index: string, docs: any[]): Promise<void> {
	const res = await fetch(`${env.MEILISEARCH_URL}/indexes/${index}/documents?primaryKey=id`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.MEILISEARCH_ADMIN_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(docs),
	});
	if (!res.ok) {
		// Meili sync is also handled by Supabase edge function (meilisearch-sync) on DB triggers.
		// Don't fail ingest on Meili errors — just warn so embeddings backfill keeps going.
		console.warn(`meili upsert ${res.status}: ${await res.text()}`);
	}
}

// ─── utils ────────────────────────────────────
function jres(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function sha256(t: string): Promise<string> {
	const buf = new TextEncoder().encode(t);
	const hash = await crypto.subtle.digest("SHA-256", buf);
	return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type SupabaseWebhookPayload = {
	type: "INSERT" | "UPDATE" | "DELETE";
	table: string;
	schema: string;
	record?: any;
	old_record?: any;
};
