import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Globe } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LANGUAGE_NAMES,
  isSupportedLocale,
} from '@/i18n/languages';
import type { SupportedLocale } from '@/i18n/languages';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const navigate = useLocalizedNavigate();
  const location = useLocation();
  const { locale } = useParams<{ locale?: string }>();

  const currentLocale: SupportedLocale =
    locale && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;

  const handleChange = (newLocale: string) => {
    if (!isSupportedLocale(newLocale) || newLocale === currentLocale) return;

    const pathWithoutLocale =
      locale && isSupportedLocale(locale)
        ? location.pathname.replace(`/${locale}`, '') || '/'
        : location.pathname;

    const newPath =
      newLocale === DEFAULT_LOCALE
        ? pathWithoutLocale
        : `/${newLocale}${pathWithoutLocale}`;

    // WCAG 3.1.1, 3.1.2 — update <html lang> before paint so assistive tech
    // picks up the new language immediately, ahead of LocaleRouter's effect.
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLocale;
    }
    i18n.changeLanguage(newLocale);
    navigate(newPath + location.search, { replace: true });
  };

  return (
    <Select value={currentLocale} onValueChange={handleChange}>
      {/* WCAG 4.1.2 — combobox now points at its listbox via aria-controls. */}
      <SelectTrigger
        aria-label="Select language"
        aria-controls="language-listbox"
        style={{
          width: 'auto',
          minWidth: 0,
          height: 36,
          padding: '0 8px',
          gap: 4,
          border: 'none',
          background: 'transparent',
        }}
      >
        <Globe style={{ width: 16, height: 16, flexShrink: 0 }} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent id="language-listbox">
        {SUPPORTED_LOCALES.map((lang) => (
          <SelectItem key={lang} value={lang}>
            <span className="text-[0.8125rem]">{LANGUAGE_NAMES[lang]}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
