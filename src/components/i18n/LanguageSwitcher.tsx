import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation, useParams } from 'react-router';
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
import Box from '@mui/material/Box';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { locale } = useParams<{ locale?: string }>();

  const currentLocale: SupportedLocale =
    locale && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;

  const handleChange = (newLocale: string) => {
    if (!isSupportedLocale(newLocale) || newLocale === currentLocale) return;

    // Strip current locale prefix from path
    const pathWithoutLocale =
      locale && isSupportedLocale(locale)
        ? location.pathname.replace(`/${locale}`, '') || '/'
        : location.pathname;

    // Build new path
    const newPath =
      newLocale === DEFAULT_LOCALE
        ? pathWithoutLocale
        : `/${newLocale}${pathWithoutLocale}`;

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
          gap: 4,
          border: 'none',
          background: 'transparent',
        }}
      >
        <Globe style={{ width: 16, height: 16, flexShrink: 0 }} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LOCALES.map((lang) => (
          <SelectItem key={lang} value={lang}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <span style={{ fontSize: '0.8125rem' }}>{LANGUAGE_NAMES[lang]}</span>
            </Box>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
