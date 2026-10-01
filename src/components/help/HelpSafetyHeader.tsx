import { Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Wordmark } from '@/components/brand/Wordmark';
import { HideScreen } from '@/components/safety/HideScreen';
import { QuickExit } from '@/components/safety/QuickExit';
import { emergencyContactsForCountry } from './helpData';

/** Stable crisis chrome for /help.
 *
 * It replaces the public product header rather than floating on top of it, so
 * the safety actions stay visible without covering the page. The emergency
 * number is synchronous and country-aware; no CMS response is required.
 */
export function HelpSafetyHeader({ country }: { country: string }) {
  const { t } = useTranslation();
  const emergency = emergencyContactsForCountry(country)[0];

  return (
    <header
      data-testid="help-safety-header"
      className="sticky top-0 z-50 border-b border-border-hairline bg-background"
    >
      <div className="mx-auto flex w-full max-w-page flex-wrap items-center gap-4 px-4 py-4 sm:px-6 md:px-8">
        <LocalizedLink
          to="/"
          aria-label="Queer Guide home"
          className="mr-auto flex min-h-11 items-center no-underline"
        >
          <Wordmark className="text-title text-foreground" />
        </LocalizedLink>

        <a
          href={`tel:${emergency.number}`}
          className="inline-flex min-h-11 items-center gap-2 bg-destructive px-4 text-13 font-bold text-destructive-foreground no-underline"
          aria-label={`${t('help.emergency_call', 'Call now:')} ${emergency.number}`}
        >
          <Phone size={16} aria-hidden />
          <span>{t('help.emergency_short', 'Emergency')}</span>
          <span className="tabular-nums">{emergency.number}</span>
          <span className="font-normal">({emergency.region})</span>
        </a>

        <div className="flex items-center gap-2">
          <HideScreen />
          <QuickExit />
        </div>
      </div>
    </header>
  );
}
