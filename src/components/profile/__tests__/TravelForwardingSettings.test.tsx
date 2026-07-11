/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { TravelForwardingSettings } from '../TravelForwardingSettings';

describe('TravelForwardingSettings', () => {
  it('shows the username@queer.guide address when a username exists', () => {
    render(
      <MemoryRouter>
        <TravelForwardingSettings username="tobias" />
      </MemoryRouter>,
    );
    expect(screen.getByText('tobias@queer.guide')).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy address/i })).toBeTruthy();
  });

  it('shows a claim nudge when no username is set', () => {
    render(
      <MemoryRouter>
        <TravelForwardingSettings username={null} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/choose a username/i)).toBeTruthy();
    expect(screen.queryByText(/@queer\.guide/)).toBeNull();
  });
});
