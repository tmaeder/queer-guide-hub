/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SDGDataPanel } from '../SDGDataPanel';

describe('SDGDataPanel', () => {
  it('renders', () => {
    const { container } = render(<SDGDataPanel data={{ goals: {}, hasData: false, lastSyncedAt: null }} countryName="X" />);
    expect(container).toBeTruthy();
  });
});
