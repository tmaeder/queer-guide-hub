/**
 * React hook wrapping QGSearchClient.
 *
 * Usage:
 *   const { results, loading, search, track } = useQGSearch({ endpoint: ..., userId });
 *   useEffect(() => search(q, { city: "berlin" }), [q]);
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QGSearchClient, type QGSearchClientOptions, type SearchResult, type SearchFilters, type TrackEvent } from "./qg-search";

export function useQGSearch(opts: QGSearchClientOptions) {
	const client = useMemo(() => new QGSearchClient(opts), [opts.endpoint, opts.userId, opts.lang]);
	const [results, setResults] = useState<SearchResult | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const lastIssuedAt = useRef(0);

	const search = useCallback(
		async (query: string, filters: SearchFilters = {}, hitsPerPage = 20) => {
			if (!query?.trim()) {
				setResults(null);
				return;
			}
			const issuedAt = Date.now();
			lastIssuedAt.current = issuedAt;
			setLoading(true);
			setError(null);
			try {
				const res = await client.search(query, filters, hitsPerPage);
				// Drop stale response.
				if (issuedAt !== lastIssuedAt.current) return;
				setResults(res);
			} catch (e) {
				if (issuedAt !== lastIssuedAt.current) return;
				setError(e as Error);
			} finally {
				if (issuedAt === lastIssuedAt.current) setLoading(false);
			}
		},
		[client],
	);

	const track = useCallback(
		(event: TrackEvent, entity: { type: string; id: string }, metadata?: Record<string, unknown>) => {
			client.track(event, entity, metadata);
		},
		[client],
	);

	useEffect(() => {
		const onUnload = () => client.flushTrack();
		window.addEventListener("beforeunload", onUnload);
		return () => window.removeEventListener("beforeunload", onUnload);
	}, [client]);

	return { client, results, loading, error, search, track };
}

/**
 * Debounced search + autocomplete combo.
 */
export function useQGAutocomplete(opts: QGSearchClientOptions, debounceMs = 150) {
	const client = useMemo(() => new QGSearchClient(opts), [opts.endpoint, opts.userId, opts.lang]);
	const [suggestions, setSuggestions] = useState<any[]>([]);
	const timer = useRef<any>(null);

	const query = useCallback(
		(q: string, types?: string[]) => {
			if (timer.current) clearTimeout(timer.current);
			if (!q?.trim()) {
				setSuggestions([]);
				return;
			}
			timer.current = setTimeout(async () => {
				const res = await fetch(`${opts.endpoint}/autocomplete`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query: q, types, limit: 6 }),
				}).then((r) => r.json());
				setSuggestions(res?.suggestions ?? []);
			}, debounceMs);
		},
		[opts.endpoint, debounceMs],
	);

	return { suggestions, query, client };
}
