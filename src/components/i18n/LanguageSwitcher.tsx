import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
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
  // Plain navigate, NOT useLocalizedNavigate: this handler already builds the
  // fully-qualified target path (with or without a locale prefix). Routing it
  // through the localized navigate would re-prefix with the *current* locale
  // still present in the URL params, so switching de→en on /de/help would land
  // back on /de/help instead of the unprefixed /help.
  const navigate = useNavigate();
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
      newLocale === DEFAULT_LOCALE ? pathWithoutLocale : `/${newLocale}${pathWithoutLocale}`;

    i18n.changeLanguage(newLocale);
    navigate(newPath + location.search, { replace: true });
  };

  return (
    <Select value={currentLocale} onValueChange={handleChange}>
      <SelectTrigger
        aria-label="Select language"
        style={{
          width: 'auto',
          minWidth: 0,
          height: 36,
          padding: '0 8px',
          border: 'none',
          background: 'transparent',
        }}
        className="gap-1"
      >
        <Globe size={16} className="shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LOCALES.map((lang) => (
          <SelectItem key={lang} value={lang}>
            <span className="text-13">{LANGUAGE_NAMES[lang]}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
