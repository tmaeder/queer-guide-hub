import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ExternalLink,
  Shield,
  Heart,
  Scale,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Ban,
  Users,
  Gavel,
  BookOpen,
  Home,
  Briefcase,
  Stethoscope,
  ShoppingBag,
  GraduationCap,
  Fingerprint,
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

function StatusIcon({
  value,
  size = 16,
}: {
  value: string | boolean | null | undefined;
  size?: number;
}) {
  if (
    value === true ||
    value === 'Yes' ||
    value === 'Legal' ||
    value === 'Protected' ||
    value === 'Banned'
  ) {
    return <CheckCircle style={{ height: size, width: size, color: '#22c55e', flexShrink: 0 }} />;
  }
  if (
    value === false ||
    value === 'No' ||
    value === 'Criminalised' ||
    value === 'Prohibited' ||
    value === 'Not banned'
  ) {
    return <XCircle style={{ height: size, width: size, color: '#ef4444', flexShrink: 0 }} />;
  }
  if (
    typeof value === 'string' &&
    (value.includes('Partial') ||
      value.includes('Limited') ||
      value.includes('Varies') ||
      value.includes('Civil Union'))
  ) {
    return <AlertTriangle style={{ height: size, width: size, color: '#eab308', flexShrink: 0 }} />;
  }
  return <Clock style={{ height: size, width: size, color: '#9ca3af', flexShrink: 0 }} />;
}

function statusBadgeStyle(value: string | null | undefined): React.CSSProperties {
  const v = (value || '').toLowerCase();
  if (
    v.includes('legal') ||
    v.includes('yes') ||
    v.includes('protected') ||
    v.includes('banned') ||
    v.includes('marriage')
  ) {
    return { backgroundColor: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' };
  }
  if (
    v.includes('criminalised') ||
    v.includes('prohibited') ||
    v.includes('not banned') ||
    v === 'no'
  ) {
    return { backgroundColor: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' };
  }
  if (
    v.includes('partial') ||
    v.includes('limited') ||
    v.includes('varies') ||
    v.includes('civil union')
  ) {
    return { backgroundColor: '#fef9c3', color: '#854d0e', borderColor: '#fde68a' };
  }
  return { backgroundColor: '#f3f4f6', color: '#374151', borderColor: '#e5e7eb' };
}

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
  const since = data?.so_since || data?.gi_since;

  const _yesCount = [status.so, status.gi, status.ge, status.sc].filter((s) => s === 'Yes').length;
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon style={{ height: 16, width: 16, color: '#6b7280', flexShrink: 0 }} />
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-medium leading-snug">{label}</p>
      </div>
      <div className="flex flex-shrink-0 gap-1">
        {['SO', 'GI', 'GE', 'SC'].map((dim) => {
          const val = status[dim.toLowerCase() as keyof typeof status];
          const isYes = val === 'Yes';
          const isNo = val === 'No';
          return (
            <div
              key={dim}
              title={`${dim}: ${val}`}
              className="flex h-5 w-6 items-center justify-center rounded-sm text-[0.625rem] font-semibold"
              style={{
                backgroundColor: isYes ? '#dcfce7' : isNo ? '#fee2e2' : '#f3f4f6',
                color: isYes ? '#166534' : isNo ? '#991b1b' : '#9ca3af',
                borderColor: isYes ? '#bbf7d0' : isNo ? '#fecaca' : '#e5e7eb',
              }}
            >
              {dim}
            </div>
          );
        })}
      </div>
      {since && (
        <span className="flex-shrink-0 text-[0.6875rem] text-[#9ca3af]">{since}</span>
      )}
    </div>
  );
}

function SimpleRow({
  label,
  icon: Icon,
  value,
}: {
  label: string;
  icon: React.ElementType;
  value: string | null | undefined;
  detail?: string | null;
}) {
  const displayValue = value && value !== 'No data' ? value : null;

  return (
    <div className="flex items-center gap-3 py-2">
      <Icon style={{ height: 16, width: 16, color: '#6b7280', flexShrink: 0 }} />
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-medium leading-snug">{label}</p>
      </div>
      {displayValue ? (
        <div className="flex flex-shrink-0 items-center gap-2">
          <StatusIcon value={displayValue} size={14} />
          <Badge
            variant="outline"
            style={{ ...statusBadgeStyle(displayValue), fontSize: '0.6875rem', padding: '1px 6px' }}
          >
            {displayValue}
          </Badge>
        </div>
      ) : (
        <span className="text-xs text-[#9ca3af]">No data</span>
      )}
    </div>
  );
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p
    className="mb-2 text-[0.6875rem] font-bold uppercase text-[#6b7280]"
    style={{ letterSpacing: '0.05em' }}
  >
    {children}
  </p>
);

