/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// Light mocks so the parts render in isolation without async data / i18n / admin plumbing.
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('@/components/admin/inline/Editable', () => ({
  Editable: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/hooks/usePersonalityRelated', () => ({
  usePersonalityRelated: () => ({ news: [], events: [], loading: false }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

import {
  transformPersonality,
  calculateAge,
  getInitials,
  PersonalityOverview,
  PersonalitySidebar,
} from '../PersonalityDetail.parts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makePersonality = (overrides: Record<string, unknown> = {}): any =>
  transformPersonality({
    id: 'p1',
    name: 'Elliot Page',
    profession: 'film actor',
    nationality: 'Canada',
    birth_place: 'Halifax',
    birth_city: { id: 'c1', name: 'Halifax', country: { name: 'Canada', code: 'CA' } },
    birth_date: '1987-02-21',
    description: 'Canadian actor (born 1987)',
    bio: 'Elliot Page is a Canadian actor, producer, and activist.',
    is_living: true,
    verification_status: 'verified',
    ...overrides,
  });

describe('PersonalityDetail.parts', () => {
  it('transformPersonality returns object', () => {
    expect(typeof transformPersonality({ id: 'p1', name: 'Test' })).toBe('object');
  });
  it('calculateAge handles birth+death', () => {
    expect(typeof calculateAge('1900-01-01', '2000-01-01')).toBe('number');
  });
  it('getInitials returns initials', () => {
    expect(getInitials('John Doe')).toMatch(/J|JD/);
  });

  it('hides the boilerplate description "About" card when a bio is present', () => {
    render(
      <MemoryRouter>
        <PersonalityOverview personality={makePersonality()} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('About')).toBeNull();
    expect(screen.queryByText('Canadian actor (born 1987)')).toBeNull();
    // The richer bio still renders.
    expect(screen.getByText('Biography')).toBeTruthy();
  });

  it('still shows the description card when there is no bio to supersede it', () => {
    render(
      <MemoryRouter>
        <PersonalityOverview personality={makePersonality({ bio: null })} />
      </MemoryRouter>,
    );
    expect(screen.getByText('About')).toBeTruthy();
    expect(screen.getByText('Canadian actor (born 1987)')).toBeTruthy();
  });

  it('sidebar omits the Nationality and Profession rows (shown in the hero instead)', () => {
    render(
      <MemoryRouter>
        <PersonalitySidebar personality={makePersonality()} onTagClick={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Nationality')).toBeNull();
    expect(screen.queryByText('Profession')).toBeNull();
    // Date/place facts the hero doesn't carry are kept.
    expect(screen.getByText('Born')).toBeTruthy();
    expect(screen.getByText('Birth Place')).toBeTruthy();
  });

  it('does not repeat the country on the birth place when it matches nationality', () => {
    render(
      <MemoryRouter>
        <PersonalitySidebar personality={makePersonality()} onTagClick={() => {}} />
      </MemoryRouter>,
    );
    // "Halifax" shown, but not re-suffixed with ", Canada" (Canada is the nationality).
    expect(screen.getByText('Halifax')).toBeTruthy();
    expect(screen.queryByText(/Halifax,\s*Canada/)).toBeNull();
  });

  it('keeps the birth-place country when it differs from nationality', () => {
    render(
      <MemoryRouter>
        <PersonalitySidebar
          personality={makePersonality({ nationality: 'American' })}
          onTagClick={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Halifax,\s*Canada/)).toBeTruthy();
  });
});
