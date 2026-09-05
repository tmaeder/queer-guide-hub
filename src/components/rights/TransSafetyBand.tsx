import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TgeuSourceLine } from '@/components/rights/SourceLine';
import {
  readAffirmation,
  readMarker,
  readRequirement,
  readTransViolence,
  requiresIt,
  TGEU_TMM_URL,
  TMM_REPORTING_CAVEAT,
} from '@/lib/rights/transSafety';

/**
 * The trans-specific facts for one country, under Rights & safety.
 *
 * Self-hiding on data, following the TagDiagnosticCodes contract: nothing
 * upstream decides whether a country is "relevant to trans travellers", the
 * presence of a recorded value is the only signal.
 *
 * `LGBTJurisdictionInfo` already renders gender recognition as a chip cluster
 * next to the other 17 rights. This band exists because two of those chips are
 * not rights at all — requiring surgery or a diagnosis is a cost the law
 * imposes, and read as a row in a rights table it looks like a feature. Here
 * they are stated as what they are.
 *
 * Monochrome and uncoloured. `--destructive` is reserved for criminalisation on
 * this page; the documented-violence count in particular must never carry it,
 * because the countries with the highest counts are mostly the legally
 * progressive ones and colouring them as danger inverts the truth.
 */

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-border py-2">
      <span className="min-w-0">
        {label}
        {note ? <span className="block text-xs text-muted-foreground">{note}</span> : null}
      </span>
      <span className="shrink-0 text-13 font-medium tabular-nums">{value}</span>
    </li>
  );
}

