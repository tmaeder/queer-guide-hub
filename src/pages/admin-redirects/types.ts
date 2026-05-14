import type { RedirectType } from '@/hooks/useRedirects';

export const SUPABASE_URL = 'https://xqeacpakadqfxjxjcewc.supabase.co';

export interface RedirectRow {
  id: string;
  type: RedirectType;
  slug: string | null;
  source_path: string | null;
  match_kind: string;
  target: string;
  status_code: number;
  is_enabled: boolean;
  click_count: number;
  click_limit: number | null;
  query_mode: string;
  notes: string | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
}
