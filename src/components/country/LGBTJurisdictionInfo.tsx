import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ExternalLink, Shield, Heart, Scale, AlertTriangle, CheckCircle,
  XCircle, Clock, Ban, Users, Gavel, BookOpen, Home, Briefcase,
  Stethoscope, ShoppingBag, GraduationCap, Fingerprint
} from "lucide-react";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import EqualityScoreBadge from './EqualityScoreBadge';
import {
  parseSsuDetails, getProtectionStatus, hasDeathPenalty
} from '@/utils/equalityScore';

interface LGBTJurisdictionInfoProps {
  country: Record<string, unknown>;
  className?: string;
  // Legacy props (no longer used but kept for backward compat)
  countryName?: string;
  countryCode?: string;
  style?: React.CSSProperties;
}

/** Status icon based on value */
function StatusIcon({ value, size = 16 }: { value: string | boolean | null | undefined; size?: number }) {
  if (value === true || value === 'Yes' || value === 'Legal' || value === 'Protected' || value === 'Banned') {
    return <CheckCircle style={{ height: size, width: size, color: '#22c55e', flexShrink: 0 }} />;
  }
  if (value === false || value === 'No' || value === 'Criminalised' || value === 'Prohibited' || value === 'Not banned') {
    return <XCircle style={{ height: size, width: size, color: '#ef4444', flexShrink: 0 }} />;
  }
  if (typeof value === 'string' && (value.includes('Partial') || value.includes('Limited') || value.includes('Varies') || value.includes('Civil Union'))) {
    return <AlertTriangle style={{ height: size, width: size, color: '#eab308', flexShrink: 0 }} />;
  }
  return <Clock style={{ height: size, width: size, color: '#9ca3af', flexShrink: 0 }} />;
}

/** Badge style based on value */
function statusBadgeStyle(value: string | null | undefined): React.CSSProperties {
  const v = (value || '').toLowerCase();
  if (v.includes('legal') || v.includes('yes') || v.includes('protected') || v.includes('banned') || v.includes('marriage')) {
    return { backgroundColor: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' };
  }
  if (v.includes('criminalised') || v.includes('prohibited') || v.includes('not banned') || v === 'no') {
    return { backgroundColor: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' };
  }
  if (v.includes('partial') || v.includes('limited') || v.includes('varies') || v.includes('civil union')) {
    return { backgroundColor: '#fef9c3', color: '#854d0e', borderColor: '#fde68a' };
  }
  return { backgroundColor: '#f3f4f6', color: '#374151', borderColor: '#e5e7eb' };
}

/** Protection grid row: shows SO/GI/GE/SC */
function ProtectionRow({ label, icon: Icon, data }: {
  label: string;
  icon: React.ElementType;
  data: Record<string, unknown> | null | undefined;
}) {
  const status = getProtectionStatus(data);
  const since = data?.so_since || data?.gi_since;

  // Determine overall status
  const yesCount = [status.so, status.gi, status.ge, status.sc].filter(s => s === 'Yes').length;
  const _overallValue = yesCount >= 3 ? 'Yes' : yesCount >= 1 ? 'Partial' : (status.so === 'No data' ? null : 'No');

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
      <Icon style={{ height: 16, width: 16, color: '#6b7280', flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, lineHeight: 1.3 }}>{label}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
        {['SO', 'GI', 'GE', 'SC'].map((dim) => {
          const val = status[dim.toLowerCase() as keyof typeof status];
          const isYes = val === 'Yes';
          const isNo = val === 'No';
          return (
            <Box
              key={dim}
              title={`${dim}: ${val}`}
              sx={{
                width: 24,
                height: 20,
                borderRadius: 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.625rem',
                fontWeight: 600,
                bgcolor: isYes ? '#dcfce7' : isNo ? '#fee2e2' : '#f3f4f6',
                color: isYes ? '#166534' : isNo ? '#991b1b' : '#9ca3af',
                borderColor: isYes ? '#bbf7d0' : isNo ? '#fecaca' : '#e5e7eb',
              }}
            >
              {dim}
            </Box>
          );
        })}
      </Box>
      {since && (
        <Typography sx={{ fontSize: '0.6875rem', color: '#9ca3af', flexShrink: 0 }}>
          {since}
        </Typography>
      )}
    </Box>
  );
}

/** Simple status row for TEXT columns */
function SimpleRow({ label, icon: Icon, value, _detail }: {
  label: string;
  icon: React.ElementType;
  value: string | null | undefined;
  detail?: string | null;
}) {
  const displayValue = value && value !== 'No data' ? value : null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
      <Icon style={{ height: 16, width: 16, color: '#6b7280', flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, lineHeight: 1.3 }}>{label}</Typography>
      </Box>
      {displayValue ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
          <StatusIcon value={displayValue} size={14} />
          <Badge variant="outline" style={{ ...statusBadgeStyle(displayValue), fontSize: '0.6875rem', padding: '1px 6px' }}>
            {displayValue}
          </Badge>
        </Box>
      ) : (
        <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af' }}>No data</Typography>
      )}
    </Box>
  );
}

