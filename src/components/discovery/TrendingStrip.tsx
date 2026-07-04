/**
 * Horizontal strip of trending entities (last 7d weighted popularity).
 * Use on Index, CityDetail, Map sidebar.
 */

import { useEffect, useState } from "react";
import { LocalizedLink } from "@/components/routing/LocalizedLink";
import { detailHref } from "@/lib/searchRoutes";
import { fetchTrending } from "@/lib/searchClient";
import { useTrackClick } from "@/hooks/useSearchActions";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonCrossfade } from "@/components/effects";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { TrendingUp } from "lucide-react";
import { Image } from "@/components/ui/Image";
import { type FallbackTheme } from "@/utils/fallbackImages";
import { isValidImageUrl } from "@/lib/images/resolveEntityImage";

interface Props {
	city?: string;
	types?: string[];
	limit?: number;
	title?: string;
	className?: string;
	/** Suppress the built-in heading when wrapped by an outer section (e.g. HomeSection). */
	hideHeader?: boolean;
}

function fallbackTheme(type: string): FallbackTheme {
	switch (type) {
		case "venue": return "venue";
		case "event": return "event";
		case "hotel": return "hotel";
		case "news": return "news";
		case "marketplace": return "marketplace";
		case "personality": return "person";
		default: return "place";
	}
}

interface TrendItem {
	entity_type: string;
	entity_id: string;
	score: number;
	title?: string;
	city?: string;
	country?: string;
	slug?: string;
	image_url?: string;
	optimized_url?: string | null;
	thumbnail_url?: string | null;
	start_date?: string;
	end_date?: string;
}

// Defensive client-side filter: drop event hits whose end_date (or
// start_date when no end_date) is in the past. The trending worker is
// supposed to do this server-side, but until that ships we don't want
// stale events on the rail. Non-event hits pass through.
function isLiveOrFuture(it: TrendItem, now: number): boolean {
	if (it.entity_type !== "event") return true;
	const end = it.end_date ? Date.parse(it.end_date) : NaN;
	if (Number.isFinite(end)) return end >= now;
	const start = it.start_date ? Date.parse(it.start_date) : NaN;
	if (Number.isFinite(start)) return start >= now - 12 * 60 * 60 * 1000; // grace
	return true; // unknown date → assume live
}

export function TrendingStrip({
	city,
	types = ["venue", "event"],
	limit = 10,
	title = "Trending",
	className,
	hideHeader,
}: Props) {
	const [items, setItems] = useState<TrendItem[] | null>(null);
	const [error, setError] = useState(false);
	const trackClick = useTrackClick();

	useEffect(() => {
		let cancelled = false;
		// eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
		setItems(null);
		setError(false);
		fetchTrending(types, city, limit)
			.then((res) => {
				if (cancelled) return;
				const now = Date.now();
				const live = (res as TrendItem[]).filter((it) => isLiveOrFuture(it, now));
				setItems(live);
			})
			.catch(() => {
				if (cancelled) return;
				setError(true);
			});
		return () => {
			cancelled = true;
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [city, types.join(","), limit]);

	if (error || items?.length === 0) return null;

	const headline = city ? `${title} in ${city}` : title;

	return (
		<section className={className} aria-label={headline}>
			{!hideHeader && (
				<h2 className="text-title font-semibold mb-4 flex items-center gap-2">
					<TrendingUp className="h-5 w-5 text-foreground" />
					{headline}
				</h2>
			)}
			<SkeletonCrossfade
				loading={!items}
				skeleton={
					<div className="flex gap-4 pb-4">
						{Array.from({ length: limit }).map((_, i) => (
							<Skeleton key={i} className="h-40 w-56 shrink-0 rounded-element" />
						))}
					</div>
				}
			>
				<ScrollArea className="w-full whitespace-nowrap">
					<div className="flex gap-4 pb-4">
						{items
							?.map((it) => {
								// Strict: canonical-slug items only — no /type/<uuid> links.
								const to = detailHref({ type: it.entity_type, slug: it.slug, id: it.entity_id, title: it.title });
								if (!to) return null;
								if (!it.title) return null;
								return (
									<LocalizedLink
										key={`${it.entity_type}:${it.entity_id}`}
										to={to}
										className="shrink-0 w-56"
										onClick={() =>
											trackClick(
												{ type: it.entity_type, id: it.entity_id },
												"trending",
												{ score: it.score, city },
											)
										}
									>
										<Card className="h-40 overflow-hidden transition">
											<Image
												imageUrl={isValidImageUrl(it.image_url) ? it.image_url : null}
												optimizedUrl={it.optimized_url}
												thumbnailUrl={it.thumbnail_url}
												preferThumb
												alt=""
												heightPx={96}
												imageRole="thumb"
												rounded="none"
												fallbackEntityType={fallbackTheme(it.entity_type)}
												fallbackKey={it.entity_id}
											/>
											<CardContent className="p-2">
												<div className="text-sm font-medium truncate">{it.title}</div>
												<div className="text-xs text-muted-foreground truncate">
													{[it.city, it.country].filter(Boolean).join(", ")}
												</div>
											</CardContent>
										</Card>
									</LocalizedLink>
								);
							})
							.filter(Boolean)}
					</div>
					<ScrollBar orientation="horizontal" />
				</ScrollArea>
			</SkeletonCrossfade>
		</section>
	);
}
