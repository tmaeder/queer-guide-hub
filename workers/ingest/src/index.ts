/**
 * queer-guide-search-ingest
 *
 * Embeds content via Workers AI and upserts to content_embeddings (Supabase
 * pgvector), which feeds search_embeddings — the vector arm of search_hybrid.
 * (Meilisearch indexing was removed in the Meili → Postgres decommission.)
 *
 * THE CRON DRAIN IS THE ONLY WRITE PATH. This file and wrangler.toml used to
 * describe the scheduled drain as a "backstop" for a Supabase DB webhook that
 * was "the fast path". No such webhook exists — measured 2026-08-23, zero
 * triggers in the database reach net.http_request — and it is deliberately not
 * being restored: a per-row http_post trigger re-couples every writer to an
 * external POST, and the batch-capped backfills (300-1500 rows a pass) would
 * each enqueue thousands of pg_net requests whose responses are retained ~6h.
 * The 2026-08 pipeline overhaul already decoupled search_documents from entity
 * writes for that reason (search_reindex_queue); this path follows it.
 *
 * So the drain is sized as a primary path, not a trickle: get_stale_embeddings
 * is FIFO (migration 20260927123000), and one run costs ~24 subrequests for 100
 * rows because rows are fetched, embedded and upserted in BATCHES rather than
 * three subrequests each. That stays under the Workers Free 50/invocation cap,
 * so throughput does not depend on which plan the account is on. The three
 * batch sizes are NOT interchangeable — see UPSERT_BATCH, which is small
 * because a large one was measured to blow the statement timeout.
 *
 * /webhook is kept (auth: X-QG-Token must match INGEST_TOKEN) so a webhook can
 * be pointed back at it without a redeploy, but nothing calls it today.
 *
 * Also exposes POST /backfill to re-embed all rows of a type via a kv cursor,
 * and POST /drain to run the stale drain on demand with a caller-chosen limit
 * (for clearing a backlog without waiting on the cron).
 */

import { Toucan } from "toucan-js";

export interface Env {
	AI: Ai;
	EMBED_CACHE: KVNamespace;
	INGEST_STATE: KVNamespace;
	SUPABASE_URL: string;
	SUPABASE_SERVICE_KEY: string;
	INGEST_TOKEN: string;
	AI_GATEWAY_NAME?: string;
	EMBED_MODEL?: string;
	/** Rows per scheduled drain. See DEFAULT_DRAIN_LIMIT. */
	DRAIN_LIMIT?: string;
	SENTRY_DSN?: string;
	SENTRY_ENV?: string;
	SENTRY_RELEASE?: string;
}

const DEFAULT_EMBED_MODEL = "@cf/baai/bge-m3"; // 1024-dim, multilingual

/**
 * Rows per drain run. At 100 a run costs roughly 1 (work list) + <=11 (row
 * fetches, one request per table per 100 ids) + 2 (embed, 50 texts per AI call)
 * + 10 (upsert, 10 rows per POST) = ~24 subrequests, i.e. still under the
 * Workers Free cap of 50 per invocation. On the five-minute cron that is 28,800
 * rows/day, against 2,160/day before. Raise via the DRAIN_LIMIT var, but redo
 * the arithmetic first — the upsert leg is 1 subrequest per 10 rows, so this is
 * what binds, and going past ~150 needs Workers Paid.
 */
const DEFAULT_DRAIN_LIMIT = 100;
/** Hard ceiling for the operator-driven POST /drain, for the same reason. */
const MAX_DRAIN_LIMIT = 300;
/**
 * Upper bound on texts per Workers AI call. This is a CEILING, not the batch
 * size — `embedBatches()` also enforces a character budget, and that is usually
 * what binds.
 */