export default function LGBTJurisdictionInfo({
  country,
  className = '',
  style,
}: LGBTJurisdictionInfoProps) {
  if (!country) return null;

  const crim = country.lgbti_criminalization as Record<string, unknown> | null;
  const foe = country.lgbti_expression_restrictions as Record<string, unknown> | null;
  const foa = country.lgbti_association_restrictions as Record<string, unknown> | null;
  const ssuDetails = parseSsuDetails(country.lgbti_same_sex_unions);
  const lastUpdated = country.lgbti_data_last_updated
    ? new Date(country.lgbti_data_last_updated).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  const crimLegal = crim?.legal;
  const crimStatus =
    crimLegal === true ? 'Legal' : crimLegal === false ? 'Criminalised' : 'Unknown';

  return (
    <Card className={className} style={style}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            <Shield style={{ height: 20, width: 20, color: 'hsl(var(--primary))' }} />
            LGBTI Rights Overview
          </CardTitle>
          <EqualityScoreBadge score={country.equality_score} size="sm" />
        </div>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground">
            Source: ILGA World Database &middot; Updated {lastUpdated}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {/* Section 1 */}
        <div>
          <SectionLabel>Criminalisation & Freedoms</SectionLabel>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3 py-2">
              <Scale style={{ height: 16, width: 16, color: '#6b7280', flexShrink: 0 }} />
              <div className="flex-1">
                <p className="text-[0.8125rem] font-medium">Same-Sex Activity</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <StatusIcon value={crimLegal} />
                <Badge
                  variant="outline"
                  style={{
                    ...statusBadgeStyle(crimStatus),
                    fontSize: '0.6875rem',
                    padding: '1px 6px',
                  }}
                >
                  {crimStatus}
                </Badge>
              </div>
            </div>
            {crimLegal === false && crim?.penalty && (
              <p className="pl-8 text-xs font-medium text-[#dc2626]">
                Penalty: {crim.penalty}
                {crim.max_prison ? ` (${crim.max_prison})` : ''}
                {hasDeathPenalty(crim) ? ' - Death penalty possible' : ''}
              </p>
            )}
            {crimLegal === true && crim?.decrim_year_1 && (
              <p className="pl-8 text-xs text-[#9ca3af]">
                Decriminalized: {crim.decrim_year_1}
                {crim.decrim_year_2 ? ` / ${crim.decrim_year_2}` : ''}
              </p>
            )}

            <SimpleRow label="Freedom of Expression" icon={BookOpen} value={foe?.summary} />
            <SimpleRow label="Freedom of Association" icon={Users} value={foa?.status} />
          </div>
        </div>

        <Separator />

        {/* Section 2 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p
              className="text-[0.6875rem] font-bold uppercase text-[#6b7280]"
              style={{ letterSpacing: '0.05em' }}
            >
              Anti-Discrimination Protection
            </p>
            <div className="flex gap-1">
              {['SO', 'GI', 'GE', 'SC'].map((dim) => (
                <span
                  key={dim}
                  className="w-6 text-center text-[0.5625rem] font-semibold text-[#9ca3af]"
                >
                  {dim}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <ProtectionRow label="Constitutional" icon={Shield} data={country.lgbti_constitutional_protection} />
            <ProtectionRow label="Employment" icon={Briefcase} data={country.lgbti_employment_protection} />
            <ProtectionRow label="Housing" icon={Home} data={country.lgbti_housing_protection} />
            <ProtectionRow label="Education" icon={GraduationCap} data={country.lgbti_education_protection} />
            <ProtectionRow label="Health" icon={Stethoscope} data={country.lgbti_health_protection} />
            <ProtectionRow label="Goods & Services" icon={ShoppingBag} data={country.lgbti_goods_services_protection} />
            <ProtectionRow label="Bullying" icon={AlertTriangle} data={country.lgbti_bullying_protection} />
          </div>
        </div>

        <Separator />

        {/* Section 3 */}
        <div>
          <SectionLabel>Criminal Justice</SectionLabel>
          <div className="flex flex-col">
            <ProtectionRow label="Hate Crime Laws" icon={Gavel} data={country.lgbti_hate_crime_law} />
            <ProtectionRow label="Incitement Prohibition" icon={Ban} data={country.lgbti_incitement_prohibition} />
          </div>
        </div>

        <Separator />

        {/* Section 4 */}
        <div>
          <SectionLabel>Family & Relationships</SectionLabel>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3 py-2">
              <Heart style={{ height: 16, width: 16, color: '#6b7280', flexShrink: 0 }} />
              <div className="flex-1">
                <p className="text-[0.8125rem] font-medium">Same-Sex Unions</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <StatusIcon value={ssuDetails.summary} />
                <Badge
                  variant="outline"
                  style={{
                    ...statusBadgeStyle(ssuDetails.summary),
                    fontSize: '0.6875rem',
                    padding: '1px 6px',
                  }}
                >
                  {ssuDetails.summary}
                </Badge>
              </div>
            </div>
            {ssuDetails.marriage_since && (
              <p className="pl-8 text-xs text-[#9ca3af]">
                Marriage since {ssuDetails.marriage_since}
                {ssuDetails.civil_union_since
                  ? ` | Civil union since ${ssuDetails.civil_union_since}`
                  : ''}
              </p>
            )}
            <SimpleRow label="Adoption Rights" icon={Users} value={country.lgbti_adoption_rights} />
          </div>
        </div>

        <Separator />

        {/* Section 5 */}
        <div>
          <SectionLabel>Identity & Health</SectionLabel>
          <div className="flex flex-col gap-1">
            {country.lgbti_gender_recognition &&
              Object.keys(country.lgbti_gender_recognition).length > 0 && (
                <div className="flex items-start gap-3 py-2">
                  <Fingerprint
                    style={{ height: 16, width: 16, color: '#6b7280', flexShrink: 0, marginTop: 2 }}
                  />
                  <div className="flex-1">
                    <p className="text-[0.8125rem] font-medium">Gender Recognition</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {country.lgbti_gender_recognition.gender_marker && (
                        <Badge
                          variant="outline"
                          style={{
                            ...statusBadgeStyle(country.lgbti_gender_recognition.gender_marker),
                            fontSize: '0.625rem',
                            padding: '0px 4px',
                          }}
                        >
                          Marker: {country.lgbti_gender_recognition.gender_marker}
                        </Badge>
                      )}
                      {country.lgbti_gender_recognition.self_id === 'Yes' && (
                        <Badge
                          variant="outline"
                          style={{
                            backgroundColor: '#dcfce7',
                            color: '#166534',
                            borderColor: '#bbf7d0',
                            fontSize: '0.625rem',
                            padding: '0px 4px',
                          }}
                        >
                          Self-ID
                        </Badge>
                      )}
                      {country.lgbti_gender_recognition.requires_surgery === 'Yes' && (
                        <Badge
                          variant="outline"
                          style={{
                            backgroundColor: '#fee2e2',
                            color: '#991b1b',
                            borderColor: '#fecaca',
                            fontSize: '0.625rem',
                            padding: '0px 4px',
                          }}
                        >
                          Requires Surgery
                        </Badge>
                      )}
                      {country.lgbti_gender_recognition.requires_diagnosis === 'Yes' && (
                        <Badge
                          variant="outline"
                          style={{
                            backgroundColor: '#fef9c3',
                            color: '#854d0e',
                            borderColor: '#fde68a',
                            fontSize: '0.625rem',
                            padding: '0px 4px',
                          }}
                        >
                          Requires Diagnosis
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}

            <SimpleRow
              label="Conversion Therapy"
              icon={Ban}
              value={country.lgbti_conversion_therapy_regulation}
            />
            <SimpleRow
              label="Intersex Bodily Integrity"
              icon={Shield}
              value={country.lgbti_intersex_protection}
            />
          </div>
        </div>

        {/* Source */}
        <div className="border-t pt-2">
          <a
            href="https://database.ilga.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[0.6875rem] text-primary hover:underline"
          >
            <ExternalLink style={{ height: 10, width: 10 }} />
            ILGA World Database
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
