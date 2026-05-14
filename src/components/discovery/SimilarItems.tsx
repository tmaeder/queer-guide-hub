/**
 * "More like this" — semantic neighbors of a given entity from pgvector ANN.
 * Drop into any detail page bottom.
 */

import { useEffect, useState } from "react";
import { LocalizedLink } from "@/components/routing/LocalizedLink";
import { fetchSimilar } from "@/lib/searchClient";
import { useTrackClick, type Entity } from "@/hooks/useSearchActions";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ScrollReveal } from "@/components/animation/ScrollReveal";
import { SkeletonCrossfade } from "@/components/effects";
import { getRandomFallbackImage } from "@/utils/fallbackImages";

interface Props {
	entity: Entity;
	limit?: number;
	title?: string;
	className?: string;
	/**
	 * Restrict results to specific content types. Default behavior keeps the
	 * cross-type semantic neighbors (matches legacy callers). Pass a single-
	 * element array (e.g. `['personality']`) on detail pages where mixing in
	 * scraped articles or other entity kinds would be misleading.
	 */
	contentTypes?: string[];
}

const TYPE_PATH: Record<string, string> = {
	venue: "/venues",
	event: "/events",
	city: "/city",
	country: "/country",
	personality: "/personalities",
	news: "/news",
	queer_village: "/villages",
	marketplace: "/marketplace",
	hotel: "/hotels",
};

function hitPath(type: string, slug: string): string | null {
	if (type === "tag") return `/resources/${slug}`;
	const base = TYPE_PATH[type];
	return base ? `${base}/${slug}` : null;
}

interface SimItem {
	content_type: string;
	content_id: string;
	score: number;
	metadata: { city?: string; country?: string; category?: string; slug?: string; image_url?: string; tags?: string[] };
}

export function SimilarItems({ entity, limit = 6, title = "More like this", className, contentTypes }: Props) {
	const [items, setItems] = useState<SimItem[] | null>(null);
	const [error, setError] = useState(false);
	const trackClick = useTrackClick();
	const contentTypesKey = contentTypes ? contentTypes.join(",") : "";

	useEffect(() => {
		let cancelled = false;
		setItems(null);
		setError(false);
		const types = contentTypesKey ? contentTypesKey.split(",") : undefined;
		// Over-fetch when restricting types so we still have `limit` rows after
		// the (defensive) client-side filter trims any off-type leakage.
		fetchSimilar(entity, types ? Math.min(50, limit * 3) : limit, types)
			.then((res) => {
				if (cancelled) return;
				let next = res as unknown as SimItem[];
				if (types) next = next.filter((r) => types.includes(r.content_type));
				setItems(next.slice(0, limit));
			})
			.catch(() => {
				if (cancelled) return;
				setError(true);
			});
		return () => {
			cancelled = true;
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [entity.type, entity.id, limit, contentTypesKey]);

	if (error) return null;
	if (items?.length === 0) return null;

	return (
		<ScrollReveal direction="up">
		<section className={className} aria-label={title}>
			<h2 className="text-lg font-semibold mb-3">{title}</h2>
			<ScrollArea className="w-full whitespace-nowrap">
				<SkeletonCrossfade
					loading={!items}
					skeleton={
						<div className="flex gap-3 pb-3">
							{Array.from({ length: limit }).map((_, i) => (
								<Skeleton key={i} className="h-40 w-56 shrink-0 rounded-lg" />
							))}
						</div>
					}
				>
				<div className="flex gap-3 pb-3">
					{items?.map((it) => {
									const slug = it.metadata?.slug || it.content_id;
									const to = hitPath(it.content_type, slug);
									if (!to) return null;
									return (
										<LocalizedLink
											key={`${it.content_type}:${it.content_id}`}
											to={to}
											className="shrink-0 w-56"
											onClick={() =>
												trackClick(
													{ type: it.content_type, id: it.content_id },
													"similar",
													{ score: it.score, source_entity: entity },
												)
											}
										>
											<Card className="h-40 overflow-hidden transition">
												<img
														src={it.metadata?.image_url || getRandomFallbackImage()}
														alt=""
														loading="lazy"
														className="h-24 w-full object-cover"
													/>
												<CardContent className="p-2">
													<div className="text-sm font-medium truncate">
														{it.metadata?.slug?.replace(/-/g, " ") || it.content_id.slice(0, 8)}
													</div>
													<div className="text-xs text-muted-foreground truncate">
														{[it.metadata?.city, it.metadata?.country].filter(Boolean).join(", ") ||
															it.metadata?.category}
													</div>
												</CardContent>
											</Card>
										</LocalizedLink>
									);
								})
								.filter(Boolean)}
				</div>
				</SkeletonCrossfade>
				<ScrollBar orientation="horizontal" />
			</ScrollArea>
		</section>
		</ScrollReveal>
	);
}