export default function LGBTJurisdictionInfo({ country, className = '', _countryName, _countryCode, style }: LGBTJurisdictionInfoProps) {
  // If no country object passed, show nothing (legacy usage without data)
  if (!country) return null;

  const crim = country.lgbti_criminalization as Record<string, unknown> | null;
  const foe = country.lgbti_expression_restrictions as Record<string, unknown> | null;
  const foa = country.lgbti_association_restrictions as Record<string, unknown> | null;
  const ssuDetails = parseSsuDetails(country.lgbti_same_sex_unions);
  const lastUpdated = country.lgbti_data_last_updated
    ? new Date(country.lgbti_data_last_updated).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  const crimLegal = crim?.legal;
  const crimStatus = crimLegal === true ? 'Legal' : crimLegal === false ? 'Criminalised' : 'Unknown';

  return (
    <Card className={className} style={style}>
      <CardHeader sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Shield style={{ height: 20, width: 20, color: 'hsl(var(--primary))' }} />
            LGBTI Rights Overview
          </CardTitle>
          <EqualityScoreBadge score={country.equality_score} size="sm" />
        </Box>
        {lastUpdated && (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            Source: ILGA World Database &middot; Updated {lastUpdated}
          </Typography>
        )}
      </CardHeader>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0 }}>
        {/* Section 1: Criminalisation & Freedoms */}
        <Box>
          <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', mb: 1 }}>
            Criminalisation & Freedoms
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {/* Criminalisation */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
              <Scale style={{ height: 16, width: 16, color: '#6b7280', flexShrink: 0 }} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500 }}>Same-Sex Activity</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                <StatusIcon value={crimLegal} />
                <Badge variant="outline" style={{ ...statusBadgeStyle(crimStatus), fontSize: '0.6875rem', padding: '1px 6px' }}>
                  {crimStatus}
                </Badge>
              </Box>
            </Box>
            {crimLegal === false && crim?.penalty && (
              <Typography sx={{ fontSize: '0.75rem', color: '#dc2626', pl: 4, fontWeight: 500 }}>
                Penalty: {crim.penalty}{crim.max_prison ? ` (${crim.max_prison})` : ''}
                {hasDeathPenalty(crim) ? ' - Death penalty possible' : ''}
              </Typography>
            )}
            {crimLegal === true && crim?.decrim_year_1 && (
              <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', pl: 4 }}>
                Decriminalized: {crim.decrim_year_1}{crim.decrim_year_2 ? ` / ${crim.decrim_year_2}` : ''}
              </Typography>
            )}

            {/* Expression */}
            <SimpleRow
              label="Freedom of Expression"
              icon={BookOpen}
              value={foe?.summary}
            />

            {/* Association */}
            <SimpleRow
              label="Freedom of Association"
              icon={Users}
              value={foa?.status}
            />
          </Box>
        </Box>

        <Separator />

        {/* Section 2: Protection Against Discrimination */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}>
              Anti-Discrimination Protection
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {['SO', 'GI', 'GE', 'SC'].map(dim => (
                <Typography key={dim} sx={{ fontSize: '0.5625rem', fontWeight: 600, color: '#9ca3af', width: 24, textAlign: 'center' }}>
                  {dim}
                </Typography>
              ))}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <ProtectionRow label="Constitutional" icon={Shield} data={country.lgbti_constitutional_protection} />
            <ProtectionRow label="Employment" icon={Briefcase} data={country.lgbti_employment_protection} />
            <ProtectionRow label="Housing" icon={Home} data={country.lgbti_housing_protection} />
            <ProtectionRow label="Education" icon={GraduationCap} data={country.lgbti_education_protection} />
            <ProtectionRow label="Health" icon={Stethoscope} data={country.lgbti_health_protection} />
            <ProtectionRow label="Goods & Services" icon={ShoppingBag} data={country.lgbti_goods_services_protection} />
            <ProtectionRow label="Bullying" icon={AlertTriangle} data={country.lgbti_bullying_protection} />
          </Box>
        </Box>

        <Separator />

        {/* Section 3: Criminal Justice */}
        <Box>
          <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', mb: 1 }}>
            Criminal Justice
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <ProtectionRow label="Hate Crime Laws" icon={Gavel} data={country.lgbti_hate_crime_law} />
            <ProtectionRow label="Incitement Prohibition" icon={Ban} data={country.lgbti_incitement_prohibition} />
          </Box>
        </Box>

        <Separator />

        {/* Section 4: Family & Relationships */}
        <Box>
          <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', mb: 1 }}>
            Family & Relationships
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {/* Same-sex unions */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
              <Heart style={{ height: 16, width: 16, color: '#6b7280', flexShrink: 0 }} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500 }}>Same-Sex Unions</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                <StatusIcon value={ssuDetails.summary} />
                <Badge variant="outline" style={{ ...statusBadgeStyle(ssuDetails.summary), fontSize: '0.6875rem', padding: '1px 6px' }}>
                  {ssuDetails.summary}
                </Badge>
              </Box>
            </Box>
            {ssuDetails.marriage_since && (
              <Typography sx={{ fontSize: '0.75rem', color: '#9ca3af', pl: 4 }}>
                Marriage since {ssuDetails.marriage_since}
                {ssuDetails.civil_union_since ? ` | Civil union since ${ssuDetails.civil_union_since}` : ''}
              </Typography>
            )}

            {/* Adoption */}
            <SimpleRow
              label="Adoption Rights"
              icon={Users}
              value={country.lgbti_adoption_rights}
            />
          </Box>
        </Box>

        <Separator />

        {/* Section 5: Identity & Health */}
        <Box>
          <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', mb: 1 }}>
            Identity & Health
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {/* Gender Recognition */}
            {country.lgbti_gender_recognition && Object.keys(country.lgbti_gender_recognition).length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, py: 1 }}>
                <Fingerprint style={{ height: 16, width: 16, color: '#6b7280', flexShrink: 0, marginTop: 2 }} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500 }}>Gender Recognition</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                    {country.lgbti_gender_recognition.gender_marker && (
                      <Badge variant="outline" style={{ ...statusBadgeStyle(country.lgbti_gender_recognition.gender_marker), fontSize: '0.625rem', padding: '0px 4px' }}>
                        Marker: {country.lgbti_gender_recognition.gender_marker}
                      </Badge>
                    )}
                    {country.lgbti_gender_recognition.self_id === 'Yes' && (
                      <Badge variant="outline" style={{ backgroundColor: '#dcfce7', color: '#166534', borderColor: '#bbf7d0', fontSize: '0.625rem', padding: '0px 4px' }}>
                        Self-ID
                      </Badge>
                    )}
                    {country.lgbti_gender_recognition.requires_surgery === 'Yes' && (
                      <Badge variant="outline" style={{ backgroundColor: '#fee2e2', color: '#991b1b', borderColor: '#fecaca', fontSize: '0.625rem', padding: '0px 4px' }}>
                        Requires Surgery
                      </Badge>
                    )}
                    {country.lgbti_gender_recognition.requires_diagnosis === 'Yes' && (
                      <Badge variant="outline" style={{ backgroundColor: '#fef9c3', color: '#854d0e', borderColor: '#fde68a', fontSize: '0.625rem', padding: '0px 4px' }}>
                        Requires Diagnosis
                      </Badge>
                    )}
                  </Box>
                </Box>
              </Box>
            )}

            {/* Conversion Therapy */}
            <SimpleRow
              label="Conversion Therapy"
              icon={Ban}
              value={country.lgbti_conversion_therapy_regulation}
            />

            {/* Intersex Protection */}
            <SimpleRow
              label="Intersex Bodily Integrity"
              icon={Shield}
              value={country.lgbti_intersex_protection}
            />
          </Box>
        </Box>

        {/* Source */}
        <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
          <Box
            component="a"
            href="https://database.ilga.org/"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              fontSize: '0.6875rem',
              color: 'primary.main',
              '&:hover': { textDecoration: 'underline' },
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <ExternalLink style={{ height: 10, width: 10 }} />
            ILGA World Database
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
