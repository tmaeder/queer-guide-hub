import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ExternalLink,
  Shield,
  Heart,
  Scale,
  Check,
  Minus,
  X,
  Skull,
  Users,
  Gavel,
  BookOpen,
  Home,
  Briefcase,
  Stethoscope,
  ShoppingBag,
  GraduationCap,
  Fingerprint,
  Ban,
} from 'lucide-react';
import EqualityScoreBadge from './EqualityScoreBadge';
import { parseSsuDetails, getProtectionStatus, hasDeathPenalty } from '@/utils/equalityScore';

interface LGBTJurisdictionInfoProps {
  country: Record<string, unknown>;
  className?: string;
  countryName?: string;
  countryCode?: string;
  style?: React.CSSProperties;
}

type StatusKind = 'yes' | 'no' | 'severe' | 'partial' | 'none';

/**
 * Classify a legal-status value into a monochrome polarity. Severity (criminal
 * negatives) routes to the `destructive` token — the only chromatic accent the
 * design system permits. Everything else is encoded by glyph + weight, never hue.
 */
function classifyStatus(value: string | boolean | null | undefined, severeNegative = false): StatusKind {
  if (value === true) return 'yes';
  if (value === false) return severeNegative ? 'severe' : 'no';
  const v = String(value ?? '').toLowerCase().trim();
  if (!v || v === 'no data' || v === 'unknown') return 'none';
  // Negations must be caught before positive substrings: "not banned"
  // (e.g. conversion therapy still legal) contains "banned" but is negative.
  if (v.includes('criminal') || v.includes('prohibited')) {
    return 'severe';
  }
  if (v.includes('not banned') || v.includes('not legal') || v.includes('no protection')) {
    return severeNegative ? 'severe' : 'no';
  }
  if (
    v.includes('legal') ||
    v === 'yes' ||
    v.includes('protected') ||
    v.includes('banned') ||
    v.includes('marriage') ||
    v.includes('full')
  ) {
    return 'yes';
  }
  if (v === 'no' || v.startsWith('no ')) return severeNegative ? 'severe' : 'no';
  if (v.includes('partial') || v.includes('limited') || v.includes('varies') || v.includes('civil union')) {
    return 'partial';
  }
  return 'partial';
}

function StatusGlyph({ kind, size = 15 }: { kind: StatusKind; size?: number }) {
  const cls = 'shrink-0';
  switch (kind) {
    case 'yes':
      return <Check size={size} className={`${cls} text-foreground`} aria-hidden="true" />;
    case 'severe':
      return <X size={size} className={`${cls} text-destructive`} aria-hidden="true" />;
    case 'no':
      return <X size={size} className={`${cls} text-muted-foreground`} aria-hidden="true" />;
    case 'partial':
      return <Minus size={size} className={`${cls} text-muted-foreground`} aria-hidden="true" />;
    default:
      return <Minus size={size} className={`${cls} text-muted-foreground/40`} aria-hidden="true" />;
  }
}

/** A single legal fact: icon + label on the left, glyph + value chip on the right. */
function StatusRow({
  label,
  icon: Icon,
  value,
  severeNegative = false,
}: {
  label: string;
  icon: React.ElementType;
  value: string | boolean | null | undefined;
  severeNegative?: boolean;
}) {
  const { t } = useTranslation();
  const display = typeof value === 'string' ? value : value === true ? 'Yes' : value === false ? 'No' : null;
  const kind = classifyStatus(value, severeNegative);
  const hasData = display && display !== 'No data';

  return (
    <div className="flex items-center gap-4 py-2">
      <Icon size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-13 font-medium leading-snug">{label}</p>
      {hasData ? (
        <div className="flex shrink-0 items-center gap-2">
          <StatusGlyph kind={kind} />
          <Badge variant={kind === 'severe' ? 'destructive' : 'secondary'} className="text-2xs">
            {display}
          </Badge>
        </div>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">
          {t('country.rights.noData', 'No data')}
        </span>
      )}
    </div>
  );
}

/**
 * Anti-discrimination row: four dimension cells (SO/GI/GE/SC). Monochrome —
 * protected = filled, unprotected = outlined, unknown = ghosted. The letter +
 * title attribute carry the meaning, not color.
 */
