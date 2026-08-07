import { AlertTriangle, Skull } from 'lucide-react';
import { isCriminalized, deathPenaltyRisk } from '@/utils/equalityScore';

interface SafetyAlertBannerProps {
  criminalization: Record<string, unknown> | null | undefined;
  countryName: string;
}

export default function SafetyAlertBanner({
  criminalization,
  countryName,
}: SafetyAlertBannerProps) {
  if (!isCriminalized(criminalization)) return null;

  // `possible` gets the same red treatment as `confirmed` — the reader is
  // making the same decision — but says so as uncertainty. Afghanistan,
  // Pakistan, Qatar, Somalia and the UAE landed on the amber "criminalized"
  // variant until 2026-08-07 because the flag they carry is
  // 'No legal certainty', which the old confirmed-only test read as "No".
  const risk = deathPenaltyRisk(criminalization);
  const deathPenalty = risk !== 'none';
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
          <Skull size={24} style={{ color: '#dc2626' }} className="shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle size={24} style={{ color: '#d97706' }} className="shrink-0 mt-0.5" />
        )}
        <div>
          <p
            className="font-bold mb-1 text-15"
            style={{ color: deathPenalty ? '#991b1b' : '#92400e' }}
          >
            {risk === 'confirmed'
              ? `Travel Warning: Same-sex activity carries the death penalty in ${countryName}`
              : risk === 'possible'
                ? `Travel Warning: Same-sex activity may carry the death penalty in ${countryName}`
                : `Travel Warning: Same-sex activity is criminalized in ${countryName}`}
          </p>
          <p
            style={{ color: deathPenalty ? '#b91c1c' : '#a16207', lineHeight: 1.5 }}
            className="text-13"
          >
            {risk === 'confirmed'
              ? 'The death penalty may be imposed for consensual same-sex sexual activity. LGBTQ+ travellers face extreme risk.'
              : risk === 'possible'
                ? 'Our source names the death penalty as a possible punishment for consensual same-sex sexual activity but records no legal certainty either way. Treat the risk as real. LGBTQ+ travellers face extreme risk.'
                : penalty
                  ? `Penalties may include ${penalty.toLowerCase()}${maxPrison ? ` (${maxPrison})` : ''}. LGBTQ+ travellers should exercise extreme caution.`
                  : 'LGBTQ+ travellers should exercise extreme caution and research local laws before visiting.'}
          </p>
        </div>
      </div>
    </div>
  );
}
