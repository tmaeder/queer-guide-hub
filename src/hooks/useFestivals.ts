import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';

/**
 * Festival brands (`public.festivals`) and their yearly editions — the umbrella
 * events carrying `festival_id`. Filled nightly by `run_festival_brand_link`
 * (migration 99991795355942).
 *
 * Both tables are read under RLS, so a brand or edition in a criminalizing
 * country is invisible to anon exactly as everywhere else.
 */

export interface FestivalEdition {
  id: string;
  slug: string;
  title: string;
  start_date: string;
  end_date: string | null;
  programme_size: number | null;
  venue_name: string | null;
  images?: string[] | null;
  /** Detail page only — the directory leaves the prose fields out. */
  description?: string | null;
  ticket_url?: string | null;
  website?: string | null;
  address?: string | null;
  event_type?: string | null;
}

export interface Festival {
  id: string;
  name: string;
  slug: string;
  festival_type: string | null;
  description: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  editions: FestivalEdition[];
}

const BRAND = 'id, name, slug, festival_type, description, website, city, country';
const EDITION = 'id, slug, title, start_date, end_date, programme_size, venue_name, images';

/** The hub needs dates and a photo per edition, not the prose. */
const DIRECTORY_SELECT = `${BRAND}, editions:events!festival_id(${EDITION}, duplicate_of_id, status)`;
/** The brand page also shows the next edition's description, tickets and website. */
const DETAIL_SELECT = `${BRAND}, editions:events!festival_id(${EDITION}, description, ticket_url, website, address, event_type, duplicate_of_id, status)`;

type Row = Omit<Festival, 'editions'> & {
  editions: Array<
    FestivalEdition & { duplicate_of_id: string | null; status: string | null }
  > | null;
};

function clean(row: Row): Festival {
  const editions = (row.editions ?? [])
    .filter((e) => !e.duplicate_of_id && e.status !== 'cancelled')
    .map(({ duplicate_of_id: _d, status: _s, ...e }) => e)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  return { ...row, editions };
}

/** The next edition that has not ended, or null. */
export function nextEdition(f: Festival, now = new Date()): FestivalEdition | null {
  return (
    f.editions.find((e) => new Date(e.end_date ?? e.start_date).getTime() >= now.getTime()) ?? null
  );
}

/** Every brand with an edition still to come, soonest first. */
export function useFestivalDirectory() {
  return useQuery({
    queryKey: ['festival-directory'],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await untypedFrom('festivals')
        .select(DIRECTORY_SELECT)
        .not('brand_key', 'is', null)
        .limit(2000);
      if (error) throw error;
      const now = new Date();
      return ((data ?? []) as unknown as Row[])
        .map(clean)
        .map((f) => ({ festival: f, next: nextEdition(f, now) }))
        .filter((x): x is { festival: Festival; next: FestivalEdition } => x.next !== null)
        .sort(
          (a, b) => new Date(a.next.start_date).getTime() - new Date(b.next.start_date).getTime(),
        );
    },
  });
}

export function useFestival(slug: string | undefined) {
  return useQuery({
    queryKey: ['festival', slug],
    enabled: !!slug,
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<Festival | null> => {
      const { data, error } = await untypedFrom('festivals')
        .select(DETAIL_SELECT)
        .eq('slug', slug!)
        .maybeSingle();
      if (error) throw error;
      return data ? clean(data as unknown as Row) : null;
    },
  });
}
