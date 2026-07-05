import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
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
  // Raw navigate: handleChange already computes the fully locale-prefixed
  // target. useLocalizedNavigate would re-prefix with the CURRENT route locale
  // (still set at click time), so switching away from a non-default locale
  // (e.g. de → en) bounced straight back to /de/... instead of /... .
  const navigate = useNavigate();
  const location = useLocation();

  // Derive the active locale from the URL path, NOT useParams(). This switcher
  // renders in the Footer, OUTSIDE the ":locale" route match, so useParams()
  // .locale is always undefined here — which made currentLocale default to 'en'
  // on every page. Consequences on /de/*: the trigger showed "English",
  // selecting English was a no-op (value already 'en' → Radix fires nothing),
  // and picking another language stacked prefixes (/de/help → /es/de/help)
  // because the existing /de segment was never stripped.
  const firstSegment = location.pathname.split('/')[1];
  const currentLocale: SupportedLocale = isSupportedLocale(firstSegment)
    ? firstSegment
    : DEFAULT_LOCALE;

  const handleChange = (newLocale: string) => {
    if (!isSupportedLocale(newLocale) || newLocale === currentLocale) return;

    const pathWithoutLocale = isSupportedLocale(firstSegment)
      ? location.pathname.slice(firstSegment.length + 1) || '/'
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
