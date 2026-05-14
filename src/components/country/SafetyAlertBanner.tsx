import { AlertTriangle, Skull } from 'lucide-react';
import { isCriminalized, hasDeathPenalty } from '@/utils/equalityScore';

interface SafetyAlertBannerProps {
  criminalization: Record<string, unknown> | null | undefined;
  countryName: string;
}

export default function SafetyAlertBanner({ criminalization, countryName }: SafetyAlertBannerProps) {
  if (!isCriminalized(criminalization)) return null;

  const deathPenalty = hasDeathPenalty(criminalization);
  const penalty = (criminalization?.penalty as string) || '';
  const maxPrison = (criminalization?.max_prison as string) || '';

  return (
    <div className="mx-auto px-6 -mt-4 mb-6">
      <div
        className="flex items-start gap-4 p-4"
        style={{
          borderColor: deathPenalty ? '#fca5a5' : '#fde68a',
          backgroundColor: deathPenalty ? '#fef2f2' : '#fffbeb',
        }}
      >
        {deathPenalty ? (
          <Skull style={{ height: 24, width: 24, color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
        ) : (
          <AlertTriangle style={{ height: 24, width: 24, color: '#d97706', flexShrink: 0, marginTop: 2 }} />
        )}
        <div>
          <p
            className="font-bold mb-1"
            style={{
              fontSize: '0.9375rem',
              color: deathPenalty ? '#991b1b' : '#92400e',
            }}
          >
            {deathPenalty
              ? `Travel Warning: Same-sex activity carries the death penalty in ${countryName}`
              : `Travel Warning: Same-sex activity is criminalized in ${countryName}`}
          </p>
          <p
            style={{
              fontSize: '0.8125rem',
              color: deathPenalty ? '#b91c1c' : '#a16207',
              lineHeight: 1.5,
            }}
          >
            {deathPenalty
              ? 'The death penalty may be imposed for consensual same-sex sexual activity. LGBTQ+ travellers face extreme risk.'
              : penalty
                ? `Penalties may include ${penalty.toLowerCase()}${maxPrison ? ` (${maxPrison})` : ''}. LGBTQ+ travellers should exercise extreme caution.`
                : 'LGBTQ+ travellers should exercise extreme caution and research local laws before visiting.'}
          </p>
        </div>
      </div>
    </div>
  );
}
