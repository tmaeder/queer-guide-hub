/**
 * Personalized rerank nudges on top of RRF-fused list.
 */

export interface RankableHit {
	id?: string;
	content_id?: string;
	content_type?: string;
	city?: string;
	tags?: string[];
	featured?: boolean;
	_fused?: number;
	_personalScore?: number;
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
): RankableHit[] {
	const interestSet = new Set((signal.interests || []).map(normalize));
	const tagSet = new Set((signal.recent_tags || []).map(normalize));
	const citySet = new Set(
		[signal.home_city, ...(signal.recent_cities || [])].filter(Boolean).map((x) => normalize(x as string)),
	);

	return fused
		.map((h) => {
			let boost = 0;
			const tags = (h.tags || []).map((t: string) => normalize(t));
			for (const t of tags) {
				if (interestSet.has(t)) boost += 0.05;
				if (tagSet.has(t)) boost += 0.03;
			}
			if (h.city && citySet.has(normalize(h.city))) boost += 0.1;
			if (h.featured) boost += 0.04;
			if (seenRecently.has(`${h.content_type}:${h.id || h.content_id}`)) boost -= 0.15;
			return { ...h, _personalScore: (h._fused || 0) + boost };
		})
		.sort((a, b) => (b._personalScore || 0) - (a._personalScore || 0));
}

function normalize(s: string): string {
	return String(s || "").trim().toLowerCase();
}
