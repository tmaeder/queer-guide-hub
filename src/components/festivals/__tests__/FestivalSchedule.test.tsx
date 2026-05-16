/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { FestivalSchedule } from '../FestivalSchedule';

describe('FestivalSchedule', () => {
  it('renders empty list', () => {
    const { container } = render(
      <MemoryRouter><FestivalSchedule events={[]} timezone="UTC" /></MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