function ProtectionRow({
  label,
  icon: Icon,
  data,
}: {
  label: string;
  icon: React.ElementType;
  data: Record<string, unknown> | null | undefined;
}) {
  const status = getProtectionStatus(data);
  const since = (data?.so_since || data?.gi_since) as string | undefined;

  return (
    <div className="flex items-center gap-4 py-2">
      <Icon size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-13 font-medium leading-snug">{label}</p>
      <div className="flex shrink-0 gap-1">
        {(['SO', 'GI', 'GE', 'SC'] as const).map((dim) => {
          const val = status[dim.toLowerCase() as keyof typeof status];
          const isYes = val === 'Yes';
          const isNo = val === 'No';
          return (
            <span
              key={dim}
              title={`${dim}: ${val}`}
              className={
                'flex h-5 w-6 items-center justify-center rounded-badge text-2xs font-semibold ' +
                (isYes
                  ? 'bg-foreground text-background'
                  : isNo
                    ? 'border border-border text-muted-foreground'
                    : 'bg-muted text-muted-foreground/50')
              }
            >
              {dim}
            </span>
          );
        })}
      </div>
      {since && <span className="shrink-0 text-xs2 text-muted-foreground">{since}</span>}
    </div>
  );
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-xs2 font-bold uppercase tracking-[0.05em] text-muted-foreground">
    {children}
  </p>
);

