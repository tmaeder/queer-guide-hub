/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatsPanel } from '../StatsPanel';

describe('StatsPanel', () => {
  it('renders', () => {
    const { container } = render(
      <StatsPanel stats={{ countries: 0, cities: 0, venues: 0, events: 0 } as never} visible={undefined as never} />,
    );
    expect(container).toBeTruthy();
  });
});
