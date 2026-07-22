// Queer-history milestone content type (table: milestones, route: /history).

export type MilestoneCategory =
  | 'uprising-movement'
  | 'law-equality'
  | 'law-decriminalization'
  | 'law-criminalization'
  | 'depathologization'
  | 'persecution-destruction'
  | 'other';

export type MilestoneImpact = 'positive' | 'neutral' | 'negative';

export type MilestoneDatePrecision = 'day' | 'month' | 'year';

export interface MilestoneSource {
  label: string;
  url?: string;
}

export interface MilestoneLink {
  entity_type: 'personality' | 'event' | 'venue' | 'news' | 'organization';
  entity_id: string;
  role: string | null;
  sort_order: number;
  name: string;
  slug: string | null;
  image_url: string | null;
}

export interface MilestoneRef {
  id: string;
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  date_precision: MilestoneDatePrecision;
  category: MilestoneCategory | null;
  impact: MilestoneImpact;
  significance: number;
  country_name?: string | null;
  role?: string | null;
}

export interface Milestone {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  date: string;
  date_precision: MilestoneDatePrecision;
  date_end: string | null;
  date_end_precision: MilestoneDatePrecision | null;
  location: string | null;
  region: string | null;
  city_name: string | null;
  country_name: string | null;
  city_id: string | null;
  country_id: string | null;
  category: MilestoneCategory | null;
  impact: MilestoneImpact;
  significance: number;
  sources: MilestoneSource[];
  image_url: string | null;
  /** Attribution for the display photo (Wikimedia Commons backfill). */
  image_metadata?: {
    photographer?: string | null;
    photographer_url?: string | null;
    license?: string | null;
    source?: string | null;
    alt?: string | null;
  } | null;
  tags: string[];
  status: string;
  seo_indexable: boolean;
  is_featured: boolean;
  safety_gated: boolean;
  country?: { id: string; name: string; code: string; slug: string | null } | null;
  city?: { id: string; name: string; slug: string | null } | null;
  links?: MilestoneLink[];
  /** Nearest major (significance>=4) timeline neighbours — detail-page navigation. */
  prev?: MilestoneRef | null;
  next?: MilestoneRef | null;
}

export interface MilestoneOnThisDay {
  id: string;
  slug: string;
  title: string;
  date: string;
  category: MilestoneCategory | null;
  impact: MilestoneImpact;
  significance: number;
  country_name: string | null;
  city_name: string | null;
  years_ago: number;
  is_featured: boolean;
}

export interface MilestoneAnniversary {
  id: string;
  title: string;
  slug: string;
  category: MilestoneCategory | null;
  impact: MilestoneImpact;
  significance: number;
  occurs_on: string;
  years_ago: number;
  featured: boolean;
}

export const MILESTONE_CATEGORIES: MilestoneCategory[] = [
  'uprising-movement',
  'law-equality',
  'law-decriminalization',
  'law-criminalization',
  'depathologization',
  'persecution-destruction',
  'other',
];

export function milestoneCategoryLabelKey(category: MilestoneCategory): string {
  return `milestones.category.${category}`;
}
