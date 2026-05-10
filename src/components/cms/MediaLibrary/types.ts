export interface MediaItem {
  id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  width?: number;
  height?: number;
  storage_path?: string;
  external_url?: string;
  uploaded_by: string;
  created_at: string;
  alt_text?: string;
  caption?: string;
  usage_count?: number;
  content_items?: string[];
  entity_types?: string[];
  asset_status?: string;
  is_flagged?: boolean;
  source?: string;
  optimized?: boolean;
  starred?: boolean;
  tags?: string[];
  optimization_status?: 'pending' | 'processing' | 'optimized' | 'cdn_optimized' | 'failed' | 'skipped' | 'not_optimized';
  formats_available?: string[];
  optimization_metadata?: {
    original_size?: number;
    compressed_size?: number;
    compression_ratio?: number;
    formats?: Array<{
      format: string;
      size: number;
      width?: number;
      height?: number;
    }>;
  };
}

export type ViewMode = 'grid' | 'list' | 'compact';
export type SortBy = 'created_at' | 'filename' | 'file_size' | 'usage_count' | 'optimized';
export type FilterBy = 'all' | 'images' | 'videos' | 'documents' | 'unused' | 'starred' | 'unoptimized';
export type EntityTypeFilter = 'all' | 'venue' | 'event' | 'news_article' | 'personality' | 'marketplace_listing' | 'city' | 'country' | 'queer_village';

export interface OptimizationSettings {
  quality: number;
  formats: string[];
  resize: boolean;
  maxWidth?: number;
  maxHeight?: number;
  preserveMetadata: boolean;
  enableProgressiveJpeg: boolean;
  enableLosslessWebP: boolean;
}

export interface OptimizationJob {
  id: string;
  media_ids: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  settings: OptimizationSettings;
  results?: {
    processed: number;
    successful: number;
    failed: number;
    totalSavings: number;
  };
}
