/**
 * @vitest-environment jsdom
 *
 * `list_testing_sites` selects on roles + service tags, never on provenance, so
 * every health directory we import shows up in this band automatically. These
 * tests pin the consequence: the band must name the directory each row actually
 * came from.
 *
 * The failure this guards against is not cosmetic. Until 2026-08-30 the band
 * read `enrichment_status.testfinder` and credited testfinder.info
 * unconditionally, so publishing the Swiss national registry (~150 Swiss
 * centres against testfinder's 9) would have told readers that a Swiss federal
 * health record came from a Danish university — on the page whose whole job is
 * telling someone where to get an HIV test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TestingSite } from '@/hooks/useOrganization';

const sitesRef = { current: [] as TestingSite[] };

vi.mock('@/hooks/useOrganization', () => ({
  useTestingSites: () => ({ data: sitesRef.current, isLoading: false }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import { TestingSitesBand } from '../TestingSitesBand';

function site(overrides: Partial<TestingSite> & Record<string, unknown>): TestingSite {
  return {
    id: overrides.id ?? 's1',
    slug: 'a-clinic',
    name: 'A Clinic',
    website: null,
    email: null,
    phone: null,
    address: 'Somewhere 1',
    latitude: null,
    longitude: null,
    tags: ['hiv-testing'],
    enrichment_status: null,
    ...overrides,
  } as unknown as TestingSite;
}

const TESTFINDER = {
  field_provenance: { source: { name: 'european-test-finder', source_last_updated: '2021-11-15' } },
  enrichment_status: { testfinder: { opening_hours: 'Mon 10:00-14:00' } },
};

const AIDS_CH = {
  field_provenance: { source: { name: 'aids-ch' } },
  enrichment_status: { 'aids-ch': { opening_hours_url: 'https://example.ch/hours' } },
};

beforeEach(() => {
  sitesRef.current = [];
});

describe('TestingSitesBand attribution', () => {
  it('credits only the European Test Finder when that is the only source on screen', () => {
    sitesRef.current = [site({ ...TESTFINDER, name: 'Checkpoint Copenhagen' })];
    render(<TestingSitesBand countryCode="DK" />);

    expect(screen.getByText(/European Test Finder/)).toBeTruthy();
    expect(screen.queryByText(/Swiss AIDS Federation/)).toBeNull();
  });

  it('credits only the Swiss registry when that is the only source on screen', () => {
    sitesRef.current = [site({ ...AIDS_CH, name: 'Checkpoint Zürich' })];
    render(<TestingSitesBand countryCode="CH" />);

    expect(screen.getByText(/Swiss AIDS Federation/)).toBeTruthy();
    // The bug this file exists for: a Swiss federal record credited to a Danish
    // university because the note was a hardcoded string.
    expect(screen.queryByText(/European Test Finder/)).toBeNull();
  });

  it('credits both when a country is covered by both directories', () => {
    sitesRef.current = [
      site({ ...TESTFINDER, id: 's1', name: 'Checkpoint Zürich (TF)' }),
      site({ ...AIDS_CH, id: 's2', name: 'Checkpoint Zürich (registry)' }),
    ];
    render(<TestingSitesBand countryCode="CH" />);

    expect(screen.getByText(/European Test Finder/)).toBeTruthy();
    expect(screen.getByText(/Swiss AIDS Federation/)).toBeTruthy();
  });

  it('still names a directory when the result set is empty', () => {
    // The note always renders — the band deliberately does not return null on
    // empty, because it replaced a plain outbound link.
    render(<TestingSitesBand countryCode="XX" />);
    expect(screen.getByText(/European Test Finder/)).toBeTruthy();
    expect(screen.getByText(/No testing locations on record/)).toBeTruthy();
  });

  it('falls back to the default directory for a row with unknown provenance', () => {
    sitesRef.current = [site({ name: 'Legacy row' })];
    render(<TestingSitesBand countryCode="DK" />);
    expect(screen.getByText(/European Test Finder/)).toBeTruthy();
  });
});

describe('TestingSitesBand opening hours', () => {
  it('reads the detail bucket named by the row own source, not a fixed key', () => {
    sitesRef.current = [site(TESTFINDER)];
    render(<TestingSitesBand countryCode="DK" />);
    expect(screen.getByText('Mon 10:00-14:00')).toBeTruthy();
  });

  it('links out when a directory publishes hours as a URL instead of text', () => {
    sitesRef.current = [site(AIDS_CH)];
    render(<TestingSitesBand countryCode="CH" />);
    const link = screen.getByText(/Opening hours on the provider/);
    expect(link.getAttribute('href')).toBe('https://example.ch/hours');
  });

  it('renders no hours row at all when the source states none', () => {
    sitesRef.current = [site({ field_provenance: { source: { name: 'aids-ch' } } })];
    render(<TestingSitesBand countryCode="CH" />);
    expect(screen.queryByText(/Opening hours on the provider/)).toBeNull();
  });
});
