import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import { fireEvent } from '@testing-library/react';
import { ConsentBlock, isConsentComplete, emptyConsent } from '../ConsentBlock';

describe('ConsentBlock', () => {
  it('isConsentComplete requires all three flags', () => {
    expect(isConsentComplete(emptyConsent)).toBe(false);
    expect(isConsentComplete({ terms: true, privacy: true, age18: false })).toBe(false);
    expect(isConsentComplete({ terms: true, privacy: true, age18: true })).toBe(true);
  });

  it('renders three checkboxes and emits onChange when toggled', () => {
    const onChange = vi.fn();
    renderWithProviders(<ConsentBlock value={emptyConsent} onChange={onChange} />);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);

    fireEvent.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalledWith({ terms: true, privacy: false, age18: false });
  });
});
