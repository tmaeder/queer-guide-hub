/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { VenueEvents } from '../VenueEvents';

describe('VenueEvents', () => {
  it('renders empty state', () => {
    const { container } = render(<MemoryRouter><VenueEvents venueId="v1" venueName="Pride Bar" events={[]} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
