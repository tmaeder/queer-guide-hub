import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Fingerprint, Scale, Shield, Skull } from 'lucide-react';
import { parseSsuDetails, deathPenaltyRisk } from '@/utils/equalityScore';
import {
  RIGHT_SECTION_LABEL,
  RIGHT_SECTION_ORDER,
  topicsInSection,
  type RightSection,
  type RightTopic,
} from '@/lib/rights/rightsCatalog';
import { readRightValue, topicScalarValue } from '@/lib/rights/rightsValue';
import { StatusGlyph } from '@/components/rights/StatusGlyph';
import { ProtectionCells, ProtectionCellsHeader } from '@/components/rights/ProtectionCells';
import { RightRow } from '@/components/rights/RightRow';
import { SourceLine } from '@/components/rights/SourceLine';
import { LensVerdictSummary } from '@/components/rights/LensVerdictSummary';

interface LGBTJurisdictionInfoProps {
  country: Record<string, unknown>;
  className?: string;
  countryName?: string;
  countryCode?: string;
  style?: React.CSSProperties;
}

/**
 * The full ILGA rights card for one country.
 *
 * Composed from `src/lib/rights/rightsCatalog` (which rights exist, in what
 * order) plus the shared primitives in `src/components/rights/`. The 18 rows
 * used to be hardcoded JSX here, which is why `/rights` could render only one
 * of them and why the value classifier could not be unit-tested — it was a
 * closure inside a 483-line component, and it was wrong on 267 rows.
 *
 * Anything added here should be added to the catalog instead.
 */

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-xs2 font-bold uppercase tracking-[0.05em] text-muted-foreground">
    {children}
  </p>
);

/** Rows whose shape is bespoke and rendered inline rather than via RightRow. */
const CUSTOM_SLUGS = new Set(['criminalisation', 'marriage', 'civil-union', 'gender-recognition']);

function topicLabel(t: ReturnType<typeof useTranslation>['t'], topic: RightTopic): string {
  return t(`country.rights.${topic.labelKey}`, topic.labelDefault);
}

