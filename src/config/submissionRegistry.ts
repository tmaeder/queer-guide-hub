/**
 * Submission Registry
 * Per-type config for community submissions: which fields to show, organized into steps.
 * Fields reference names from contentTypeRegistry — looked up at render time.
 */

import { Building, Calendar, ShoppingBag, Tag, Users, Hotel, MessageSquarePlus, Newspaper, MapPin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

export interface SubmissionStep {
  id: string;
  label: string;
  fields: string[];
}

/** 'primary' = front-and-centre directory content; 'more' = niche, behind a disclosure. */
export type SubmissionGroup = 'primary' | 'more';

export interface SubmissionTypeConfig {
  id: string;
  contentType: string; // key in contentTypeRegistry
  targetTable: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  group: SubmissionGroup;
  steps: SubmissionStep[];
  defaults?: Record<string, unknown>;
  titleField: string;
}

// ── Venue (3 steps) ──────────────────────────────────────────────

const venueSubmission: SubmissionTypeConfig = {
  id: 'venue',
  contentType: 'venues',
  targetTable: 'venues',
  label: 'Venue',
  description: 'Know a queer-friendly space? Share it with the community.',
  icon: Building,
  color: '#DB2777',
  group: 'primary',
  titleField: 'name',
  defaults: { featured: false, verified: false },
  steps: [
    { id: 'basics', label: 'Basics', fields: ['name', 'description', 'category'] },
    { id: 'location', label: 'Location', fields: ['address', 'city', 'country', 'postal_code'] },
    { id: 'contact', label: 'Contact', fields: ['website', 'phone', 'email', 'instagram'] },
  ],
};

// ── Event (3 steps) ──────────────────────────────────────────────

const eventSubmission: SubmissionTypeConfig = {
  id: 'event',
  contentType: 'events',
  targetTable: 'events',
  label: 'Event',
  description: 'Got an upcoming LGBTQ+ event? Let the community know.',
  icon: Calendar,
  color: '#ec4899',
  group: 'primary',
  titleField: 'title',
  defaults: { featured: false, is_free: false, status: 'active' },
  steps: [
    { id: 'basics', label: 'Basics', fields: ['title', 'edition', 'description', 'event_type'] },
    {
      id: 'when-where',
      label: 'When & Where',
      fields: ['start_date', 'end_date', 'venue_name', 'address', 'city', 'country'],
    },
    {
      id: 'details',
      label: 'Details',
      fields: ['website', 'ticket_url', 'is_free', 'price_min', 'price_max'],
    },
  ],
};

// ── Product / Marketplace (2 steps) ──────────────────────────────

const productSubmission: SubmissionTypeConfig = {
  id: 'product',
  contentType: 'marketplace_listings',
  targetTable: 'marketplace_listings',
  label: 'Product',
  description: 'Sell or promote queer-owned products and services.',
  icon: ShoppingBag,
  color: '#f97316',
  group: 'primary',
  titleField: 'title',
  defaults: {
    status: 'active',
    featured: false,
    shipping_available: false,
    currency: 'USD',
    price_type: 'fixed',
  },
  steps: [
    {
      id: 'basics',
      label: 'Basics',
      fields: ['title', 'description', 'category', 'business_name'],
    },
    {
      id: 'details',
      label: 'Details',
      fields: ['price', 'price_type', 'currency', 'contact_email', 'website', 'shipping_available'],
    },
  ],
};

// ── Personality (2 steps) ────────────────────────────────────────

const personalitySubmission: SubmissionTypeConfig = {
  id: 'personality',
  contentType: 'personalities',
  targetTable: 'personalities',
  label: 'Personality',
  description: 'Nominate an LGBTQ+ personality to be featured.',
  icon: Users,
  color: '#f59e0b',
  group: 'more',
  titleField: 'name',
  defaults: { is_living: true, visibility: 'public', verification_status: 'pending' },
  steps: [
    { id: 'basics', label: 'Basics', fields: ['name', 'pronouns', 'profession', 'description'] },
    {
      id: 'details',
      label: 'Details',
      fields: ['birth_date', 'nationality', 'birth_place', 'website_url', 'lgbti_connection'],
    },
  ],
};

// ── Hotel / BnB (3 steps) — targets venues table w/ category=hotel

const hotelSubmission: SubmissionTypeConfig = {
  id: 'hotel',
  contentType: 'venues',
  targetTable: 'venues',
  label: 'Hotel / BnB',
  description: 'Add a queer-friendly hotel, hostel, or BnB.',
  icon: Hotel,
  color: '#0ea5e9',
  group: 'more',
  titleField: 'name',
  defaults: { featured: false, verified: false, category: 'hotel' },
  steps: [
    { id: 'basics', label: 'Basics', fields: ['name', 'description'] },
    { id: 'location', label: 'Location', fields: ['address', 'city', 'country'] },
    {
      id: 'details',
      label: 'Details',
      fields: ['website', 'phone', 'email', 'amenities', 'price_range'],
    },
  ],
};

// ── Tag (1 step — simple form) ───────────────────────────────────

const tagSubmission: SubmissionTypeConfig = {
  id: 'tag',
  contentType: 'unified_tags',
  targetTable: 'unified_tags',
  label: 'Tag',
  description: 'Suggest a new tag for the community database.',
  icon: Tag,
  color: '#14b8a6',
  group: 'more',
  titleField: 'name',
  defaults: {},
  steps: [
    {
      id: 'suggest',
      label: 'Suggest a Tag',
      fields: ['name', 'description', 'category', 'wikipedia_url'],
    },
  ],
};

// ── Feedback (1 step — lightweight form) ────────────────────────

const feedbackSubmission: SubmissionTypeConfig = {
  id: 'feedback',
  contentType: 'feedback',
  targetTable: 'community_submissions',
  label: 'Feedback',
  description: 'Report a bug, suggest a feature, or share an idea.',
  icon: MessageSquarePlus,
  color: '#DB2777',
  group: 'more',
  titleField: 'title',
  defaults: {},
  steps: [
    {
      id: 'feedback',
      label: 'Share Feedback',
      fields: ['title', 'description', 'category', 'contact_email'],
    },
  ],
};

// ── News article (1 step — title + lead, full body never copied) ─

const newsSubmission: SubmissionTypeConfig = {
  id: 'news',
  contentType: 'news_articles',
  targetTable: 'news_articles',
  label: 'News article',
  description: 'Share a news piece relevant to the community.',
  icon: Newspaper,
  color: '#0f766e',
  group: 'more',
  titleField: 'title',
  defaults: {},
  steps: [
    {
      id: 'basics',
      label: 'Basics',
      fields: ['title', 'summary', 'author', 'published_at', 'url', 'tags'],
    },
  ],
};

// ── Place (1 step — neighbourhood / city ) ───────────────────────

const placeSubmission: SubmissionTypeConfig = {
  id: 'place',
  contentType: 'places',
  targetTable: 'places',
  label: 'Place',
  description: 'Add a neighbourhood, queer village, or other locality.',
  icon: MapPin,
  color: '#7c3aed',
  group: 'more',
  titleField: 'name',
  defaults: {},
  steps: [
    {
      id: 'basics',
      label: 'Basics',
      fields: ['name', 'description', 'city', 'country', 'latitude', 'longitude', 'url'],
    },
  ],
};

// ── Registry ─────────────────────────────────────────────────────

export const submissionRegistry: Record<string, SubmissionTypeConfig> = {
  venue: venueSubmission,
  event: eventSubmission,
  product: productSubmission,
  personality: personalitySubmission,
  hotel: hotelSubmission,
  tag: tagSubmission,
  feedback: feedbackSubmission,
  news: newsSubmission,
  place: placeSubmission,
};

/**
 * Ordered array for hub page display. Hotel/BnB is intentionally omitted — it folds into
 * Venue via the venue `category` options (the `/submit/hotel` route still resolves via the
 * registry map for back-compat and deep links).
 */
export const submissionTypes: SubmissionTypeConfig[] = [
  eventSubmission,
  venueSubmission,
  productSubmission,
  personalitySubmission,
  placeSubmission,
  newsSubmission,
  tagSubmission,
  feedbackSubmission,
];

/** Front-and-centre cards on the hub. */
export const primarySubmissionTypes: SubmissionTypeConfig[] = submissionTypes.filter(
  (t) => t.group === 'primary',
);

/** Niche types tucked behind the "More ways to contribute" disclosure. */
export const moreSubmissionTypes: SubmissionTypeConfig[] = submissionTypes.filter(
  (t) => t.group === 'more',
);

/** Get a submission config by ID */
export function getSubmissionType(id: string): SubmissionTypeConfig | undefined {
  return submissionRegistry[id];
}
