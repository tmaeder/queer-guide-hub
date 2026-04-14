/**
 * Type-filtered trending strip — e.g. trending events on /events page.
 * Thin wrapper over TrendingStrip with type pre-bound.
 */

import { TrendingStrip } from "./TrendingStrip";

interface Props {
	type: "venue" | "event" | "city" | "personality" | "queer_village";
	city?: string;
	limit?: number;
	className?: string;
}

const TITLES: Record<Props["type"], string> = {
	venue: "Trending venues",
	event: "Trending events",
	city: "Trending cities",
	personality: "Trending personalities",
	queer_village: "Trending neighborhoods",
};

export function TrendingByType({ type, city, limit = 10, className }: Props) {
	return <TrendingStrip types={[type]} city={city} limit={limit} title={TITLES[type]} className={className} />;
}
