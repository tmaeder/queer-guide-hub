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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { TrendingUp } from "lucide-react";

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
				setItems(res as TrendItem[]);
			})
			.catch(() => {
				if (cancelled) return;
				setError(true);
			});
		return () => {
			cancelled = true;
		};
	}, [city, types.join(","), limit]);

	if (error || items?.length === 0) return null;

	const headline = city ? `${title} in ${city}` : title;

	return (
		<section className={className} aria-label={headline}>
			<h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
				<TrendingUp className="h-5 w-5 text-pink-500" />
				{headline}
			</h2>
			<ScrollArea className="w-full whitespace-nowrap">
				<div className="flex gap-3 pb-3">
					{!items
						? Array.from({ length: limit }).map((_, i) => (
								<Skeleton key={i} className="h-40 w-56 shrink-0 rounded-lg" />
							))
						: items
								.map((it) => {
									const slug = it.slug || it.entity_id;
									const to = hitPath(it.entity_type, slug);
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
											<Card className="h-40 overflow-hidden hover:shadow-md transition">
												{it.image_url ? (
													<img src={it.image_url} alt="" loading="lazy" className="h-24 w-full object-cover" />
												) : (
													<div className="h-24 w-full bg-gradient-to-br from-orange-200 to-pink-200" />
												)}
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
		</section>
	);
}