const EMBED_BATCH = 50;
/**
 * Character budget per Workers AI call, and it is the reason the drain died.
 *
 * bge-m3 accepts an array, so batching by COUNT alone looked free. It is not:
 * the model has a 60,000-token context for the whole call, and
 * `composeEmbedText` caps each row at 2,000 chars, so 50 rows can present
 * 100,000 characters at once. Measured on a live tail 2026-08-26:
 *
 *   AiError 3030: Max context reached 70391 tokens but model supports only 60000
 *     at embedTexts → indexRows → drainStale
 *
 * That threw on EVERY scheduled run from the batching deploy (2026-08-23 22:23)
 * onward — 56 hours, 32,559 rows queued, 0 embedded, while the cron itself kept
 * reporting `outcome: "ok"` because the throw was caught and counted as failed
 * rows. The keyword arm of search kept working, so nothing user-visible said so.
 *
 * 48,000 characters is the budget because the ratio is corpus-dependent and this
 * corpus is multilingual: the failing call was ~1.42 chars/token, but CJK text
 * approaches 1.0, so the budget is set to survive the pessimistic case — 48k
 * chars is ~34k tokens at the observed ratio and still only ~48k tokens if every
 * character were its own token. Both sit under 60k with room to spare.
 *
 * Do NOT raise this to "use the context better". The gain is a few subrequests;
 * the loss, when a batch tips over, is the entire vector index going stale in
 * silence.
 */
const MAX_EMBED_CHARS_PER_CALL = 48_000;

/**
 * Group indices into calls that respect BOTH the count ceiling and the character
 * budget. A single text can never exceed the budget on its own (2,000-char cap
 * in `composeEmbedText`), but the guard below keeps that from becoming a silent
 * infinite loop if that cap ever moves.
 */
function embedBatches(misses: number[], texts: string[]): number[][] {
	const batches: number[][] = [];
	let cur: number[] = [];
	let chars = 0;
	for (const i of misses) {
		const len = texts[i]?.length ?? 0;
		if (cur.length && (cur.length >= EMBED_BATCH || chars + len > MAX_EMBED_CHARS_PER_CALL)) {
			batches.push(cur);
			cur = [];
			chars = 0;
		}
		cur.push(i);
		chars += len;
	}
	if (cur.length) batches.push(cur);
	return batches;
}
const FETCH_BATCH = 100;
/**
 * Rows per content_embeddings upsert, and it is 10 rather than 50 because 50
 * was MEASURED to fail. Live tail, 2026-08-23, first run after the batching
 * landed:
 *
 *   (error) upsert batch failed … pgvector upsert 500: {"code":"57014", …}   ×3
 *   (log)   drain: {"claimed":200,"embedded":60,"missing":0,"failed":140}
 *
 * Exactly one of the four 50-row batches got through per tick. The row count is
 * not free on this table: an upsert fires the bridge trigger into
 * search_embeddings, whose HNSW index has to be maintained per row, inside ONE
 * statement racing the PostgREST statement timeout. The old code never met this
 * because it sent one row per POST.
 *
 * So the two batch sizes are independent knobs and must stay that way — the
 * embed leg wants them large (one AI call per 50 texts) and the write leg wants
 * them small (one statement per 10 rows). Collapsing them back into a single
 * constant re-introduces the 140-rows-per-run failure.
 */
const UPSERT_BATCH = 10;
/**
 * A batch that fails is retried row-by-row so one poison row cannot stall a
 * FIFO queue at its head forever — but only this many times per run, because
 * each retry is another subrequest against the cap above.
 */
const MAX_SINGLE_RETRIES = 10;

// Minimal row shape — Supabase REST returns arbitrary table columns; we only
// reach for a handful of fields. Use index-signature for unknown extras.
type TableRow = {
	id: string;
	title?: string;
	name?: string;
	description?: string;
	bio?: string;
	summary?: string;
	tags?: string[];
	category?: string;
	event_type?: string;
	profession?: string;
	city?: string;
	country?: string;
	slug?: string;
	image_url?: string;
	logo_url?: string;
	featured?: boolean;
	is_featured?: boolean;
	start_date?: string | number;
	end_date?: string | number;
	[key: string]: unknown;
};

