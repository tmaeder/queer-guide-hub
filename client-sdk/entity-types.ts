/**
 * Single source of truth for the Schema.org → entity-type mapping that
 * both the Chrome extension's in-page extractor (`extension/src/shared/
 * extractors/jsonld.ts`) and the worker-submit /render fallback
 * (`workers/submit/src/render.ts`) consume. Keeping the mapping here
 * prevents the two from drifting.
 *
 * Adding a Schema.org type? Add it here. Both consumers pick it up.
 */

export type EntityType =
  | "venue"
  | "event"
  | "stay"
  | "marketplace_item"
  | "news_article"
  | "place"
  | "organization";

export const SCHEMA_TYPE_MAP: Record<string, EntityType> = {
  Event: "event",
  MusicEvent: "event",
  Festival: "event",
  TheaterEvent: "event",
  ComedyEvent: "event",
  SocialEvent: "event",
  Restaurant: "venue",
  BarOrPub: "venue",
  NightClub: "venue",
  CafeOrCoffeeShop: "venue",
  LocalBusiness: "venue",
  Hotel: "stay",
  LodgingBusiness: "stay",
  BedAndBreakfast: "stay",
  Hostel: "stay",
  Resort: "stay",
  Product: "marketplace_item",
  NewsArticle: "news_article",
  Article: "news_article",
  BlogPosting: "news_article",
  Organization: "organization",
  NGO: "organization",
  Place: "place",
  TouristAttraction: "place",
};
