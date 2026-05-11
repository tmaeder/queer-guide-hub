export interface UnifiedMediaItem {
  id: string;
  source_type: 'image_asset' | 'cms_media';
  display_name: string;
  url: string | null;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  file_size: number;
  mime_type: string;
  format: string | null;
  source: string | null;
  license: string | null;
  attribution: string | null;
  alt_text: string | null;
  alt_text_i18n: Record<string, string> | null;
  caption_i18n: Record<string, string> | null;
  phash: string | null;
  content_hash: string | null;
  is_flagged: boolean;
  flagged_reason: string | null;
  asset_status: string;
  optimization_status: OptimizationStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  uploaded_by: string | null;
  storage_path: string | null;
  bucket_name: string | null;
  starred: boolean;
  usage_count: number;
  entity_types: string[] | null;
}

export type OptimizationStatus =
  | 'pending'
  | 'processing'
  | 'optimized'
  | 'cdn_optimized'
  | 'failed'
  | 'skipped'
  | 'not_optimized';

export type ViewMode = 'grid' | 'list';
export type SortBy = 'created_at' | 'updated_at' | 'display_name' | 'file_size' | 'usage_count';
export type SortDir = 'asc' | 'desc';

export type StatusFilter =
  | 'all'
  | 'optimized'
  | 'pending'
  | 'processing'
  | 'failed'
  | 'skipped'
  | 'flagged'
  | 'starred'
  | 'unused'
  | 'no_alt';

export type FormatFilter =
  | 'all'
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'avif'
  | 'gif'
  | 'svg';

export type SourceTypeFilter = 'all' | 'image_asset' | 'cms_media';

export type EntityTypeFilter =
  | 'all'
  | 'venue'
  | 'event'
  | 'news_article'
  | 'personality'
  | 'marketplace_listing'
  | 'city'
  | 'country'
  | 'queer_village';

export interface EntityLink {
  entity_type: string;
  entity_id: string;
  role: string;
  sort_order: number | null;
  entity_name?: string;
}

export interface MediaDetailData extends UnifiedMediaItem {
  entity_links: EntityLink[];
}

export interface DuplicateGroup {
  group_hash: string;
  items: Array<{
    asset_id: string;
    url: string;
    thumbnail_url: string | null;
    file_size: number;
    created_at: string;
  }>;
}

export interface VisualDuplicatePair {
  asset_a: string;
  asset_b: string;
  url_a: string;
  url_b: string;
  thumb_a: string | null;
  thumb_b: string | null;
  hamming_distance: number;
}