// table → pg content_type
const TABLE_MAP: Record<string, { contentType: string }> = {
	venues: { contentType: "venue" },
	events: { contentType: "event" },
	cities: { contentType: "city" },
	countries: { contentType: "country" },
	news_articles: { contentType: "news" },
	marketplace_listings: { contentType: "marketplace" },
	personalities: { contentType: "personality" },
	unified_tags: { contentType: "tag" },
	queer_villages: { contentType: "queer_village" },
	milestones: { contentType: "milestone" },
	guides: { contentType: "guide" },
};

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === "OPTIONS") return new Response(null, { status: 204 });

		// Auth.
		const tok = request.headers.get("X-QG-Token");
		if (!(await timingSafeEqual(tok ?? "", env.INGEST_TOKEN))) return jres({ error: "unauthorized" }, 401);

		try {
			if (url.pathname === "/webhook" && request.method === "POST") {
				return await handleWebhook(request, env);
			}
			if (url.pathname === "/backfill" && request.method === "POST") {
				return await handleBackfill(request, env, ctx);
			}
			if (url.pathname === "/drain" && request.method === "POST") {
				// Operator-driven backlog clearing: same work list the cron uses,
				// caller-chosen depth. Synchronous so a driver script can loop on
				// the result instead of guessing how long a run takes.
				const body = (await request.json().catch(() => ({}))) as { limit?: number };
				const limit = Math.min(Number(body.limit) || DEFAULT_DRAIN_LIMIT, MAX_DRAIN_LIMIT);
				return jres(await drainStale(env, limit));
			}
			if (url.pathname === "/reembed-one" && request.method === "POST") {
				const body = (await request.json()) as { table: string; id: string };
				const row = await fetchRow(env, body.table, body.id);
				if (!row) return jres({ error: "not found" }, 404);
				await indexRow(env, body.table, row);
				return jres({ ok: true });
			}
			return jres({ error: "not found" }, 404);
		} catch (e) {
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
			return jres({ error: "internal" }, 500);
		}
	},
	async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		// The only path that ever writes an embedding — not a backstop. See the
		// file header and DEFAULT_DRAIN_LIMIT.
		const limit = Number(env.DRAIN_LIMIT) || DEFAULT_DRAIN_LIMIT;
		ctx.waitUntil(
			drainStale(env, limit)
				.then((r) => console.log(`drain: ${JSON.stringify(r)}`))
				.catch((e) => console.error("drain failed", e)),
		);
	},
	async queue(batch: MessageBatch, env: Env): Promise<void> {
		for (const m of batch.messages) {
			const { table, id, op } = m.body as { table: string; id: string; op?: string };
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

type DrainResult = { claimed: number; embedded: number; missing: number; failed: number };

/**
 * Work through get_stale_embeddings in batches.
 *
 * The old shape spent 3 subrequests PER ROW (fetch, embed, upsert), which is
 * what pinned the batch at 15 and the platform at 2,160 rows/day. All three
 * collapse into batch calls here: PostgREST takes `id=in.(...)`, bge-m3 takes an
 * array of texts, and content_embeddings takes an array upsert. Cost per run is
 * now roughly constant in the number of TABLES, not rows.
 */
async function drainStale(env: Env, limit: number): Promise<DrainResult> {
	const out: DrainResult = { claimed: 0, embedded: 0, missing: 0, failed: 0 };

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
		console.error("drainStale rpc failed", res.status, await res.text().catch(() => ""));
		return out;
	}
	const stale = (await res.json()) as Array<{ table_name: string; id: string }>;
	out.claimed = stale.length;
	if (!stale.length) return out;

	// 1. Fetch the rows, one request per (table, 100 ids).
	const byTable = new Map<string, string[]>();
	for (const s of stale) {
		if (!TABLE_MAP[s.table_name]) continue;
		const ids = byTable.get(s.table_name) ?? [];
		ids.push(s.id);
		byTable.set(s.table_name, ids);
	}
	const work: Array<{ table: string; row: TableRow }> = [];
	for (const [table, ids] of byTable) {
		for (const part of chunk(ids, FETCH_BATCH)) {
			let rows: TableRow[];
			try {
				rows = await fetchRows(env, table, part);
			} catch (e) {
				console.error("drain fetch failed", table, e);
				out.failed += part.length;
				continue;
			}
			// A row the work list named but the table no longer has was deleted
			// between the two calls. Not a failure, and not retried — the next
			// run's work list simply will not contain it.
			out.missing += part.length - rows.length;
			for (const row of rows) work.push({ table, row });
		}
	}
	const indexed = await indexRows(env, work);
	out.embedded += indexed.embedded;
	out.failed += indexed.failed;
	return out;
}

/** Embed and upsert a set of already-fetched rows, in batches. */
async function indexRows(
	env: Env,
	work: Array<{ table: string; row: TableRow }>,
): Promise<{ embedded: number; failed: number }> {
	const out = { embedded: 0, failed: 0 };
	if (!work.length) return out;
	const texts = work.map((w) => embedTextFor(w.table, w.row));

	let vectors: Array<number[] | null>;
	try {
		vectors = await embedTexts(env, texts);
	} catch (e) {
		console.error("embed batch failed", e);
		out.failed += work.length;
		return out;
	}

	const pending = work
		.map((w, i) => ({ w, text: texts[i], vec: vectors[i] }))
		.filter((p): p is { w: (typeof work)[number]; text: string; vec: number[] } =>
			Array.isArray(p.vec),
		);
	out.failed += work.length - pending.length;

	let singleRetries = 0;
	for (const part of chunk(pending, UPSERT_BATCH)) {
		try {
			await upsertEmbeddings(
				env,
				part.map((p) => embeddingRecord(p.w.table, p.w.row, p.text, p.vec)),
			);
			out.embedded += part.length;
		} catch (e) {
			// One bad row must not cost the whole batch: with FIFO ordering the
			// same rows come back at the head of the next run, so a batch that
			// always fails as a batch would stall the queue permanently. Retry
			// individually, but bounded — each retry is another subrequest.
			console.error("upsert batch failed, retrying singly", e);
			for (const p of part) {
				if (singleRetries >= MAX_SINGLE_RETRIES) {
					out.failed += 1;
					continue;
				}
				singleRetries += 1;
				try {
					await upsertEmbeddings(env, [embeddingRecord(p.w.table, p.w.row, p.text, p.vec)]);
					out.embedded += 1;
				} catch (e2) {
					console.error("upsert row failed", p.w.table, p.w.row.id, e2);
					out.failed += 1;
				}
			}
		}
	}
	return out;
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
	).json()) as Array<TableRow>;

	// Advance cursor synchronously so caller can immediately page next.
	const lastIdSync = rows.length ? rows[rows.length - 1].id : cursor;
	if (lastIdSync) {
		try {
			await env.INGEST_STATE.put(cursorKey, lastIdSync);
		} catch (e) {
			console.warn("INGEST_STATE put skipped", (e as Error)?.message);
		}
	}

	// Run actual indexing in background — batched, like the drain. Row-at-a-time
	// cost 2 subrequests each, so a batchSize of 50 spent ~101 and could not run
	// on Workers Free at all.
	ctx.waitUntil(
		indexRows(env, rows.map((row) => ({ table, row })))
			.then((r) => console.log(`backfill ${table}: ${JSON.stringify(r)}`))
			.catch((e) => console.error(`backfill ${table} failed`, e)),
	);

	return jres({ accepted: rows.length, cursor: lastIdSync, done: rows.length < batchSize });
}

