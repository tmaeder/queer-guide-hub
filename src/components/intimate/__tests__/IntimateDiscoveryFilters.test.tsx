/**
 * @vitest-environment jsdom
 */
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IntimateDiscoveryFilters } from '../IntimateDiscoveryFilters';
import {
  ageBandsFromRange,
  buildInterestOptions,
  type InterestOption,
} from '@/lib/intimate/discoveryFilters';

const INTERESTS: InterestOption[] = [
  {
    id: 'rope-shibari',
    label: 'Rope bondage / shibari',
    categoryId: 'bondage',
    categoryLabel: 'Bondage & restraints',
    itemSlug: 'rope-shibari',
  },
  {
    id: 'chastity',
    label: 'Chastity',
    categoryId: 'bondage',
    categoryLabel: 'Bondage & restraints',
    itemSlug: 'chastity',
  },
];

function Harness() {
  const [roles, setRoles] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [ages, setAges] = useState<string[]>([]);
  const [bodies, setBodies] = useState<string[]>([]);
  return (
    <MemoryRouter>
      <IntimateDiscoveryFilters
        roles={roles}
        onRolesChange={setRoles}
        interestOptions={INTERESTS}
        interestsLoading={false}
        interests={interests}
        onInterestsChange={setInterests}
        ages={ages}
        onAgesChange={setAges}
        bodies={bodies}
        onBodiesChange={setBodies}
      />
    </MemoryRouter>
  );
}

describe('IntimateDiscoveryFilters', () => {
  it('keeps option lists collapsed until requested', () => {
    render(<Harness />);

    expect(screen.getByRole('button', { name: 'Role' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Top' })).not.toBeInTheDocument();
    expect(screen.queryByText('Rope bondage / shibari')).not.toBeInTheDocument();
  });

  it('selects and removes compact role filters', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Role' }));
    fireEvent.click(screen.getByRole('button', { name: 'Top' }));

    expect(screen.getByRole('button', { name: 'Remove Top filter' })).toBeInTheDocument();
    expect(screen.getByText('Filters · 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Top filter' }));
    expect(screen.queryByRole('button', { name: 'Remove Top filter' })).not.toBeInTheDocument();
  });

  it('searches and selects grouped kink interests', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Into' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search interests' }), {
      target: { value: 'rope' },
    });
    fireEvent.click(screen.getByText('Rope bondage / shibari'));

    expect(
      screen.getByRole('button', { name: 'Remove Rope bondage / shibari filter' }),
    ).toBeInTheDocument();
  });

  it('converts an inclusive slider range into the existing age bands', () => {
    expect(ageBandsFromRange([3, 6])).toEqual(['25-29', '30-34', '35-39', '40-49']);
  });

  it('provides the baseline vocabulary when the richer taxonomy is unavailable', () => {
    const fallback = buildInterestOptions();
    expect(fallback.find((option) => option.legacyTag === 'bondage')).toMatchObject({
      id: 'legacy:bondage',
      label: 'Bondage',
      categoryLabel: 'Popular',
    });
  });
});
