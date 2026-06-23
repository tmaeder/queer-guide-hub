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
import { Image } from "@/components/ui/Image";
import { type FallbackTheme } from "@/utils/fallbackImages";
import { isValidImageUrl } from "@/lib/images/resolveEntityImage";

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

function fallbackTheme(type: string): FallbackTheme {
	switch (type) {
		case "venue": return "venue";
		case "event": return "event";
		case "hotel": return "hotel";
		case "news": return "news";
		case "marketplace": return "marketplace";
		case "personality": case "person": return "person";
		default: return "place";
	}
}

function hitPath(type: string, slug: string): string | null {
	if (type === "tag") return `/resources/${slug}`;
	const base = TYPE_PATH[type];
	return base ? `${base}/${slug}` : null;
}

interface SimItem {
	content_type: string;
	content_id: string;
	score: number;
	metadata: { title?: string; city?: string; country?: string; category?: string; slug?: string; image_url?: string; optimized_url?: string | null; thumbnail_url?: string | null; tags?: string[] };
}

export function SimilarItems({ entity, limit = 6, title = "More like this", className, contentTypes }: Props) {
	const [items, setItems] = useState<SimItem[] | null>(null);
	const [error, setError] = useState(false);
	const trackClick = useTrackClick();
	const contentTypesKey = contentTypes ? contentTypes.join(",") : "";

	useEffect(() => {
		let cancelled = false;
		// eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
		setItems(null);
		setError(false);
		const types = contentTypesKey ? contentTypesKey.split(",") : undefined;
		// Over-fetch when restricting types so we still have `limit` rows after
		// the (defensive) client-side filter trims any off-type leakage.
		// Over-fetch (3×) so we still have `limit` rows after filtering the
		// source entity and any duplicate hits the ANN returned.
		fetchSimilar(entity, Math.min(50, limit * 3), types)
			.then((res) => {
				if (cancelled) return;
				let next = res as unknown as SimItem[];
				if (types) next = next.filter((r) => types.includes(r.content_type));
				// D2: never include the current entity in "More like this".
				next = next.filter(
					(r) => !(r.content_type === entity.type && r.content_id === entity.id),
				);
				// Drop duplicate (content_type, content_id) hits.
				const seen = new Set<string>();
				next = next.filter((r) => {
					const k = `${r.content_type}:${r.content_id}`;
					if (seen.has(k)) return false;
					seen.add(k);
					return true;
				});
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
			<h2 className="text-title font-semibold mb-4">{title}</h2>
			<ScrollArea className="w-full whitespace-nowrap">
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
				<div className="flex gap-4 pb-4">
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
												<Image
													imageUrl={isValidImageUrl(it.metadata?.image_url) ? (it.metadata!.image_url as string) : null}
													optimizedUrl={it.metadata?.optimized_url}
													thumbnailUrl={it.metadata?.thumbnail_url}
													preferThumb
													alt=""
													heightPx={96}
													imageRole="thumb"
													rounded="none"
													fallbackEntityType={fallbackTheme(it.content_type)}
													fallbackKey={it.content_id}
												/>
												<CardContent className="p-2">
													<div className="text-sm font-medium truncate">
														{it.metadata?.title || it.metadata?.slug?.replace(/-/g, " ")}
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