async function indexRow(env: Env, table: string, row: TableRow): Promise<void> {
	if (!TABLE_MAP[table]) return;

	const text = embedTextFor(table, row);
	const [vec] = await embedTexts(env, [text]);
	if (!vec) throw new Error("embed: no vector");
	await upsertEmbeddings(env, [embeddingRecord(table, row, text, vec)]);
}

/**
 * Composed text, never empty. An empty string is not embeddable, and with a
 * FIFO work list a row that cannot be embedded is a row that sits at the head
 * of the queue forever, so a row with no title and no description falls back to
 * something stable rather than being skipped.
 */
function embedTextFor(table: string, row: TableRow): string {
	const text = composeEmbedText(table, row);
	return text.trim() || `${TABLE_MAP[table]?.contentType ?? table} ${row.slug ?? row.id}`;
}

function embeddingRecord(
	table: string,
	row: TableRow,
	text: string,
	embedding: number[],
): Record<string, unknown> {
	return {
		content_type: TABLE_MAP[table].contentType,
		content_id: row.id,
		content_text: text,
		embedding: `[${embedding.join(",")}]`,
		metadata: extractMetadata(table, row),
		updated_at: new Date().toISOString(),
	};
}

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

async function deleteRow(env: Env, table: string, id?: string): Promise<void> {
	if (!id) return;
	const tm = TABLE_MAP[table];
	if (!tm) return;
	await fetch(
		`${env.SUPABASE_URL}/rest/v1/content_embeddings?content_type=eq.${tm.contentType}&content_id=eq.${encodeURIComponent(id)}`,
		{
			method: "DELETE",
			headers: {
				apikey: env.SUPABASE_SERVICE_KEY,
				authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			},
		},
	);
}

