import { useEffect } from 'react';
import { untypedRpc } from '@/integrations/supabase/untyped';

/**
 * Demand signal for the self-hosted translator (docs/translation.md).
 *
 * When a non-English reader sees an original because no translation exists
 * yet, ask the NAS queue for one. Fire-and-forget: the page never waits, and a
 * failed request just means the original keeps showing. Repeat views raise the
 * job's priority server-side; one request per (entity, locale) per page load
 * here is enough.
 *
 * Crawlers are skipped: every locale URL is crawlable, so a bot that runs JS
 * would otherwise enqueue the entire corpus in every language and turn
 * "demand-driven" into "everything".
 */

export type TranslatableEntity = 'venues' | 'events' | 'organizations';

const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|prerender|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype/i;

export function isLikelyBot(): boolean {
  if (typeof navigator === 'undefined') return true;
  return (
    Boolean((navigator as { webdriver?: boolean }).webdriver) || BOT_UA.test(navigator.userAgent)
  );
}

const requested = new Set<string>();

export function useRequestTranslation(
  entityType: TranslatableEntity,
  entityId: string | null | undefined,
  locale: string,
  needed: boolean,
): void {
  useEffect(() => {
    if (!needed || !entityId || locale === 'en' || isLikelyBot()) return;
    const key = `${entityType}:${entityId}:${locale}`;
    if (requested.has(key)) return;
    requested.add(key);
    void untypedRpc('request_translation', {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_locale: locale,
    }).catch(() => {});
  }, [entityType, entityId, locale, needed]);
}
