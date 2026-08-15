/**
 * TagDiagnosticCodes — the clinical identifiers a health term carries, grouped
 * the way the classification literature groups them (general / specialized /
 * procedural / pharmaceutical) and linked to the body that issues each code.
 *
 * The band is SELF-SELECTING: it renders only for tags that actually carry
 * codes, so nothing decides "is this a health tag" in the UI. `unified_tags`
 * has no health flag and its `category` cannot stand in for one — the "Sexual
 * Health" category contains ACT UP and Lipstick Lesbian, and "Substances &
 * Harm Reduction" contains mayonnaise. Presence of an ICD/SNOMED/ATC code is
 * the only honest signal, and it comes from the data, not from this component.
 *
 * A code with no `url` is rendered as PLAIN TEXT next to a link to the issuing
 * body's home page. That is not a degraded state to paper over: ICPC-2, ICD-O,
 * DSM, HCPCS and OPS-301 publish no addressable per-code page, and the WHO
 * ICD-11 browser silently ignores a readable code in its fragment. Fabricating
 * a URL would produce a link that looks live and goes nowhere.
 */

import { useTranslation } from 'react-i18next';
import { Eyebrow } from '@/components/ui/Eyebrow';
import {
  useTagMedicalCodes,
  MEDICAL_CODE_GROUPS,
  type MedicalCode,
  type MedicalCodeGroup,
} from '@/hooks/useTagMedicalCodes';

function CodeRow({ item }: { item: MedicalCode }) {
  const { t } = useTranslation();
  return (
    <li className="flex items-baseline justify-between gap-4 border-b-2 border-foreground/15 py-2 last:border-b-0">
      <span className="text-13 opacity-75">{item.label}</span>
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-13 font-bold"
          // The code alone is meaningless out of context to a screen reader
          // moving link-by-link, and every row on the page would read as a
          // bare number otherwise.
          aria-label={t('tags.detail.codes.linkLabel', '{{label}} code {{code}}', {
            label: item.label,
            code: item.code,
          })}
        >
          {item.code}
        </a>
      ) : (
        <span className="text-13 font-bold">
          {item.code}
          {item.home_url && (
            <>
              {' '}
              <a
                href={item.home_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-2xs font-semibold uppercase tracking-label opacity-75"
              >
                {t('tags.detail.codes.source', 'Source')}
              </a>
            </>
          )}
        </span>
      )}
    </li>
  );
}

export function TagDiagnosticCodes({ tagId }: { tagId: string }) {
  const { t } = useTranslation();
  const { data: codes } = useTagMedicalCodes(tagId);

  const groupLabels: Record<MedicalCodeGroup, string> = {
    general: t('tags.detail.codes.general', 'General'),
    specialized: t('tags.detail.codes.specialized', 'Specialized'),
    procedural: t('tags.detail.codes.procedural', 'Procedural'),
    pharmaceutical: t('tags.detail.codes.pharmaceutical', 'Pharmaceutical'),
  };

  const groups = MEDICAL_CODE_GROUPS.filter((g) => (codes?.[g]?.length ?? 0) > 0);
  if (groups.length === 0) return null;

  return (
    <section
      id="codes"
      aria-labelledby="codes-heading"
      className="border-y-4 border-foreground py-8"
    >
      <Eyebrow as="p">{t('tags.detail.codes.eyebrow', 'Classification')}</Eyebrow>
      <h2
        id="codes-heading"
        className="mt-2 font-display text-headline leading-tight md:text-display"
      >
        {t('tags.detail.codes.title', 'Diagnostic codes')}
      </h2>

      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group}>
            <h3 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
              {groupLabels[group]}
            </h3>
            <ul className="mt-2 list-none p-0">
              {codes?.[group]?.map((item) => (
                <CodeRow key={`${item.system}-${item.code}`} item={item} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-6 text-13 opacity-75">
        {t(
          'tags.detail.codes.disclaimer',
          'Reference codes for this concept in clinical classification systems. Not medical advice and not a diagnosis.',
        )}
      </p>
    </section>
  );
}