/** Reads the scalar a status-kind topic renders. */
export default function LGBTJurisdictionInfo({
  country,
  className = '',
  style,
}: LGBTJurisdictionInfoProps) {
  const { t } = useTranslation();
  if (!country) return null;

  const crim = country.lgbti_criminalization as Record<string, unknown> | null;
  const ssu = parseSsuDetails(country.lgbti_same_sex_unions as string | null);
  const gender = country.lgbti_gender_recognition as Record<string, unknown> | null;

  const crimLegal = crim?.legal;
  const crimStatus = crimLegal === true ? 'Legal' : crimLegal === false ? 'Criminalised' : null;
  const dpRisk = deathPenaltyRisk(crim);
  const ssuValue = readRightValue(ssu.summary);

  const renderSection = (section: RightSection) => {
    const topics = topicsInSection(section);
    const isMatrix = section === 'antiDiscrimination' || section === 'criminalJustice';

    return (
      <div key={section}>
        {section === 'antiDiscrimination' ? (
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs2 font-bold uppercase tracking-[0.05em] text-muted-foreground">
              {t(`country.rights.section.${section}`, RIGHT_SECTION_LABEL[section])}
            </p>
            <ProtectionCellsHeader />
          </div>
        ) : (
          <SectionLabel>
            {t(`country.rights.section.${section}`, RIGHT_SECTION_LABEL[section])}
          </SectionLabel>
        )}

        <div className={isMatrix ? 'flex flex-col' : 'flex flex-col gap-1'}>
          {topics.map((topic) => {
            // --- Criminalisation: penalty detail + the death-penalty split ---
            if (topic.slug === 'criminalisation') {
              return (
                <React.Fragment key={topic.slug}>
                  <div className="flex items-center gap-4 py-2">
                    <Scale
                      size={15}
                      className="shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="flex-1 text-13 font-medium">{topicLabel(t, topic)}</p>
                    {crimStatus ? (
                      <div className="flex shrink-0 items-center gap-2">
                        {dpRisk !== 'none' ? (
                          <Skull
                            size={15}
                            className="shrink-0 text-destructive"
                            aria-hidden="true"
                          />
                        ) : (
                          <StatusGlyph kind={crimLegal === false ? 'severe' : 'yes'} />
                        )}
                        <Badge
                          variant={crimLegal === false ? 'destructive' : 'secondary'}
                          className="text-2xs"
                        >
                          {t(
                            `rights.value.${crimLegal === false ? 'criminalised' : 'legal'}`,
                            crimStatus,
                          )}
                        </Badge>
                      </div>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t('country.rights.noData', 'No data')}
                      </span>
                    )}
                  </div>
                  {crimLegal === false && (crim?.penalty as string) && (
                    <p className="pl-8 text-xs font-medium text-destructive">
                      {t('country.rights.penalty', 'Penalty')}: {crim?.penalty as string}
                      {crim?.max_prison ? ` (${crim.max_prison as string})` : ''}
                      {dpRisk === 'confirmed'
                        ? ` — ${t('country.rights.deathPenalty', 'death penalty')}`
                        : dpRisk === 'possible'
                          ? ` — ${t('country.rights.deathPenaltyPossible', 'death penalty possible, no legal certainty')}`
                          : ''}
                    </p>
                  )}
                  {crimLegal === true && (crim?.decrim_year_1 as string) && (
                    <p className="pl-8 text-xs text-muted-foreground">
                      {t('country.rights.decriminalized', 'Decriminalized')}:{' '}
                      {crim?.decrim_year_1 as string}
                      {crim?.decrim_year_2 ? ` / ${crim.decrim_year_2 as string}` : ''}
                    </p>
                  )}
                </React.Fragment>
              );
            }

            // --- Unions: one row for the pair, with the adoption years ------
            if (topic.slug === 'marriage') {
              return (
                <React.Fragment key={topic.slug}>
                  <div className="flex items-center gap-4 py-2">
                    <topic.icon
                      size={15}
                      className="shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="flex-1 text-13 font-medium">{topicLabel(t, topic)}</p>
                    {ssuValue.raw ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusGlyph kind={ssuValue.kind} />
                        <Badge variant="secondary" className="text-2xs">
                          {ssuValue.valueKey
                            ? t(`rights.value.${ssuValue.valueKey}`, ssuValue.raw)
                            : ssuValue.raw}
                        </Badge>
                      </div>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t('country.rights.noData', 'No data')}
                      </span>
                    )}
                  </div>
                  {ssu.marriage_since && (
                    <p className="pl-8 text-xs text-muted-foreground">
                      {t('country.rights.marriageSince', 'Marriage since')} {ssu.marriage_since}
                      {ssu.civil_union_since
                        ? ` · ${t('country.rights.civilUnionSince', 'civil union since')} ${ssu.civil_union_since}`
                        : ''}
                    </p>
                  )}
                </React.Fragment>
              );
            }
            // Rendered as part of the marriage row above.
            if (topic.slug === 'civil-union') return null;

            // --- Gender recognition: a chip cluster, not a single value -----
            if (topic.slug === 'gender-recognition') {
              if (!gender || Object.keys(gender).length === 0) return null;
              return (
                <div key={topic.slug} className="flex items-start gap-4 py-2">
                  <Fingerprint
                    size={15}
                    className="mt-0.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="flex-1">
                    <p className="text-13 font-medium">{topicLabel(t, topic)}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {gender.gender_marker ? (
                        <Badge variant="secondary" className="text-2xs">
                          {t('country.rights.marker', 'Marker')}:{' '}
                          {(() => {
                            const v = readRightValue(String(gender.gender_marker));
                            return v.valueKey
                              ? t(`rights.value.${v.valueKey}`, v.raw ?? '')
                              : String(gender.gender_marker);
                          })()}
                        </Badge>
                      ) : null}
                      {gender.self_id === 'Yes' && (
                        <Badge variant="secondary" className="gap-1 text-2xs">
                          <Check size={11} aria-hidden="true" />
                          {t('country.rights.selfId', 'Self-ID')}
                        </Badge>
                      )}
                      {gender.requires_surgery === 'Yes' && (
                        <Badge variant="destructive" className="text-2xs">
                          {t('country.rights.requiresSurgery', 'Requires surgery')}
                        </Badge>
                      )}
                      {gender.requires_diagnosis === 'Yes' && (
                        <Badge variant="outline" className="text-2xs">
                          {t('country.rights.requiresDiagnosis', 'Requires diagnosis')}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            // --- The SO/GI/GE/SC matrix rows -------------------------------
            if (topic.kind === 'protection-matrix') {
              const data = country[topic.column] as Record<string, unknown> | null;
              const since = (data?.so_since || data?.gi_since) as string | undefined;
              return (
                <div key={topic.slug} className="flex items-center gap-4 py-2">
                  <topic.icon
                    size={15}
                    className="shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="min-w-0 flex-1 text-13 font-medium leading-snug">
                    {topicLabel(t, topic)}
                  </p>
                  <ProtectionCells data={data} />
                  {since && (
                    <span className="shrink-0 text-xs2 text-muted-foreground">{since}</span>
                  )}
                </div>
              );
            }

            // --- Everything else is a plain status row ---------------------
            if (CUSTOM_SLUGS.has(topic.slug)) return null;
            return (
              <RightRow
                key={topic.slug}
                label={topicLabel(t, topic)}
                icon={topic.icon}
                value={topicScalarValue(country, topic) as string | null | undefined}
                severeNegative={topic.severeNegative}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card className={className} style={style}>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>
            <Shield size={20} aria-hidden="true" />
            {t('country.rights.title', 'LGBTI rights overview')}
          </CardTitle>
        </div>
        <SourceLine updatedAt={country.lgbti_data_last_updated} showLink={false} />
      </CardHeader>
      <CardContent>
        {/*
          Leads the card. It is also the only verdict here now: the composite
          equality score used to sit in the header, and one number could not
          state three very different situations — 82 countries have LGB and
          trans verdicts that disagree.
        */}
        <LensVerdictSummary country={country} className="mb-2" />

        {RIGHT_SECTION_ORDER.map(renderSection)}

        <div className="pt-2">
          <SourceLine className="text-xs2" />
        </div>
      </CardContent>
    </Card>
  );
}
