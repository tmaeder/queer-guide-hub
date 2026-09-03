import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TgeuSourceLine } from '@/components/rights/SourceLine';
import {
  isAffirmed,
  readAffirmation,
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

  const marker = String(lgr.gender_marker ?? '').trim();
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
          {lgr.self_id != null ? (
            <Row
              label={t('rights.trans.row.selfId', 'By self-determination')}
              value={
                // Nepal records "Yes (for NB marker only)". That is not general
                // self-determination, but rendering it as a flat "No" erases a
                // provision that does exist — so the source value is shown.
                readAffirmation(lgr.self_id) === 'yes_qualified'
                  ? String(lgr.self_id)
                  : isAffirmed(lgr.self_id)
                    ? yes
                    : no
              }
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
