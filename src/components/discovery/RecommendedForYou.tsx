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
import { getRandomFallbackImage } from "@/utils/fallbackImages";

const SEARCH_URL =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(import.meta as any).env?.VITE_SEARCH_PROXY_URL ||
	"https://search.queer.guide";

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

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: "\u00A0",
};

function decodeEntities(s: string): string {
	return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, ent: string) => {
		if (ent[0] === "#") {
			const code =
				ent[1] === "x" || ent[1] === "X"
					? parseInt(ent.slice(2), 16)
					: parseInt(ent.slice(1), 10);
			return Number.isFinite(code) ? String.fromCodePoint(code) : match;
		}
		return NAMED_ENTITIES[ent.toLowerCase()] ?? match;
	});
}

interface Hit {
	id: string;
	type: string;
	title?: string;
	city?: string;
	country?: string;
	slug?: string;
	image_url?: string;
}

export function RecommendedForYou({ className, limit = 10 }: { className?: string; limit?: number }) {
	const { user } = useAuth();
	const [items, setItems] = useState<Hit[] | null>(null);
	const [empty, setEmpty] = useState(false);
	const trackClick = useTrackClick();

	useEffect(() => {
		let cancelled = false;
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
			<div className="flex items-end justify-between mb-4 gap-4">
				<div>
					<div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
						<Sparkles className="h-3 w-3" />
						For you
					</div>
					<h2 className="text-xl md:text-2xl font-bold tracking-tight leading-tight">
						Recommended for you
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
								const slug = it.slug || it.id;
								const to = hitPath(it.type, slug);
								if (!to) return null;
								if (!it.title) return null;
								return (
									<LocalizedLink
										key={`${it.type}:${it.id}`}
										to={to}
										className="group/rec shrink-0 w-60 no-underline"
										onClick={() => trackClick({ type: it.type, id: it.id }, "recommended")}
									>
										<Card className="h-44 overflow-hidden transition-[transform,box-shadow] duration-300 ease-out group-hover/rec:-translate-y-0.5 group-hover/rec:shadow-md" hoverable>
											<div className="relative overflow-hidden h-24">
												<img src={it.image_url || getRandomFallbackImage()} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover/rec:scale-[1.05]" />
											</div>
											<CardContent className="p-3">
												<div className="text-sm font-semibold truncate">
													{decodeEntities(it.title!)}
												</div>
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
