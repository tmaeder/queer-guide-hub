/**
 * Read-only view of a tag's clinical codes for the CMS editor.
 *
 * Deliberately not editable. Every row is derived from the tag's Wikidata item
 * by the weekly `run_tag_medical_codes_sync`, which retracts anything the
 * source no longer carries — so a hand-typed code would silently disappear on
 * the next Monday and a hand-corrected one would silently revert. The way to
 * change what appears here is to fix the tag's `wikidata_id`, or the statement
 * on Wikidata itself.
 *
 * The `tag_medical_codes` table does carry `source = 'editorial'`, which the
 * sync never deletes, so a curated lane can be opened later without a schema
 * change. It is closed today because nothing curates it.
 */

import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import {
  useTagMedicalCodes,
  MEDICAL_CODE_GROUPS,
  countMedicalCodes,
} from '@/hooks/useTagMedicalCodes';

export function TagMedicalCodesSection({ tagId }: { tagId: string }) {
  const { t } = useTranslation();
  const { data: codes, isLoading } = useTagMedicalCodes(tagId);
  const total = countMedicalCodes(codes);

  if (isLoading) {
    return <p className="text-13 text-muted-foreground">{t('common.loading', 'Loading…')}</p>;
  }

  if (total === 0) {
    return (
      <p className="text-13 text-muted-foreground">
        No diagnostic codes. Codes are derived from the tag&apos;s Wikidata item — a term with no
        Wikidata ID, or one whose item carries no ICD/SNOMED/ATC statement, has none.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {MEDICAL_CODE_GROUPS.filter((g) => (codes?.[g]?.length ?? 0) > 0).map((group) => (
        <div key={group}>
          <h3 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {group}
          </h3>
          <ul className="mt-2 list-none p-0">
            {codes?.[group]?.map((item) => (
              <li
                key={`${item.system}-${item.code}`}
                className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0"
              >
                <span className="text-13 text-muted-foreground">{item.label}</span>
                <span className="flex items-center gap-2 text-13 font-bold">
                  {item.code}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={item.code}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-2xs text-muted-foreground">
        Derived from Wikidata weekly. Read-only — edit the tag&apos;s Wikidata ID to change these.
      </p>
    </div>
  );
}
