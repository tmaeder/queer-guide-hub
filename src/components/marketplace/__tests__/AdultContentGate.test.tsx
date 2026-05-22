/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { AdultContentGate } from '../AdultContentGate';
import { isAdultListing, isAdultCategorySlug } from '@/hooks/useAdultContent';

const KEY = 'qg.marketplace.ageAck';

describe('AdultContentGate', () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it('renders nothing when not active', () => {
    const { queryByRole } = render(
      <MemoryRouter>
        <AdultContentGate active={false} />
      </MemoryRouter>,
    );
    expect(queryByRole('alertdialog')).toBeNull();
  });

  it('opens when active and unacknowledged', () => {
    const { getByRole } = render(
      <MemoryRouter>
        <AdultContentGate active />
      </MemoryRouter>,
    );
    expect(getByRole('alertdialog')).toBeTruthy();
    expect(getByRole('button', { name: /I am 18 or older/i })).toBeTruthy();
  });

  it('persists acknowledgement in localStorage', () => {
    const { getByText, queryByRole } = render(
      <MemoryRouter>
        <AdultContentGate active />
      </MemoryRouter>,
    );
    fireEvent.click(getByText(/I am 18 or older/i));
    expect(localStorage.getItem(KEY)).toBeTruthy();
    expect(queryByRole('alertdialog')).toBeNull();
  });

  it('stays closed across remount once acknowledged', () => {
    localStorage.setItem(KEY, new Date().toISOString());
    const { queryByRole } = render(
      <MemoryRouter>
        <AdultContentGate active />
      </MemoryRouter>,
    );
    expect(queryByRole('alertdialog')).toBeNull();
  });
});

describe('adult helpers', () => {
  it('isAdultListing reads sensitivity_flags array', () => {
    expect(isAdultListing({ sensitivity_flags: ['adult'] })).toBe(true);
    expect(isAdultListing({ sensitivity_flags: ['nsfw'] })).toBe(false);
    expect(isAdultListing(null)).toBe(false);
  });

  it('isAdultCategorySlug normalises hyphens / spaces / casing', () => {
    expect(isAdultCategorySlug('Fetish Gear')).toBe(true);
    expect(isAdultCategorySlug('fetish-gear')).toBe(true);
    expect(isAdultCategorySlug('sex_toys')).toBe(true);
    expect(isAdultCategorySlug('underwear')).toBe(false);
    expect(isAdultCategorySlug(undefined)).toBe(false);
  });
});
