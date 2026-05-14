/**
 * WhatToExpect — collapsible reassurance block above the directory.
 * Reduces fear-of-unknown, the #1 barrier to a first call.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, MessageCircleHeart } from 'lucide-react';

export function WhatToExpect() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6 rounded-lg border bg-muted/40">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircleHeart size={16} aria-hidden />
          {t('help.expect_title', 'What happens when you call')}
        </span>
        <ChevronDown
          size={16}
          className="transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-t px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              {t('help.expect_1', 'You’ll hear a short greeting. You don’t have to give your name.')}
            </li>
            <li>
              {t('help.expect_2', 'You can hang up at any time. You can call back as often as you need.')}
            </li>
            <li>
              {t('help.expect_3', 'Free hotlines in DE/AT/CH don’t appear on itemized phone bills.')}
            </li>
            <li>
              {t('help.expect_4', 'If you can’t speak, ask for text or chat — most hotlines offer it.')}
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
