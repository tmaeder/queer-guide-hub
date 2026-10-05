/**
 * UsernamePanel was hardcoded English in an 11-language app, so ten locales
 * showed English for the username policy -- including the sentence a user has
 * to read BEFORE spending a change they cannot take back for a year.
 *
 * Key PARITY and PLACEHOLDER survival are already enforced in CI by
 * scripts/sync-translations.ts and scripts/check-i18n-placeholders.mjs, so
 * this file deliberately does not restate them. What nothing covered is the
 * direction the regression actually comes from: someone adding a literal back
 * to the component. That is what the first test asserts.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar'] as const;

const KEYS = [
  'autoAssignedBadge',
  'change',
  'changingFrom',
  'claim',
  'confirmChange',
  'errorGeneric',
  'errorRateLimited',
  'errorUnavailable',
  'notChangedTitle',
  'policyAutoAssigned',
  'policyStandard',
  'rateLimitedFallbackDate',
  'safetyNote',
  'updatedBody',
  'updatedTitle',
] as const;

const panel = readFileSync(join(process.cwd(), 'src/components/profile/UsernamePanel.tsx'), 'utf8');

/** JSX text and string literals, minus comments -- prose must not satisfy a code assertion. */
const code = panel
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n');

const localeBlock = (lang: string) =>
  JSON.parse(readFileSync(join(process.cwd(), `src/i18n/locales/${lang}.json`), 'utf8')).profile
    .username as Record<string, string>;

describe('UsernamePanel i18n', () => {
  it('has no hardcoded English copy left in the component', () => {
    // the exact literals that used to live here; each one was a string ten
    // locales could never override
    const removed = [
      'Could not change username',
      'That username is taken or reserved',
      'You can change your username once per year',
      'Username not changed',
      'Username updated',
      'You are now @',
      'auto-assigned',
      'We assigned this for you',
      'Changeable once per year',
      'Need a change for safety reasons',
      'Change username',
      'Changing from',
      'Confirm change',
      'Claim username',
    ];
    for (const literal of removed) {
      expect(code, `hardcoded copy is back: "${literal}"`).not.toContain(literal);
    }
  });

  it('reads every string through t() under profile.username.*', () => {
    for (const key of KEYS) {
      expect(code, `component never reads profile.username.${key}`).toContain(
        `profile.username.${key}`,
      );
    }
    // Cancel reuses the shared key rather than minting a 12th translation
    expect(code).toContain("t('common.cancel')");
  });

  it('passes the interpolation values the strings expect', () => {
    // a key whose placeholder is never supplied renders the raw {{...}}
    expect(code).toMatch(/profile\.username\.changingFrom',\s*\{\s*username\s*\}/);
    expect(code).toMatch(/profile\.username\.updatedBody',\s*\{\s*username:\s*pending\s*\}/);
    expect(code).toMatch(/profile\.username\.errorRateLimited',\s*\{\s*date:\s*next\s*\}/);
  });

  it('falls back to a translated word, not English, when next_change_at is absent', () => {
    // this branch is the one a user in the rate-limited state actually sees
    expect(code).toContain("t('profile.username.rateLimitedFallbackDate')");
    expect(code).not.toMatch(/:\s*'later'/);
  });

  it('carries no em dash in any locale (Brand Guidelines §06)', () => {
    // the original hardcoded copy used em dashes and escaped the vocabulary
    // check only because it lived in TSX rather than in locale JSON
    for (const lang of LOCALES) {
      const offenders = Object.entries(localeBlock(lang))
        .filter(([, v]) => v.includes('—'))
        .map(([k]) => k);
      expect(offenders, `${lang} has em dashes in ${offenders.join(', ')}`).toEqual([]);
    }
  });

  it('states the 30-day correction window in every locale', () => {
    // the window is the whole point of 99991791139641; a locale that omits it
    // tells the user the change is locked for a year with no way back
    for (const lang of LOCALES) {
      const block = localeBlock(lang);
      for (const key of ['policyStandard', 'changingFrom'] as const) {
        expect(block[key], `${lang}.${key} does not mention 30`).toMatch(/30/);
      }
    }
  });
});
