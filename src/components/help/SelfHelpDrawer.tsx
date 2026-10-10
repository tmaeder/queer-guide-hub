/**
 * SelfHelpDrawer — "While you wait" coping techniques.
 * Opens from a button; uses shadcn Sheet. No external dependencies.
 */

import { useTranslation } from 'react-i18next';
import { Wind, Hand, FileText, ExternalLink, Phone } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { HideScreen } from '@/components/safety/HideScreen';
import { QuickExit } from '@/components/safety/QuickExit';
import { emergencyContactsForCountry } from './helpData';

export function SelfHelpDrawer({ country }: { country: string }) {
  const { t } = useTranslation();
  const emergency = emergencyContactsForCountry(country)[0];
  return (
    <Sheet>
      <SheetTrigger asChild>
        {/* This is an equal route beside calling and writing, not a quiet text link. */}
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-element border border-input px-4 py-2 text-13 font-bold text-foreground transition-colors hover:bg-foreground hover:text-background active:opacity-80"
        >
          <Wind size={14} aria-hidden />
          {t('help.self_help_trigger', 'Not ready to talk?')}
        </button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-md overflow-y-auto sm:max-w-md">
        <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 border-b border-border-hairline bg-background px-6 py-4">
          <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {t('help.emergency_short', 'Emergency')}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={`tel:${emergency.number}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-element bg-destructive px-4 text-13 font-bold text-destructive-foreground no-underline"
            >
              <Phone size={16} aria-hidden />
              <span className="tabular-nums">{emergency.number}</span>
              <span className="font-normal">({emergency.region})</span>
            </a>
            <HideScreen />
            <QuickExit />
          </div>
        </div>
        <SheetHeader>
          <SheetTitle>{t('help.self_help_title', 'Steady yourself')}</SheetTitle>
          <SheetDescription>
            {t(
              'help.self_help_desc',
              'Short techniques you can use while you wait, or instead of a call if you’re not ready.',
            )}
          </SheetDescription>
        </SheetHeader>

        <section className="mt-6">
          <h3 className="flex items-center gap-2 text-title font-bold leading-tight">
            <Wind size={16} aria-hidden />
            {t('help.breathing_title', '4-7-8 breathing')}
          </h3>
          <ol className="mt-2 list-decimal space-y-1 pl-6 text-13 leading-relaxed text-muted-foreground">
            <li>{t('help.breathing_1', 'Breathe in through your nose for 4 seconds.')}</li>
            <li>{t('help.breathing_2', 'Hold your breath for 7 seconds.')}</li>
            <li>{t('help.breathing_3', 'Breathe out through your mouth for 8 seconds.')}</li>
            <li>{t('help.breathing_4', 'Repeat 4 times.')}</li>
          </ol>
        </section>

        <section className="mt-6">
          <h3 className="flex items-center gap-2 text-title font-bold leading-tight">
            <Hand size={16} aria-hidden />
            {t('help.grounding_title', '5-4-3-2-1 grounding')}
          </h3>
          <p className="mt-2 text-13 leading-relaxed text-muted-foreground">
            {t('help.grounding_intro', 'Name, out loud or in your head:')}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-13 leading-relaxed text-muted-foreground">
            <li>{t('help.grounding_5', '5 things you can see')}</li>
            <li>{t('help.grounding_4', '4 things you can touch')}</li>
            <li>{t('help.grounding_3', '3 things you can hear')}</li>
            <li>{t('help.grounding_2', '2 things you can smell')}</li>
            <li>{t('help.grounding_1', '1 thing you can taste')}</li>
          </ul>
        </section>

        <section className="mt-6">
          <h3 className="flex items-center gap-2 text-title font-bold leading-tight">
            <FileText size={16} aria-hidden />
            {t('help.safety_plan_title', 'Safety plan')}
          </h3>
          <p className="mt-2 text-13 leading-relaxed text-muted-foreground">
            {t(
              'help.safety_plan_desc',
              'A short written plan you can pull up when things get bad — your warning signs, coping steps, people to call, and reasons to live.',
            )}
          </p>
          <Button asChild variant="link" className="mt-1 h-auto p-0 text-13">
            <a href="https://suicidesafetyplan.com/" target="_blank" rel="noopener noreferrer">
              {t('help.safety_plan_link', 'Open template (Stanley-Brown)')}
              <ExternalLink size={12} className="ml-1" />
            </a>
          </Button>
        </section>
      </SheetContent>
    </Sheet>
  );
}
