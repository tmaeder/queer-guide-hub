/**
 * SelfHelpDrawer — "While you wait" coping techniques.
 * Opens from a button; uses shadcn Sheet. No external dependencies.
 */

import { useTranslation } from 'react-i18next';
import { Wind, Hand, FileText, ExternalLink } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

export function SelfHelpDrawer() {
  const { t } = useTranslation();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Wind size={14} className="mr-2" />
          {t('help.self_help_trigger', 'While you wait')}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-md overflow-y-auto sm:max-w-md">
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
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Wind size={16} aria-hidden />
            {t('help.breathing_title', '4-7-8 breathing')}
          </h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t('help.breathing_1', 'Breathe in through your nose for 4 seconds.')}</li>
            <li>{t('help.breathing_2', 'Hold your breath for 7 seconds.')}</li>
            <li>{t('help.breathing_3', 'Breathe out through your mouth for 8 seconds.')}</li>
            <li>{t('help.breathing_4', 'Repeat 4 times.')}</li>
          </ol>
        </section>

        <section className="mt-6">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Hand size={16} aria-hidden />
            {t('help.grounding_title', '5-4-3-2-1 grounding')}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('help.grounding_intro', 'Name, out loud or in your head:')}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t('help.grounding_5', '5 things you can see')}</li>
            <li>{t('help.grounding_4', '4 things you can touch')}</li>
            <li>{t('help.grounding_3', '3 things you can hear')}</li>
            <li>{t('help.grounding_2', '2 things you can smell')}</li>
            <li>{t('help.grounding_1', '1 thing you can taste')}</li>
          </ul>
        </section>

        <section className="mt-6">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <FileText size={16} aria-hidden />
            {t('help.safety_plan_title', 'Safety plan')}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              'help.safety_plan_desc',
              'A short written plan you can pull up when things get bad — your warning signs, coping steps, people to call, and reasons to live.',
            )}
          </p>
          <Button asChild variant="link" className="mt-1 h-auto p-0 text-sm">
            <a
              href="https://suicidesafetyplan.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('help.safety_plan_link', 'Open template (Stanley-Brown)')}
              <ExternalLink size={12} className="ml-1" />
            </a>
          </Button>
        </section>
      </SheetContent>
    </Sheet>
  );
}
