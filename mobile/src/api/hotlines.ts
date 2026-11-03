import { useQuery } from '@tanstack/react-query';
import { withOfflineFallback } from '@/features/packs/offline';
import { offlineHotlines } from '@/features/packs/store';
import { supabase } from '@/lib/supabase';

/**
 * Subset of `Hotline` from the web's src/types/cms.ts — the fields this app
 * renders. Hotlines are hand-edited JSON inside the published `help` CMS page
 * (`cms_pages.body_json.hotlines`), the same source /help reads.
 */
export type HotlineChannelKind = 'phone' | 'sms' | 'whatsapp' | 'chat' | 'email';

export interface HotlineChannel {
  kind: HotlineChannelKind;
  /** tel: digits, https URL, or mailto: address */
  value: string;
  label?: string;
  hours?: string;
}

export interface Hotline {
  id: string;
  name: string;
  /** ISO country code, or 'INT' for international */
  country: string;
  phone: string | null;
  channels?: HotlineChannel[];
  topics: string[];
  languages: string[];
  hours: string;
  always_open?: boolean;
  description: string;
  free?: boolean;
  anonymous?: boolean;
  /**
   * THREE-state and load-bearing (outing risk): true = operator says it may
   * contact police without consent, false = operator says it does not,
   * absent = not addressed → render nothing. Never inferred.
   */
  reports_to_police?: boolean;
  /** 'directory' = referral org with no call-now channel. Never shown as a crisis line. */
  kind?: 'hotline' | 'directory';
  url?: string;
}

/** Online first; a downloaded pack's signed copy answers when offline. */
export function fetchHotlines(): Promise<Hotline[]> {
  return withOfflineFallback(fetchHotlinesOnline, async (db) => {
    const local = await offlineHotlines(db);
    return local.length ? local : null;
  });
}

async function fetchHotlinesOnline(): Promise<Hotline[]> {
  const { data, error } = await supabase
    .from('cms_pages')
    .select('body_json')
    .eq('slug', 'help')
    .eq('workflow_state', 'published')
    .maybeSingle();
  if (error) throw error;
  const body = data?.body_json as { hotlines?: unknown } | null | undefined;
  return Array.isArray(body?.hotlines) ? (body.hotlines as Hotline[]) : [];
}

/** Every channel a hotline offers, with the legacy `phone` field folded in. */
export function channelsOf(h: Hotline): HotlineChannel[] {
  const list = [...(h.channels ?? [])];
  if (h.phone && !list.some((c) => c.kind === 'phone')) {
    list.unshift({ kind: 'phone', value: h.phone });
  }
  return list;
}

/** The URL the OS should open for a channel, or null if it is not actionable. */
export function channelHref(c: HotlineChannel): string | null {
  const v = c.value.trim();
  if (!v) return null;
  switch (c.kind) {
    case 'phone':
      return v.startsWith('tel:') ? v : `tel:${v.replace(/[^\d+]/g, '')}`;
    case 'sms':
      return v.startsWith('sms:') ? v : `sms:${v.replace(/[^\d+]/g, '')}`;
    case 'email':
      return v.startsWith('mailto:') ? v : `mailto:${v}`;
    case 'whatsapp':
    case 'chat':
      return /^https:\/\//.test(v) ? v : null;
  }
}

/**
 * Crisis lines for a country: the country's own lines first, then
 * international ones. Directories are excluded — a person in crisis must
 * never be shown a website where they expect a phone line.
 */
export function hotlinesFor(all: Hotline[], countryCode: string | null): Hotline[] {
  const cc = countryCode?.toUpperCase() ?? null;
  const crisis = all.filter((h) => (h.kind ?? 'hotline') === 'hotline' && channelsOf(h).length > 0);
  const rank = (h: Hotline) => (cc && h.country?.toUpperCase() === cc ? 0 : h.country === 'INT' ? 1 : 2);
  return crisis
    .filter((h) => rank(h) < 2)
    .sort((a, b) => rank(a) - rank(b) || Number(!!b.always_open) - Number(!!a.always_open));
}

export function useHotlines() {
  return useQuery({
    queryKey: ['hotlines'],
    queryFn: fetchHotlines,
    // Safety info must still show offline: keep it for a week once fetched.
    staleTime: 24 * 60 * 60_000,
    gcTime: 7 * 24 * 60 * 60_000,
  });
}
