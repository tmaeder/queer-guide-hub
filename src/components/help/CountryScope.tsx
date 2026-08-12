/**
 * CountryScope — "Showing lines for Germany · Change".
 *
 * Two deliberate choices:
 *
 * 1. The resolved country is stated, not offered as a form control. Geo already
 *    answered the question; re-presenting it as a required `<Select>` puts a
 *    decision in front of the one audience that can least afford one. But the
 *    answer is WRONG for travellers, VPN users and diaspora callers, and being
 *    shown Australian numbers in Berlin is a silent failure — so the reversal
 *    has to be visible, which is what "Change" is.
 *
 * 2. Choosing a country NAVIGATES to /help/:country instead of setting state.
 *    The route already exists and is canonicalised in useMeta, but the picker
 *    only ever wrote localStorage — so a friend, teacher or case worker could
 *    not send someone the page for their own country. That is the single most
 *    important thing this page does for the person helping somebody else.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { countryLabel } from './helpData';

export function CountryScope({
  country,
  available,
  onChange,
}: {
  country: string;
  available: string[];
  /** Kept in sync so the directory below re-filters without a remount. */
  onChange: (code: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const [open, setOpen] = useState(false);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
    navigate(code === 'ALL' ? '/help' : `/help/${code.toLowerCase()}`);
  };

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <p className="text-15">
        {country === 'ALL' ? (
          t('help.scope_all', 'Showing lines from every country we have.')
        ) : (
          <>
            {t('help.scope_prefix', 'Showing lines for')}{' '}
            <strong className="font-bold">{countryLabel(country)}</strong>
          </>
        )}
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="border-2 border-background bg-transparent px-4 py-1 text-13 font-bold text-background transition-colors hover:bg-background hover:text-foreground"
          >
            {t('help.scope_change', 'Change')}
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('help.scope_dialog_title', 'Choose a country')}</DialogTitle>
            <DialogDescription>
              {t(
                'help.scope_dialog_desc',
                'Lines are listed by the country they serve. International directories stay listed whichever you pick.',
              )}
            </DialogDescription>
          </DialogHeader>
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3">
            {['ALL', ...available].map((code) => {
              const active = code === country;
              return (
                <li key={code}>
                  <button
                    type="button"
                    onClick={() => pick(code)}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full border-2 border-foreground px-2 py-2 text-13 font-bold transition-colors ${
                      active
                        ? 'bg-foreground text-background'
                        : 'bg-background hover:bg-surface-container'
                    }`}
                  >
                    {code === 'ALL'
                      ? t('help.filter_country_all', 'All countries')
                      : countryLabel(code)}
                  </button>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
