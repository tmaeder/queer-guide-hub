import { describe, expect, it } from 'vitest';
import routes from './appRoutes.json';
import {
  FIRST_PARTY_APP,
  withFirstPartyApp,
} from '../../supabase/functions/_shared/redirect-app-association-proxy';

const app = { ...FIRST_PARTY_APP, appleTeamId: 'ABCDE12345', androidFingerprints: ['AA:BB'] };
const empty = { applinks: { details: [] } };

describe('first-party app association', () => {
  it('excludes every static web route under the app prefixes (the app has no screen for them)', () => {
    const prefixes = FIRST_PARTY_APP.paths
      .filter((p) => p.endsWith('/*'))
      .map((p) => p.slice(0, -1));
    const statics = (routes.paths as string[])
      .filter((r) => prefixes.some((p) => r.startsWith(p)) && !/^\/[^/]+\/:slug$/.test(r))
      .map((r) => r.replace(/:[a-z]+$/, '*'));
    const missing = statics.filter((r) => !FIRST_PARTY_APP.exclude.includes(r));
    expect(statics.length).toBeGreaterThan(5);
    expect(missing).toEqual([]);
  });

  it('adds the app after the registry entries, excludes before includes, plus webcredentials', () => {
    const doc = withFirstPartyApp('ios', 'queer.guide', empty, app) as {
      applinks: {
        details: { appIDs: string[]; components: { '/': string; exclude?: boolean }[] }[];
      };
      webcredentials: { apps: string[] };
    };
    const entry = doc.applinks.details.at(-1)!;
    expect(entry.appIDs).toEqual(['ABCDE12345.guide.queer.app']);
    const firstInclude = entry.components.findIndex((c) => !c.exclude);
    expect(entry.components.slice(firstInclude).every((c) => !c.exclude)).toBe(true);
    expect(entry.components.map((c) => c['/'])).toContain('/venues/*');
    expect(doc.webcredentials).toEqual({ apps: ['ABCDE12345.guide.queer.app'] });
  });

  it('is unchanged on other hosts and while the team id / fingerprint is not set', () => {
    expect(withFirstPartyApp('ios', 'links.example.com', empty, app)).toBe(empty);
    expect(withFirstPartyApp('ios', 'queer.guide', empty, FIRST_PARTY_APP)).toBe(empty);
    expect(withFirstPartyApp('android', 'queer.guide', [], FIRST_PARTY_APP)).toEqual([]);
    expect((withFirstPartyApp('android', 'www.queer.guide', [], app) as unknown[]).length).toBe(1);
  });
});
