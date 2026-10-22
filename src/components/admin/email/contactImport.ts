import { parseRedirectCsv as parseCsv } from '@/lib/redirects/importCsv';
export function parseContactImport(text: string): { email: string; locale: string }[] {
  if (new TextEncoder().encode(text).byteLength > 100000)
    throw new Error('Import files must be at most 100 KB.');
  const [header, ...rows] = parseCsv(text);
  const fields = header.map((h) => h.trim().toLowerCase());
  if (
    !fields.includes('email') ||
    fields.some((f) => !['email', 'locale'].includes(f)) ||
    new Set(fields).size !== fields.length
  )
    throw new Error(
      'Use an email column and an optional locale column. Consent and subscription status cannot be imported.',
    );
  return rows.map((row, index) => {
    const email = row[fields.indexOf('email')].trim().toLowerCase(),
      locale = fields.includes('locale') ? row[fields.indexOf('locale')].trim() || 'en' : 'en';
    if (
      email.length > 254 ||
      !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email) ||
      !/^[a-z]{2}(?:-[A-Za-z]{2,8})?$/.test(locale)
    )
      throw new Error(`Check the email and locale in row ${index + 2}.`);
    return { email, locale };
  });
}
