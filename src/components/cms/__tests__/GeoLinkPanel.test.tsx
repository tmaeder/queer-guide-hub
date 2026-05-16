/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useGeoLink', () => ({
  useGeoLink: () => ({ loading: false, result: null, linkSingle: vi.fn() }),
}));

import { GeoLinkPanel } from '../GeoLinkPanel';

describe('GeoLinkPanel', () => {
  it('renders', () => {
    const { container } = render(
      <GeoLinkPanel contentType="venues" contentId="v1" cityName="Berlin" countryName="Germany" hasCityId={false} hasCountryId={false} onLinked={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