export function TransSafetyBand({ country }: { country: Record<string, unknown> }) {
  const { t } = useTranslation();

  const lgr = (country.lgbti_gender_recognition ?? {}) as Record<string, unknown>;
  const hasLgr = Object.keys(lgr).length > 0;
  const violence = readTransViolence(country.trans_violence_documented);

  // Nothing recorded on either axis this band renders — show nothing rather
  // than a heading over two em dashes. (The TGEU Trans Rights Index is a third
  // axis, but it is linked rather than copied — see the `index` section of
  // src/pages/rights/TransRights.tsx for why — so it cannot gate this band.)
  if (!hasLgr && violence.state !== 'documented') return null;

  /**
   * `gender_marker` is the one row still rendered as its raw source string, and
   * that is deliberate — ILGA's own words carry nuance no mapping preserves.
   * "Not Possible (exceptions documented)" (4 countries) says something real
   * that `readMarker`'s `not_possible` throws away, so this row is NOT routed
   * through a label function the way self_id and the two requirements are.
   *
   * The one value that must not reach the page is the unrecorded SENTINEL.
   * Measured on prod 2026-09-04, "No data" is the marker on 69 of the 244
   * countries carrying a non-empty `lgbti_gender_recognition` — a third of the
   * corpus rendering "Gender marker change: No data" as though the sentinel
   * were a finding. Found on /country/afghanistan, where every other row had
   * correctly hidden itself and this one was left announcing the absence.
   *
   * A blank hides; a stamp reads as content. Every sibling row in this band
   * already hides when nothing is recorded, so this is consistency, not a new
   * rule — and an empty string was ALREADY hidden here, so the leak was only
   * ever the literal sentinel.
   */
  const rawMarker = String(lgr.gender_marker ?? '').trim();
  const marker = readMarker(lgr.gender_marker) === 'unrecorded' ? '' : rawMarker;
  const yes = t('rights.trans.yes', 'Yes');
  const no = t('rights.trans.no', 'No');

  /**
   * ILGA answers these two with Required / Not required / N/A / Unclear /
   * Varies — never Yes / No. Rendering a bare yes/no here printed "Surgery
   * required first: No" on Japan, Iran, Turkey and Romania until 2026-09-01:
   * an affirmative false negative on the exact fact this band exists to state.
   *
   * "N/A" is not a "No" either. It means the country has no marker-change
   * procedure for a condition to attach to, which is worse news than "not
   * required", not better — so it gets its own words.
   */
  const requirementLabel = (raw: unknown): string | null => {
    switch (readRequirement(raw)) {
      case 'required':
        return yes;
      case 'not_required':
        return no;
      case 'inapplicable':
        return t('rights.trans.row.noProcedure', 'No procedure exists');
      case 'indeterminate':
        return t('rights.trans.row.unclear', 'Unclear');
      default:
        return null;
    }
  };

  /**
   * The same defect as `requirementLabel`, one row up and left standing when
   * that one was fixed: `self_id` was rendered `isAffirmed(...) ? yes : no`,
   * so every reading that is not a bare "Yes" printed "No".
   *
   * ILGA answers this one with No / No data / Yes / Varies / Unclear / N/A /
   * "Yes (for NB marker only)". Measured on prod, 2026-09-03, over the 244
   * countries carrying a non-empty `lgbti_gender_recognition`:
   *
   *   No 138 · No data 70 · Yes 22 · Varies 7 · Unclear 4 · N/A 2 · Yes(NB) 1
   *
   * So 83 of 244 — every `No data`, `Varies`, `Unclear` and `N/A` — printed
   * "By self-determination: No" for a fact nobody recorded. On a trans-rights
   * page that asymmetry is the whole point: telling a reader a country refuses
   * self-determination when the truth is "unrecorded" is an affirmative false
   * negative, and it is worse than saying nothing.
   *
   * `N/A` gets "No procedure exists" for the same reason it does above, and
   * the claim was re-measured rather than inherited: both `N/A` rows (Hungary,
   * Qatar) carry `gender_marker = "Not Possible"` and
   * `established_procedure = "No"` — 2 of 2. There is no procedure for
   * self-declaration to be part of.
   *
   * `unrecorded` returns null and the row hides, matching `requirementLabel`
   * and this band's "presence of a recorded value is the only signal" contract.
   * That is a deliberate behaviour change: the row used to render for the 70
   * `No data` countries, because `lgr.self_id != null` is true of the STRING
   * "No data".
   */
  const affirmationLabel = (raw: unknown): string | null => {
    switch (readAffirmation(raw)) {
      case 'yes':
        return yes;
      // Nepal, and only Nepal. Not general self-determination, but rendering it
      // as a flat "No" erases a provision that does exist — so the source value
      // is shown verbatim.
      case 'yes_qualified':
        return String(raw);
      case 'no':
        return no;
      case 'inapplicable':
        return t('rights.trans.row.noProcedure', 'No procedure exists');
      // Both `Varies` and `Unclear` land here, following `readAffirmation`.
      // They are not the same thing — `Varies` is how ILGA codes a federation
      // whose sub-jurisdictions disagree (Australia, Canada, Mexico, US), which
      // carries more information than doubt does — but separating them means a
      // new `AffirmationReading` state, which moves `affirmationPolarity` and
      // therefore trans verdicts. That is a vocabulary decision, not a
      // rendering one, and it does not belong in this fix.
      case 'indeterminate':
        return t('rights.trans.row.unclear', 'Unclear');
      default:
        return null;
    }
  };

  return (
    <section
      id="trans"
      aria-labelledby="trans-safety-heading"
      className="mt-10 scroll-mt-8 border-t border-border-hairline pt-8"
    >
      <h3 id="trans-safety-heading" className="text-title font-bold leading-tight">
        {t('rights.trans.bandTitle', 'For trans travellers')}
      </h3>
      <p className="mt-1 text-13 leading-relaxed text-muted-foreground">
        {t(
          'rights.trans.bandNote',
          'What the law here does with your documents, and what it asks for in return.',
        )}
      </p>

      {hasLgr && (
        <ul className="mt-4 list-none p-0 m-0">
          {marker ? (
            <Row label={t('rights.trans.row.marker', 'Gender marker change')} value={marker} />
          ) : null}
          {affirmationLabel(lgr.self_id) ? (
            <Row
              label={t('rights.trans.row.selfId', 'By self-determination')}
              value={affirmationLabel(lgr.self_id) as string}
              note={t('rights.trans.row.selfIdNote', 'No medical or judicial gatekeeper.')}
            />
          ) : null}
          {requirementLabel(lgr.requires_surgery) ? (
            <Row
              label={t('rights.trans.row.surgery', 'Surgery required first')}
              value={requirementLabel(lgr.requires_surgery) as string}
              note={
                requiresIt(lgr.requires_surgery)
                  ? t(
                      'rights.trans.row.surgeryNote',
                      'A sterilisation requirement. This caps the rights verdict for trans people regardless of other protections.',
                    )
                  : undefined
              }
            />
          ) : null}
          {requirementLabel(lgr.requires_diagnosis) ? (
            <Row
              label={t('rights.trans.row.diagnosis', 'Psychiatric diagnosis required')}
              value={requirementLabel(lgr.requires_diagnosis) as string}
            />
          ) : null}
        </ul>
      )}

      {violence.state === 'documented' && (
        <div className="mt-6">
          <p className="text-13">
            <span className="font-medium">
              {t('rights.trans.documentedTitle', 'Documented anti-trans killings')}
            </span>{' '}
            <span className="tabular-nums">{violence.total}</span>{' '}
            <span className="text-muted-foreground">
              {t('rights.trans.documentedSince', 'recorded since 2008')}
              {violence.latestPeriod
                ? ` · ${violence.latestCases} ${t('rights.trans.documentedIn', 'in')} ${violence.latestPeriod}`
                : ''}
            </span>
          </p>
          {/*
            Immediately adjacent to the number, never a footnote. Without it a
            reader compares this figure between countries and reads a ranking of
            danger, which is close to the inverse of what it measures.
          */}
          <p className="mt-2 max-w-prose text-xs text-muted-foreground">
            {t('rights.trans.caveat', TMM_REPORTING_CAVEAT)}
          </p>
          <TgeuSourceLine
            href={TGEU_TMM_URL}
            label={t('rights.trans.tmmSource', 'Trans Murder Monitoring')}
            updatedAt={violence.fetchedAt}
            className="mt-2"
          />
        </div>
      )}

      <p className="mt-6 text-13">
        <LocalizedLink to="/rights/trans">
          {t('rights.trans.bandLink', 'Trans rights, country by country')}
        </LocalizedLink>
      </p>
    </section>
  );
}

export default TransSafetyBand;
