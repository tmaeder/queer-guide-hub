/**
 * Personalized recommendations for the current user.
 * Calls /search with empty-ish query — worker returns popular + bias-vector-influenced.
 * Renders nothing if user has no bias signal yet (anonymous + no events).
 */

import { useEffect, useState } from "react";
import { LocalizedLink } from "@/components/routing/LocalizedLink";
import { useAuth } from "@/hooks/useAuth";
import { useTrackClick } from "@/hooks/useSearchActions";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonCrossfade } from "@/components/effects";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Sparkles } from "lucide-react";
import { Image } from "@/components/ui/Image";
import type { FallbackTheme } from "@/utils/fallbackImages";
import { decodeHtmlEntities } from "@/lib/decodeHtmlEntities";
import { isValidImageUrl } from "@/lib/images/resolveEntityImage";

const SEARCH_URL =
	import.meta.env.VITE_SEARCH_PROXY_URL || "https://search.queer.guide";

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

interface Hit {
	id: string;
	type: string;
	title?: string;
	city?: string;
	country?: string;
	slug?: string;
	image_url?: string;
	optimized_url?: string | null;
	thumbnail_url?: string | null;
}

export function RecommendedForYou({ className, limit = 10, hideHeader }: { className?: string; limit?: number; hideHeader?: boolean }) {
	const { user } = useAuth();
	const [items, setItems] = useState<Hit[] | null>(null);
	const [empty, setEmpty] = useState(false);
	const trackClick = useTrackClick();

	useEffect(() => {
		let cancelled = false;
		// eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
		setItems(null);
		setEmpty(false);
		const sid = typeof localStorage !== "undefined" ? localStorage.getItem("qg_sid") : null;
		fetch(`${SEARCH_URL}/search`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				query: "popular",
				hitsPerPage: limit,
				user_id: user?.id ?? null,
				session_id: sid,
				debug: true,
			}),
		})
			.then((r) => r.json())
			.then((d) => {
				if (cancelled) return;
				const dbg = d?.debug;
				if (!dbg?.biasApplied && !user?.id) {
					setEmpty(true);
					return;
				}
				setItems((d.hits || []).slice(0, limit));
			})
			.catch(() => {
				if (cancelled) return;
				setEmpty(true);
			});
		return () => {
			cancelled = true;
		};
	}, [user?.id, limit]);

	if (empty || items?.length === 0) return null;

	return (
		<section className={className} aria-label="Recommended for you">
			{!hideHeader && (
				<h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
					<Sparkles className="h-5 w-5 text-foreground" />
					Recommended for you
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
								const slug = it.slug || it.id;
								const to = hitPath(it.type, slug);
								if (!to) return null;
								if (!it.title) return null;
								return (
									<LocalizedLink
										key={`${it.type}:${it.id}`}
										to={to}
										className="shrink-0 w-56"
										onClick={() => trackClick({ type: it.type, id: it.id }, "recommended")}
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
												fallbackEntityType={fallbackTheme(it.type)}
												fallbackKey={it.id}
											/>
											<CardContent className="p-2">
												<div className="text-sm font-medium truncate">
													{decodeHtmlEntities(it.title!)}
												</div>
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