async function fetchRow(env: Env, table: string, id: string): Promise<TableRow | null> {
	const r = await fetch(
		`${env.SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&limit=1`,
		{
			headers: {
				apikey: env.SUPABASE_SERVICE_KEY,
				authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			},
		},
	);
	const rows = (await r.json()) as TableRow[];
	return rows?.[0] ?? null;
}

/**
 * One request per <=FETCH_BATCH ids. PostgREST caps an `in.()` list well above
 * 100, but the URL is what breaks first, and 100 uuids is already ~3.7 KB.
 */
async function fetchRows(env: Env, table: string, ids: string[]): Promise<TableRow[]> {
	const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);
	url.searchParams.set("select", "*");
	url.searchParams.set("id", `in.(${ids.join(",")})`);
	url.searchParams.set("limit", String(ids.length));
	const r = await fetch(url.toString(), {
		headers: {
			apikey: env.SUPABASE_SERVICE_KEY,
			authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
		},
	});
	if (!r.ok) throw new Error(`fetchRows ${table} ${r.status}: ${await r.text()}`);
	return (await r.json()) as TableRow[];
}

// ─── text composition ─────────────────────────
function composeEmbedText(_table: string, r: TableRow): string {
	const parts: string[] = [];
	const title = r.title || r.name || "";
	if (title) parts.push(title);
	const desc = r.description || r.bio || r.summary || "";
	if (desc) parts.push(desc);
	// guides: dek is the one-liner, intro_md the substance.
	if (typeof r.dek === "string" && r.dek) parts.push(r.dek);
	if (typeof r.intro_md === "string" && r.intro_md) parts.push(r.intro_md);
	if (Array.isArray(r.tags)) parts.push("Tags: " + r.tags.join(", "));
	if (r.category) parts.push("Category: " + r.category);
	if (r.event_type) parts.push("Type: " + r.event_type);
	if (r.profession) parts.push("Profession: " + r.profession);
	const city = r.city || (typeof r.city_name === "string" ? r.city_name : "");
	if (city) parts.push("City: " + city);
	const country = r.country || (typeof r.country_name === "string" ? r.country_name : "");
	if (country) parts.push("Country: " + country);
	// news_articles multilingual: fields like title_de, content_de may exist.
	for (const lang of ["de", "es", "fr"]) {
		const t = r[`title_${lang}`];
		if (typeof t === "string" && t) parts.push(t);
		const d = r[`description_${lang}`];
		if (typeof d === "string" && d) parts.push(d);
	}
	return parts.filter(Boolean).join(". ").slice(0, 2000);
}

