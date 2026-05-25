import { useLocalSupporter } from '@/hooks/useLocalSupporter';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ArrowRight } from 'lucide-react';

/**
 * Quiet one-line caption on CityDetail when the signed-in user has any
 * Local Supporter activity in this city. Renders nothing otherwise.
 * Phase 5 §5.
 */
export function CityLocalSupporterCaption({ cityId }: { cityId: string }) {
  const { data } = useLocalSupporter(cityId);
  if (!data || data.score === 0) return null;
  return (
    <p className="text-13 text-muted-foreground mt-6">
      You support queer-owned biz here · <span className="text-foreground">{data.tier}</span>{' '}
      <span className="font-mono tabular-nums">({data.score}/100)</span> ·{' '}
      <LocalizedLink
        to="/marketplace/missions"
        className="inline-flex items-center gap-1 underline underline-offset-4"
      >
        View missions
        <ArrowRight size={12} aria-hidden />
      </LocalizedLink>
    </p>
  );
}
