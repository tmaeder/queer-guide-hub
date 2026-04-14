/**
 * "More like this" — semantic neighbors of a given entity from pgvector ANN.
 * Drop into any detail page bottom.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { fetchSimilar } from "@/lib/searchClient";
import { useTrackClick, type Entity } from "@/hooks/useSearchActions";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface Props {
	entity: Entity;
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
	news: "/news",
	queer_village: "/villages",
	marketplace: "/marketplace",
};

interface SimItem {
	content_type: string;
	content_id: string;
	score: number;
	metadata: { city?: string; country?: string; category?: string; slug?: string; image_url?: string; tags?: string[] };
}

export function SimilarItems({ entity, limit = 6, title = "More like this", className }: Props) {
	const [items, setItems] = useState<SimItem[] | null>(null);
	const [error, setError] = useState(false);
	const trackClick = useTrackClick();

	useEffect(() => {
		let cancelled = false;
		setItems(null);
		setError(false);
		fetchSimilar(entity, limit)
			.then((res) => {
				if (cancelled) return;
				setItems(res as unknown as SimItem[]);
			})
			.catch(() => {
				if (cancelled) return;
				setError(true);
			});
		return () => {
			cancelled = true;
		};
	}, [entity.type, entity.id, limit]);

	if (error) return null;
	if (items?.length === 0) return null;

	return (
		<section className={className} aria-label={title}>
			<h2 className="text-lg font-semibold mb-3">{title}</h2>
			<ScrollArea className="w-full whitespace-nowrap">
				<div className="flex gap-3 pb-3">
					{!items
						? Array.from({ length: limit }).map((_, i) => (
								<Skeleton key={i} className="h-40 w-56 shrink-0 rounded-lg" />
							))
						: items.map((it) => {
								const path = TYPE_PATH[it.content_type] || "/";
								const slug = it.metadata?.slug || it.content_id;
								return (
									<Link
										key={`${it.content_type}:${it.content_id}`}
										to={`${path}/${slug}`}
										className="shrink-0 w-56"
										onClick={() =>
											trackClick(
												{ type: it.content_type, id: it.content_id },
												"similar",
												{ score: it.score, source_entity: entity },
											)
										}
									>
										<Card className="h-40 overflow-hidden hover:shadow-md transition">
											{it.metadata?.image_url ? (
												<img
													src={it.metadata.image_url}
													alt=""
													loading="lazy"
													className="h-24 w-full object-cover"
												/>
											) : (
												<div className="h-24 w-full bg-gradient-to-br from-pink-200 to-purple-200" />
											)}
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
									</Link>
								);
							})}
				</div>
				<ScrollBar orientation="horizontal" />
			</ScrollArea>
		</section>
	);
}
