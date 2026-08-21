import type { ContentTypeConfig, FieldConfig, FieldGroup } from '@/types/cms';
import { venueContentType } from './venue';
import { eventContentType } from './event';
import { personalityContentType } from './personality';
import { newsArticleContentType } from './news';
import { cityContentType } from './city';
import { countryContentType } from './country';
import { unifiedTagsContentType } from './tag';
import { marketplaceContentType } from './marketplace';
import { marketplaceBrandContentType } from './brand';
import { communityGroupsContentType } from './group';
import { cmsPagesContentType } from './page';
import { hotelContentType } from './hotel';
import { queerVillageContentType } from './village';
import { feedbackContentType } from './feedback';
import { milestoneContentType } from './milestone';
import { organizationContentType } from './organization';
import { guideContentType } from './guide';
import { redirectContentType } from './redirect';
import { vocabularyContentType } from './vocabulary';
import {
  Accessibility,
  Briefcase,
  CalendarCog,
  ConciergeBell,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const asOptions = (values: string[]) => values.map((v) => ({ value: v, label: titleCase(v) }));

/** Ported verbatim from the pages these replaced. */
const SERVICE_CATEGORIES = asOptions([
  'general',
  'beauty',
  'business',
  'dining',
  'entertainment',
  'events',
  'fitness',
  'professional',
  'retail',
  'wellness',
]);
const ACCESSIBILITY_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'visual', label: 'Visual' },
  { value: 'hearing', label: 'Hearing' },
  { value: 'sensory', label: 'Sensory' },
];

export const contentTypeRegistry: Record<string, ContentTypeConfig> = {
  venues: venueContentType,
  events: eventContentType,
  personalities: personalityContentType,
  news_articles: newsArticleContentType,
  cities: cityContentType,
  countries: countryContentType,
  unified_tags: unifiedTagsContentType,
  marketplace_listings: marketplaceContentType,
  marketplace_brands: marketplaceBrandContentType,
  community_groups: communityGroupsContentType,
  cms_pages: cmsPagesContentType,
  hotels: hotelContentType,
  queer_villages: queerVillageContentType,
  feedback: feedbackContentType,
  milestones: milestoneContentType,
  organizations: organizationContentType,
  guides: guideContentType,
  redirects: redirectContentType,

  // Controlled vocabularies. Previously standalone pages on their own shell;
  // now on the same registry as every other content type, which is what gives
  // them revision history and the shared editor. (venue_categories was dropped
  // with its table — venues.category is governed by src/lib/venueCategories.ts.)
  venue_services: vocabularyContentType({
    table: 'venue_services',
    icon: Wrench,
    label: { singular: 'Venue Service', plural: 'Venue Services' },
    hasSlug: true,
    categoryOptions: SERVICE_CATEGORIES,
  }),
  event_types: vocabularyContentType({
    table: 'event_types',
    icon: CalendarCog,
    label: { singular: 'Event Type', plural: 'Event Types' },
    hasColor: true,
  }),
  event_amenities: vocabularyContentType({
    table: 'event_amenities',
    icon: Sparkles,
    label: { singular: 'Event Amenity', plural: 'Event Amenities' },
    categoryOptions: SERVICE_CATEGORIES,
  }),
  event_services: vocabularyContentType({
    table: 'event_services',
    icon: ConciergeBell,
    label: { singular: 'Event Service', plural: 'Event Services' },
    categoryOptions: SERVICE_CATEGORIES,
  }),
  accessibility_attributes: vocabularyContentType({
    table: 'accessibility_attributes',
    icon: Accessibility,
    label: { singular: 'Accessibility Attribute', plural: 'Accessibility Attributes' },
    categoryOptions: ACCESSIBILITY_CATEGORIES,
  }),
  target_groups: vocabularyContentType({
    table: 'target_groups',
    icon: Users,
    label: { singular: 'Target Group', plural: 'Target Groups' },
    hasColor: true,
  }),
  professions: vocabularyContentType({
    table: 'professions',
    icon: Briefcase,
    label: { singular: 'Profession', plural: 'Professions' },
    hasSlug: true,
    hasColor: true,
    extraFields: [
      {
        name: 'aliases',
        label: 'Aliases',
        type: 'tags',
        group: 'details',
        helpText: 'Alternative spellings matched when normalizing imported professions.',
      },
    ],
  }),
};

/** Get all content type IDs */
export function getContentTypeIds(): string[] {
  return Object.keys(contentTypeRegistry);
}

/** Get a content type config by ID */
export function getContentType(id: string): ContentTypeConfig | undefined {
  return contentTypeRegistry[id];
}

/** Get field configs for a content type, optionally filtered by group */
export function getFieldsByGroup(contentTypeId: string, group?: FieldGroup): FieldConfig[] {
  const config = contentTypeRegistry[contentTypeId];
  if (!config) return [];
  if (!group) return config.fields.filter((f) => !f.hidden);
  return config.fields.filter((f) => f.group === group && !f.hidden);
}

/** Get all available field groups for a content type */
export function getFieldGroups(contentTypeId: string): FieldGroup[] {
  const config = contentTypeRegistry[contentTypeId];
  if (!config) return [];
  if (config.fieldGroupOrder) return config.fieldGroupOrder;
  const groups = new Set(config.fields.filter((f) => !f.hidden).map((f) => f.group));
  return Array.from(groups);
}

/** Field group labels */
export const fieldGroupLabels: Record<FieldGroup, string> = {
  basic: 'Basic Info',
  details: 'Details',
  location: 'Location',
  media: 'Media',
  seo: 'SEO',
  settings: 'Settings',
  lgbtq: 'LGBTQ+ Data',
  external: 'External Data',
};
