/**
 * Search index-name mappings.
 *
 * Historically these named Meilisearch indexes; after the Postgres cutover they
 * are just the canonical entity-type vocabulary. `INDEX_MAP` normalises the
 * singular/plural client tokens callers pass (`type: 'venue'` vs `'venues'`),
 * and `index.ts` maps these to Postgres entity types via INDEX_TO_PG_TYPE.
 * (All Meilisearch HTTP code is gone; renamed from meili.ts in the decommission.)
 */

export const INDEX_MAP: Record<string, string> = {
	venue: "venues",
	venues: "venues",
	event: "events",
	events: "events",
	user: "personalities",
	users: "personalities",
	news: "news",
	marketplace: "marketplace",
	location: "cities",
	locations: "cities",
	city: "cities",
	cities: "cities",
	country: "countries",
	countries: "countries",
	content: "tags",
	tag: "tags",
	tags: "tags",
	personality: "personalities",
	personalities: "personalities",
	queer_village: "queer_villages",
	queer_villages: "queer_villages",
	group: "groups",
	groups: "groups",
	organization: "organizations",
	organizations: "organizations",
	hotel: "hotels",
	hotels: "hotels",
	festival: "festivals",
	festivals: "festivals",
	milestone: "milestones",
	milestones: "milestones",
};

export const ALL_INDEXES = [
	"venues",
	"events",
	"cities",
	"countries",
	"news",
	"marketplace",
	"personalities",
	"tags",
	"queer_villages",
	"groups",
	"organizations",
	"hotels",
	"festivals",
	"milestones",
];
