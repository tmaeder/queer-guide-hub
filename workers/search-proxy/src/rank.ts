/**
 * Personalized rerank nudges on top of RRF-fused list.
 */

export interface RankableHit {
	id?: string;
	content_id?: string;
	content_type?: string;
	city?: string;
	tags?: string[];
	aliases?: string[];
	featured?: boolean;
	_fused?: number;
	_personalScore?: number;
	/** Which signal (if any) most influenced this hit's rank. Surfaced to the UI. */
	_boostReason?: 'interest' | 'recent_tag' | 'home_city' | 'recent_city' | 'featured' | null;
	[key: string]: unknown;
}

export function personalizedRank(
	fused: RankableHit[],
	signal: {
		interests?: string[];
		recent_tags?: string[];
		recent_cities?: string[];
		home_city?: string | null;
	},
	seenRecently: Set<string>,
	query?: string,
): RankableHit[] {
	const interestSet = new Set((signal.interests || []).map(normalize));
	const tagSet = new Set((signal.recent_tags || []).map(normalize));
	const q = query ? normalize(query) : "";

	const homeCity = signal.home_city ? normalize(signal.home_city) : null;
	const recentCitySet = new Set((signal.recent_cities || []).map((x) => normalize(x)));

	return fused
		.map((h) => {
			let boost = 0;
			const reasons: Array<{ kind: NonNullable<RankableHit['_boostReason']>; weight: number }> = [];
			const tags = (h.tags || []).map((t: string) => normalize(t));
			for (const t of tags) {
				if (interestSet.has(t)) { boost += 0.05; reasons.push({ kind: 'interest', weight: 0.05 }); }
				if (tagSet.has(t)) { boost += 0.03; reasons.push({ kind: 'recent_tag', weight: 0.03 }); }
			}
			if (h.city) {
				const c = normalize(h.city);
				if (homeCity && c === homeCity) { boost += 0.1; reasons.push({ kind: 'home_city', weight: 0.1 }); }
				else if (recentCitySet.has(c)) { boost += 0.1; reasons.push({ kind: 'recent_city', weight: 0.1 }); }
			}
			// Featured is already scored in search_hybrid (+0.02); adding it again here
			// let a featured bar outrank saunas for `sauna`. Badge only.
			if (h.featured) reasons.push({ kind: 'featured', weight: 0 });
			if (seenRecently.has(`${h.content_type}:${h.id || h.content_id}`)) boost -= 0.15;
			// Top-weighted reason wins — UI shows at most one badge per hit.
			const topReason = reasons
				.sort((a, b) => b.weight - a.weight)[0]?.kind ?? null;

			// Exact-title boost (bug #4 fallback). Also matches the city aliases
			// array so 'köln'/'münchen' rank Cologne/Munich first via their
			// English-name docs (which have the alias seeded by the
			// apply-meili-relevance-config edge function).
			if (q) {
				const candidates: string[] = [];
				if (typeof h.title === "string") candidates.push(normalize(h.title as string));
				if (Array.isArray(h.aliases)) {
					for (const a of h.aliases) candidates.push(normalize(String(a)));
				}
				// Exact match only. The old prefix/infix tiers (+0.5/+0.25) dwarfed the
				// SQL scores (~0.15): for `london`, any listing titled "...Central
				// London" outranked every real London venue.
				if (candidates.includes(q)) boost += 1.0;
			}
			return { ...h, _personalScore: (h._fused || 0) + boost, _boostReason: topReason };
		})
		.sort((a, b) => (b._personalScore || 0) - (a._personalScore || 0));
}

function normalize(s: string): string {
	return String(s || "").trim().toLowerCase();
}

const LOCATION_CONNECTORS = new Set(["in", "near", "around", "at"]);

function queryWords(value: unknown): string[] {
	return typeof value === "string"
		? value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
		: [];
}

/** Stable within each tier. Semantic and personal ranking can resolve ties,
 * but a location match alone should not beat an explicit topic in that place. */
export function prioritizeQueryMatches<T extends RankableHit>(hits: T[], query: string): T[] {
	const normalized = normalize(query);
	const terms = [...new Set(queryWords(query).filter((word) => !LOCATION_CONNECTORS.has(word)))];
	const tier = (hit: T) => {
		if ([hit.title, ...(hit.aliases ?? [])].some((value) =>
			typeof value === "string" && normalize(value) === normalized,
		)) return 2;
		if (terms.length < 2) return 0;

		const topicWords = new Set([
			...queryWords(hit.title),
			...queryWords(hit.category),
			...(hit.tags ?? []).flatMap(queryWords),
		]);
		const locationWords = new Set([...queryWords(hit.city), ...queryWords(hit.country)]);
		return terms.some((term) => topicWords.has(term) && !locationWords.has(term)) &&
			terms.every((term) => topicWords.has(term) || locationWords.has(term)) ? 1 : 0;
	};
	return hits.map((hit) => ({ hit, tier: tier(hit) }))
		.sort((a, b) => b.tier - a.tier)
		.map(({ hit }) => hit);
}
