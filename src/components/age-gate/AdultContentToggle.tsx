import { useTranslation } from 'react-i18next';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { useAgeAffirmation } from '@/hooks/useAgeAffirmation';

/**
 * Site-wide 18+ switch. Turning it on is the same affirmation every adult
 * gate reads (Tags, Marketplace, Intimate), so no page asks again; turning it
 * off revokes it everywhere.
 */
export function AdultContentToggle() {
  const { t } = useTranslation();
  const { affirmed, checking, affirm, revoke } = useAgeAffirmation();
  const label = affirmed
    ? t('footer.adult.on', 'Showing 18+ content — click to hide')
    : t('footer.adult.off', 'I am 18 or older — show 18+ content site-wide');
  return (
    <button
      type="button"
      role="switch"
      aria-checked={affirmed}
      aria-label={label}
      title={label}
      disabled={checking}
      onClick={() => (affirmed ? revoke() : void affirm())}
      className="inline-flex items-center gap-1.5 rounded-element text-13"
    >
      <TransitIcon name={affirmed ? 'eye' : 'eye-off'} size={20} aria-hidden />
      <span>18+</span>
    </button>
  );
}
