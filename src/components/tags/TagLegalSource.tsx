import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { SidebarCard, SidebarRow } from '@/components/transit/SidebarCard';
import { SourceLine } from '@/components/rights/SourceLine';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  rightTopicForTag,
  rightTopicHref,
  isUmbrellaRightsTag,
} from '@/lib/rights/tagRightTopics';
import type { TagLegalSourceRow } from '@/hooks/usePageFetchers';

/**
 * Where the law behind a glossary tag actually lives.
 *
 * Two tracks, because "the concrete source of law" only has one answer for some
 * tags:
 *
 *   A. The tag IS an instrument (`uganda-anti-homosexuality-act`, the UN
 *      conventions). One hand-researched, URL-verified citation from
 *      `tag_sources` where `is_public`.
 *   B. The tag is a CLASS of law (`marriage-equality` is 38 national statutes).
 *      There is no citation to give, so we say so and send the reader to the
 *      per-country ILGA ledger instead of inventing a statute.
 *
 * Renders nothing when neither applies — the ProvenanceLine convention that a
 * module with no data does not draw an empty box.
 */

const STATUS_LABEL: Record<string, [key: string, fallback: string]> = {
  in_force: ['tags.detail.lawInForce', 'In force'],
  repealed: ['tags.detail.lawRepealed', 'Repealed'],
  superseded: ['tags.detail.lawSuperseded', 'Superseded'],
  // Uganda's Anti-Homosexuality Act is the reason this value exists: the
  // Constitutional Court upheld it in 2024 while striking four sections, and
  // both "in force" and "superseded" would misdescribe that.
  partially_invalidated: ['tags.detail.lawPartlyStruck', 'In force, partly struck down'],
};

export function TagLegalSource({
  sources,
  tagSlug,
}: {
  sources: TagLegalSourceRow[];
  tagSlug: string | null | undefined;
}) {
  const { t } = useTranslation();

  // A row missing its title or URL is skipped rather than rendered as a bare
  // link. The DB CHECK already forbids publishing one, so this is belt-and-braces
  // against a row that reached the client some other way — and a naked URL under
  // a "Source of law" heading is exactly the kind of half-claim this feature
  // exists to avoid.
  const cited = sources.filter((s) => s.official_title && s.source_url);
  const topic = rightTopicForTag(tagSlug);
  const umbrella = isUmbrellaRightsTag(tagSlug);

  if (cited.length === 0 && !topic && !umbrella) return null;

  return (
    <SidebarCard eyebrow={t('tags.detail.sourceOfLaw', 'Source of law')}>
      {cited.map((s) => {
        const status = s.instrument_status ? STATUS_LABEL[s.instrument_status] : undefined;
        return (
          <div key={s.id} className="mb-4 last:mb-0">
            <a
              href={s.source_url as string}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-start gap-1.5 text-13 font-bold leading-snug"
            >
              <ExternalLink size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>{s.official_title}</span>
            </a>
            {s.claim_summary && <p className="mt-1 text-13 opacity-75">{s.claim_summary}</p>}
            <div className="mt-2">
              {s.jurisdiction && (
                <SidebarRow
                  label={t('tags.detail.lawJurisdiction', 'Jurisdiction')}
                  value={
                    s.jurisdiction === 'INT'
                      ? t('tags.detail.lawInternational', 'International')
                      : s.jurisdiction
                  }
                />
              )}
              {s.adopted_year != null && (
                <SidebarRow label={t('tags.detail.lawAdopted', 'Adopted')} value={s.adopted_year} />
              )}
              {status && (
                <SidebarRow
                  label={t('tags.detail.lawStatus', 'Status')}
                  value={t(status[0], status[1])}
                />
              )}
            </div>
          </div>
        );
      })}

      {topic && (
        <div className={cited.length > 0 ? 'mt-4 border-t-2 border-foreground/15 pt-4' : ''}>
          <p className="text-13">
            {t(
              'tags.detail.notOneLaw',
              'This is not a single law. It is recorded country by country.',
            )}
          </p>
          <LocalizedLink to={rightTopicHref(topic)} className="mt-1 inline-block text-13 font-bold">
            {t('tags.detail.seeByCountry', 'See status by country')}
          </LocalizedLink>
          <SourceLine className="mt-2" />
        </div>
      )}

      {/* Whole-field tags. Deliberately NOT collapsed into the branch above:
          "this one right is recorded country by country" and "this term covers
          every right we track" are different claims, and saying the first about
          `lgbtqia-rights` would understate what the tag actually spans. */}
      {umbrella && !topic && (
        <div className={cited.length > 0 ? 'mt-4 border-t-2 border-foreground/15 pt-4' : ''}>
          <p className="text-13">
            {t(
              'tags.detail.spansAllRights',
              'This covers a whole field of law, not one statute. We track 18 separate rights, country by country.',
            )}
          </p>
          <LocalizedLink to="/rights" className="mt-1 inline-block text-13 font-bold">
            {t('tags.detail.seeAllRights', 'See all 18 rights by country')}
          </LocalizedLink>
          <SourceLine className="mt-2" />
        </div>
      )}
    </SidebarCard>
  );
}

export default TagLegalSource;