function extractMetadata(_table: string, r: TableRow): Record<string, unknown> {
	return {
		city: r.city,
		country: r.country,
		category: r.category || r.event_type || r.profession,
		featured: r.featured || r.is_featured || false,
		tags: r.tags || [],
		slug: r.slug,
	};
}

// ─── AI ───────────────────────────────────────
/**
 * Embed many texts with one Workers AI call per EMBED_BATCH.
 *
 * bge-m3 already took an array — the old single-text path sent `{text:[t]}` and
 * read `data[0]` — so batching costs nothing but bookkeeping and is what turns
 * the drain from 1 subrequest per row into 1 per 50. KV lookups are checked
 * first and are NOT subrequests, so a cache hit is free either way.
 *
 * Returns one entry per input, positionally; null where the model returned no
 * vector for that text. The caller counts those as failures rather than
 * upserting a hole.
 */
async function embedTexts(env: Env, texts: string[]): Promise<Array<number[] | null>> {
	const model = env.EMBED_MODEL || DEFAULT_EMBED_MODEL;
	const keys = await Promise.all(texts.map(async (t) => `emb:${model}:${await sha256(t)}`));
	const out: Array<number[] | null> = await Promise.all(
		keys.map(async (k) => {
			try {
				const v = (await env.EMBED_CACHE.get(k, { type: "json" })) as number[] | null;
				return Array.isArray(v) ? v : null;
			} catch {
				return null;
			}
		}),
	);

	const misses = out.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
	if (!misses.length) return out;

	const gateway = env.AI_GATEWAY_NAME ? { id: env.AI_GATEWAY_NAME, cacheTtl: 86400 * 7 } : undefined;
	for (const part of embedBatches(misses, texts)) {
		const res = (await env.AI.run(
			model as Parameters<typeof env.AI.run>[0],
			{ text: part.map((i) => texts[i]) } as Parameters<typeof env.AI.run>[1],
			gateway ? { gateway } : undefined,
		)) as unknown;
		const data =
			(res as { data?: unknown })?.data ?? (res as { [n: number]: unknown })?.[0];
		if (!Array.isArray(data)) throw new Error("embed: no vectors");
		part.forEach((i, j) => {
			const vec = data[j];
			out[i] = Array.isArray(vec) ? (vec as number[]) : null;
		});
	}

	// Best-effort cache fill. A KV failure must not fail the drain — the vector
	// is already in hand and about to be written to the database.
	await Promise.all(
		misses.map(async (i) => {
			const vec = out[i];
			if (!vec) return;
			try {
				await env.EMBED_CACHE.put(keys[i], JSON.stringify(vec), { expirationTtl: 86400 * 30 });
			} catch (e) {
				console.warn("EMBED_CACHE put skipped", (e as Error)?.message);
			}
		}),
	);
	return out;
}

// ─── Supabase upsert ──────────────────────────
async function upsertEmbeddings(env: Env, body: Array<Record<string, unknown>>): Promise<void> {
	if (!body.length) return;
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

// Constant-time credential compare. A plain `!==` short-circuits on the first
// mismatched byte, which is a timing side channel for a bearer secret; hashing
// both sides to a fixed-length digest first removes the length/position leak,
// and the byte-by-byte compare over that fixed digest runs in constant time
// regardless of where the two hashes diverge.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
	const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
	let diff = 0;
	for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
	return diff === 0;
}

type SupabaseWebhookPayload = {
	type: "INSERT" | "UPDATE" | "DELETE";
	table: string;
	schema: string;
	record?: TableRow;
	old_record?: TableRow;
};
