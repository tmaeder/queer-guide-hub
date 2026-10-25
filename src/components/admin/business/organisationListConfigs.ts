import { Briefcase, Handshake } from '@/components/icons';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import { hotelContentType } from '@/config/contentTypes/hotel';
import { marketplaceBrandContentType } from '@/config/contentTypes/brand';
function field(
  name: string,
  label: string,
  type: FieldConfig['type'] = 'text',
  options?: string[],
): FieldConfig {
  return {
    name,
    label,
    type,
    group: 'basic',
    readOnly: true,
    listColumn: true,
    sortable: type !== 'tags',
    filterable: true,
    options: options?.map((value) => ({ value, label: value.replaceAll('_', ' ') })),
  };
}
const common = {
  primaryKey: 'id',
  color: 'hsl(var(--foreground))',
  defaultSort: { field: 'title', dir: 'asc' as const },
};
export const merchantListConfig: ContentTypeConfig = {
  ...common,
  id: 'workspace_merchants',
  tableName: 'marketplace_merchants',
  titleField: 'display_name',
  descriptionField: 'shop_domain',
  icon: Briefcase,
  label: { singular: 'Merchant', plural: 'Merchants' },
  listSearchFields: ['display_name', 'shop_domain', 'slug', 'provider'],
  fields: [
    { ...field('display_name', 'Name'), listColumn: false },
    field('provider', 'Provider', 'select', [
      'shopify-public',
      'woocommerce-public',
      'etsy',
      'crawl',
      'awin',
    ]),
    field('listings_active', 'Listings', 'number'),
    field('broken_active_links', 'Broken links', 'number'),
    { ...field('clicks', 'Clicks', 'number'), listColumn: false },
    { ...field('commission_usd', 'Commission (USD)', 'number'), listColumn: false },
    field('last_sync_status', 'Sync', 'select', ['ok', 'error', 'skipped']),
    field('partner_name', 'Partner'),
    { ...field('is_enabled', 'Enabled', 'boolean'), listColumn: false },
    { ...field('last_sync_at', 'Last sync', 'datetime'), listColumn: false },
  ],
};
export const partnerListConfig: ContentTypeConfig = {
  ...common,
  id: 'workspace_partners',
  tableName: 'affiliate_partners',
  titleField: 'partner_name',
  icon: Handshake,
  label: { singular: 'Partner', plural: 'Partners' },
  listSearchFields: ['partner_name', 'domains', 'go_key'],
  fields: [
    { ...field('partner_name', 'Name'), listColumn: false },
    field('domains', 'Domains', 'tags'),
    field('go_key', 'Redirect key'),
    { ...field('enabled', 'Enabled', 'boolean'), listColumn: false },
    { ...field('sub_field', 'Tracking field'), listColumn: false },
  ],
};
export const hotelListConfig: ContentTypeConfig = {
  ...hotelContentType,
  id: 'workspace_hotels',
  listStatus: (row) => (row.archived_at ? 'archived' : 'active'),
  label: { singular: 'Hotel', plural: 'Hotels' },
  listSearchFields: ['name', 'city', 'country'],
  defaultSort: { field: 'title', dir: 'asc' },
  fields: hotelContentType.fields.map((f) => ({
    ...f,
    readOnly: true,
    listColumn: ['hotel_type', 'city', 'country', 'star_rating', 'featured', 'verified'].includes(
      f.name,
    ),
  })),
};
export const brandListConfig: ContentTypeConfig = {
  ...marketplaceBrandContentType,
  id: 'workspace_brands',
  listStatus: (row) =>
    typeof row.publication_status === 'string' ? row.publication_status : undefined,
  label: { singular: 'Brand', plural: 'Brands' },
  defaultSort: { field: 'title', dir: 'asc' },
  listSearchFields: ['display_name', 'brand_key', 'slug', 'website'],
  fields: [
    ...marketplaceBrandContentType.fields
      .filter((f) => f.name !== 'status')
      .map((f) => ({ ...f, readOnly: true })),
    {
      ...field('publication_status', 'Publication', 'select', ['draft', 'published', 'archived']),
      listColumn: false,
    },
    field('ownership_review_status', 'Ownership review', 'select', [
      'unreviewed',
      'pending',
      'verified',
      'rejected',
    ]),
  ],
};
