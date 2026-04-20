import type { Locale } from 'date-fns';
import {
  enUS,
  de,
  es,
  fr,
  it,
  pt,
  ru,
  zhCN,
  ja,
  ko,
  arSA,
} from 'date-fns/locale';

const MAP: Record<string, Locale> = {
  en: enUS,
  de,
  es,
  fr,
  it,
  pt,
  ru,
  zh: zhCN,
  ja,
  ko,
  ar: arSA,
};

/**
 * Resolve an i18next language code (e.g. "de", "de-CH", "zh-Hans") to a
 * date-fns Locale. Falls back to en-US.
 */
export function dateFnsLocaleFor(language: string | undefined | null): Locale {
  if (!language) return enUS;
  const lower = language.toLowerCase();
  const base = lower.split(/[-_]/)[0];
  return MAP[lower] ?? MAP[base] ?? enUS;
}
