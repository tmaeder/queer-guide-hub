/**
 * Horizontal strip of trending entities (last 7d weighted popularity).
 * Use on Index, CityDetail, Map sidebar.
 */

import { useEffect, useState } from "react";
import { LocalizedLink } from "@/components/routing/LocalizedLink";
import { fetchTrending } from "@/lib/searchClient";
import { useTrackClick } from "@/hooks/useSearchActions";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonCrossfade } from "@/components/effects";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { TrendingUp } from "lucide-react";
import { getRandomFallbackImage } from "@/utils/fallbackImages";

interface Props {
	city?: string;
	types?: string[];
	limit?: number;
	title?: string;
	className?: string;
}

const TYPE_PATH: Record<string, string> = {
	venue: "/venues",
	event: "/events",
	city: "/city",
	country: "/country",
	personality: "/personalities",
	queer_village: "/villages",
	news: "/news",
	marketplace: "/marketplace",
	hotel: "/hotels",
};

function hitPath(type: string, slug: string): string | null {
	if (type === "tag") return `/resources/${slug}`;
	const base = TYPE_PATH[type];
	return base ? `${base}/${slug}` : null;
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
}: Props) {
	const [items, setItems] = useState<TrendItem[] | null>(null);
	const [error, setError] = useState(false);
	const trackClick = useTrackClick();

	useEffect(() => {
		let cancelled = false;
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
			<div className="flex items-end justify-between mb-4 gap-4">
				<div>
					<div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
						<TrendingUp className="h-3 w-3" />
						{title}
					</div>
					<h2 className="text-xl md:text-2xl font-bold tracking-tight leading-tight">
						{headline}
					</h2>
				</div>
			</div>
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
				<ScrollArea className="w-full whitespace-nowrap">
					<div className="flex gap-3 pb-3">
						{items
							?.map((it) => {
								const slug = it.slug || it.entity_id;
								const to = hitPath(it.entity_type, slug);
								if (!to) return null;
								if (!it.title) return null;
								return (
									<LocalizedLink
										key={`${it.entity_type}:${it.entity_id}`}
										to={to}
										className="group/trend shrink-0 w-60 no-underline"
										onClick={() =>
											trackClick(
												{ type: it.entity_type, id: it.entity_id },
												"trending",
												{ score: it.score, city },
											)
										}
									>
										<Card className="h-44 overflow-hidden transition-[transform,box-shadow] duration-300 ease-out group-hover/trend:-translate-y-0.5 group-hover/trend:shadow-md" hoverable>
											<div className="relative overflow-hidden h-24">
												<img src={it.image_url || getRandomFallbackImage()} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover/trend:scale-[1.05]" />
											</div>
											<CardContent className="p-3">
												<div className="text-sm font-semibold truncate">{it.title}</div>
												<div className="text-xs text-muted-foreground truncate mt-0.5">
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
