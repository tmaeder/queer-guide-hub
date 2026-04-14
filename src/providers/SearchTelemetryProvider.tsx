/**
 * Auto-fires `view` events on route change for indexed entity types.
 * Mounted once at app root; zero per-page changes needed.
 *
 * - Resolves slug → id via Supabase (in-memory cache, 5min TTL)
 * - Debounces 1s — fast nav doesn't flood the bias vector
 * - Per-session dedup — same entity within 5min counted once
 */

import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { trackSearchEvent } from "@/lib/searchClient";
import { useAuth } from "@/hooks/useAuth";

interface RouteSpec {
	pattern: RegExp;
	type: string;
	table: string;
	slugCol?: string; // defaults to "slug"
}

const ROUTES: RouteSpec[] = [
	{ pattern: /^\/venues\/([^/]+)/, type: "venue", table: "venues" },
	{ pattern: /^\/events\/([^/]+)/, type: "event", table: "events" },
	{ pattern: /^\/marketplace\/([^/]+)/, type: "marketplace", table: "marketplace_listings" },
	{ pattern: /^\/villages\/([^/]+)/, type: "queer_village", table: "queer_villages" },
	{ pattern: /^\/city\/([^/]+)/, type: "city", table: "cities" },
	{ pattern: /^\/country\/([^/]+)/, type: "country", table: "countries" },
	{ pattern: /^\/personalities\/([^/]+)/, type: "personality", table: "personalities" },
	{ pattern: /^\/news\/([^/]+)/, type: "news", table: "news_articles" },
];

const slugCache = new Map<string, { id: string; ts: number }>();
const seenInSession = new Map<string, number>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const DEBOUNCE_MS = 1000;

async function resolveSlug(table: string, slug: string): Promise<string | null> {
	const key = `${table}:${slug}`;
	const cached = slugCache.get(key);
	if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.id;

	const { data, error } = await supabase
		.from(table as any)
		.select("id")
		.eq("slug", slug)
		.maybeSingle();
	if (error || !data?.id) return null;
	slugCache.set(key, { id: data.id, ts: Date.now() });
	return data.id;
}

/** Hook variant — drop into any component with router context (e.g. AppRoutes). */
export function useSearchTelemetry() {
	const location = useLocation();
	const { user } = useAuth();
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			void fireView(location.pathname, user?.id ?? null);
		}, DEBOUNCE_MS);
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, [location.pathname, user?.id]);
}

/** Provider variant — for places that prefer wrapping children. */
export function SearchTelemetryProvider({ children }: { children: React.ReactNode }) {
	useSearchTelemetry();
	return <>{children}</>;
}

async function fireView(pathname: string, userId: string | null): Promise<void> {
	for (const r of ROUTES) {
		const m = pathname.match(r.pattern);
		if (!m) continue;
		const slug = decodeURIComponent(m[1]);
		const id = await resolveSlug(r.table, slug);
		if (!id) return;
		const key = `${r.type}:${id}`;
		const last = seenInSession.get(key) ?? 0;
		if (Date.now() - last < DEDUP_WINDOW_MS) return;
		seenInSession.set(key, Date.now());
		void trackSearchEvent("view", { type: r.type, id }, { slug, path: pathname }, userId);
		return;
	}
}
