/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WorldBankDataPanel } from '../WorldBankDataPanel';

describe('WorldBankDataPanel', () => {
  it('renders', () => {
    const { container } = render(<WorldBankDataPanel data={{ indicators: {}, hasData: false } as never} countryName="X" />);
    expect(container).toBeTruthy();
  });
});