export default function LGBTJurisdictionInfo({ country, className = '', style }: LGBTJurisdictionInfoProps) {
  const { t } = useTranslation();
  if (!country) return null;

  const crim = country.lgbti_criminalization as Record<string, unknown> | null;
  const foe = country.lgbti_expression_restrictions as Record<string, unknown> | null;
  const foa = country.lgbti_association_restrictions as Record<string, unknown> | null;
  const ssu = parseSsuDetails(country.lgbti_same_sex_unions as string | null);
  const gender = country.lgbti_gender_recognition as Record<string, unknown> | null;
  const lastUpdated = country.lgbti_data_last_updated
    ? new Date(country.lgbti_data_last_updated as string).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  const crimLegal = crim?.legal;
  const crimStatus = crimLegal === true ? 'Legal' : crimLegal === false ? 'Criminalised' : null;
  const deathPenalty = hasDeathPenalty(crim);

  return (
    <Card className={className} style={style}>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>
            <Shield size={20} aria-hidden="true" />
            {t('country.rights.title', 'LGBTI rights overview')}
          </CardTitle>
          <EqualityScoreBadge score={country.equality_score as number | null} size="sm" />
        </div>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground">
            {t('country.rights.source', 'ILGA World Database')} · {t('country.rights.updated', 'Updated')}{' '}
            {lastUpdated}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {/* Criminalisation & freedoms — leads with the most safety-critical fact. */}
        <div>
          <SectionLabel>{t('country.rights.section.criminalisation', 'Criminalisation & freedoms')}</SectionLabel>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-4 py-2">
              <Scale size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="flex-1 text-13 font-medium">
                {t('country.rights.sameSexActivity', 'Same-sex activity')}
              </p>
              {crimStatus ? (
                <div className="flex shrink-0 items-center gap-2">
                  {deathPenalty ? (
                    <Skull size={15} className="shrink-0 text-destructive" aria-hidden="true" />
                  ) : (
                    <StatusGlyph kind={crimLegal === false ? 'severe' : 'yes'} />
                  )}
                  <Badge
                    variant={crimLegal === false ? 'destructive' : 'secondary'}
                    className="text-2xs"
                  >
                    {crimStatus}
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
                {deathPenalty ? ` — ${t('country.rights.deathPenalty', 'death penalty possible')}` : ''}
              </p>
            )}
            {crimLegal === true && (crim?.decrim_year_1 as string) && (
              <p className="pl-8 text-xs text-muted-foreground">
                {t('country.rights.decriminalized', 'Decriminalized')}: {crim?.decrim_year_1 as string}
                {crim?.decrim_year_2 ? ` / ${crim.decrim_year_2 as string}` : ''}
              </p>
            )}
            <StatusRow
              label={t('country.rights.expression', 'Freedom of expression')}
              icon={BookOpen}
              value={foe?.summary as string}
            />
            <StatusRow
              label={t('country.rights.association', 'Freedom of association')}
              icon={Users}
              value={foa?.status as string}
            />
          </div>
        </div>

        <Separator />

        {/* Anti-discrimination protection */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs2 font-bold uppercase tracking-[0.05em] text-muted-foreground">
              {t('country.rights.section.antiDiscrimination', 'Anti-discrimination protection')}
            </p>
            <div className="flex gap-1">
              {['SO', 'GI', 'GE', 'SC'].map((dim) => (
                <span key={dim} className="w-6 text-center text-3xs font-semibold text-muted-foreground">
                  {dim}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <ProtectionRow label={t('country.rights.constitutional', 'Constitutional')} icon={Shield} data={country.lgbti_constitutional_protection as Record<string, unknown>} />
            <ProtectionRow label={t('country.rights.employment', 'Employment')} icon={Briefcase} data={country.lgbti_employment_protection as Record<string, unknown>} />
            <ProtectionRow label={t('country.rights.housing', 'Housing')} icon={Home} data={country.lgbti_housing_protection as Record<string, unknown>} />
            <ProtectionRow label={t('country.rights.education', 'Education')} icon={GraduationCap} data={country.lgbti_education_protection as Record<string, unknown>} />
            <ProtectionRow label={t('country.rights.health', 'Health')} icon={Stethoscope} data={country.lgbti_health_protection as Record<string, unknown>} />
            <ProtectionRow label={t('country.rights.goodsServices', 'Goods & services')} icon={ShoppingBag} data={country.lgbti_goods_services_protection as Record<string, unknown>} />
            <ProtectionRow label={t('country.rights.bullying', 'Bullying')} icon={Shield} data={country.lgbti_bullying_protection as Record<string, unknown>} />
          </div>
        </div>

        <Separator />

        {/* Criminal justice */}
        <div>
          <SectionLabel>{t('country.rights.section.criminalJustice', 'Criminal justice')}</SectionLabel>
          <div className="flex flex-col">
            <ProtectionRow label={t('country.rights.hateCrime', 'Hate crime laws')} icon={Gavel} data={country.lgbti_hate_crime_law as Record<string, unknown>} />
            <ProtectionRow label={t('country.rights.incitement', 'Incitement prohibition')} icon={Ban} data={country.lgbti_incitement_prohibition as Record<string, unknown>} />
          </div>
        </div>

        <Separator />

        {/* Family & relationships */}
        <div>
          <SectionLabel>{t('country.rights.section.family', 'Family & relationships')}</SectionLabel>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-4 py-2">
              <Heart size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="flex-1 text-13 font-medium">{t('country.rights.unions', 'Same-sex unions')}</p>
              {ssu.summary && ssu.summary !== 'No data' ? (
                <div className="flex shrink-0 items-center gap-2">
                  <StatusGlyph kind={classifyStatus(ssu.summary)} />
                  <Badge variant="secondary" className="text-2xs">
                    {ssu.summary}
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
            <StatusRow label={t('country.rights.adoption', 'Adoption rights')} icon={Users} value={country.lgbti_adoption_rights as string} />
          </div>
        </div>

        <Separator />

        {/* Identity & health */}
        <div>
          <SectionLabel>{t('country.rights.section.identity', 'Identity & health')}</SectionLabel>
          <div className="flex flex-col gap-1">
            {gender && Object.keys(gender).length > 0 && (
              <div className="flex items-start gap-4 py-2">
                <Fingerprint size={15} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-13 font-medium">{t('country.rights.genderRecognition', 'Gender recognition')}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {gender.gender_marker ? (
                      <Badge variant="secondary" className="text-2xs">
                        {t('country.rights.marker', 'Marker')}: {String(gender.gender_marker)}
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
            )}
            <StatusRow label={t('country.rights.conversionTherapy', 'Conversion therapy')} icon={Ban} value={country.lgbti_conversion_therapy_regulation as string} />
            <StatusRow label={t('country.rights.intersex', 'Intersex bodily integrity')} icon={Shield} value={country.lgbti_intersex_protection as string} />
          </div>
        </div>

        {/* Source */}
        <div className="border-t pt-2">
          <a
            href="https://database.ilga.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs2 text-foreground hover:underline"
          >
            <ExternalLink size={10} aria-hidden="true" />
            {t('country.rights.ilgaLink', 'ILGA World Database')}
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
