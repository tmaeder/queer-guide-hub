/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FlyerScanResults } from '../FlyerScanResults';

describe('FlyerScanResults', () => {
  it('renders', () => {
    const { container } = render(
      <FlyerScanResults results={[]} selectedVenueId={null} onSelectVenue={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
