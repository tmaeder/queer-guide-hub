import type { ContentTypeConfig, FieldConfig, FieldGroup } from '@/types/cms';
import { venueContentType } from './venue';
import { eventContentType } from './event';
import { personalityContentType } from './personality';
import { newsArticleContentType } from './news';
import { cityContentType } from './city';
import { countryContentType } from './country';
import { unifiedTagsContentType } from './tag';
import { marketplaceContentType } from './marketplace';
import { communityGroupsContentType } from './group';
import { cmsPagesContentType } from './page';
import { hotelContentType } from './hotel';
import { queerVillageContentType } from './village';
import { feedbackContentType } from './feedback';

export const contentTypeRegistry: Record<string, ContentTypeConfig> = {
  venues: venueContentType,
  events: eventContentType,
  personalities: personalityContentType,
  news_articles: newsArticleContentType,
  cities: cityContentType,
  countries: countryContentType,
  unified_tags: unifiedTagsContentType,
  marketplace_listings: marketplaceContentType,
  community_groups: communityGroupsContentType,
  cms_pages: cmsPagesContentType,
  hotels: hotelContentType,
  queer_villages: queerVillageContentType,
  feedback: feedbackContentType,
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
