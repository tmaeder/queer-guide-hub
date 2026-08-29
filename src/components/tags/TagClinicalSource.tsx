import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { SidebarCard, SidebarRow } from '@/components/transit/SidebarCard';
import type { TagLegalSourceRow } from '@/hooks/usePageFetchers';

/**
 * The clinical guidance a health tag's definition came from.
 *
 * Sibling of TagLegalSource, and deliberately a separate card rather than another
 * branch of it: "Source of law" and "Clinical guidance" are different claims, and
 * a reader who sees a medical definition filed under a legal heading will draw the
 * wrong conclusion about what kind of authority it carries.
 *
 * THE EDITION YEAR IS THE POINT OF THIS CARD, not a detail on it. Clinical guidance
 * goes stale in a way that a statute does not — the UCSF guidelines these tags are
 * built from are the 2016 second edition, and a reader deciding how much weight to
 * give a definition needs that in front of them. It is why the publishing CHECK
 * requires `adopted_year` for a clinical row where it requires `jurisdiction` for a
 * legal one, and why the year renders even though the legal card treats it as
 * optional.
 *
 * Renders nothing when there is no citation — the ProvenanceLine convention that a
 * module with no data does not draw an empty box.
 */

export function TagClinicalSource({ sources }: { sources: TagLegalSourceRow[] }) {
  const { t } = useTranslation();

  // A row missing its title or URL is skipped rather than rendered as a bare link.
  // The DB CHECK already forbids publishing one; this guards a row that reached the
  // client some other way, and a naked URL under a clinical heading is exactly the
  // half-claim this card exists to avoid.
  const cited = sources.filter((s) => s.official_title && s.source_url);
  if (cited.length === 0) return null;

  return (
    <SidebarCard eyebrow={t('tags.detail.clinicalGuidance', 'Clinical guidance')}>
      {cited.map((s) => (
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
          {s.adopted_year != null && (
            <div className="mt-2">
              <SidebarRow
                label={t('tags.detail.guidanceEdition', 'Edition')}
                value={s.adopted_year}
              />
            </div>
          )}
        </div>
      ))}
      <p className="mt-4 border-t border-border-hairline pt-4 text-13 opacity-75">
        {t(
          'tags.detail.notMedicalAdvice',
          'Definitions here are drawn from published clinical guidance. They are not medical advice — follow the link for clinical detail, and talk to a clinician about your own care.',
        )}
      </p>
    </SidebarCard>
  );
}
