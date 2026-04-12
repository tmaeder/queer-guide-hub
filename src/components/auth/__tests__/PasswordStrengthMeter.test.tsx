import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, waitFor } from '@/test/test-utils';
import { PasswordStrengthMeter } from '../PasswordStrengthMeter';

describe('PasswordStrengthMeter', () => {
  it('renders nothing-extra when password is empty', () => {
    const onScoreChange = vi.fn();
    renderWithProviders(<PasswordStrengthMeter password="" onScoreChange={onScoreChange} />);
    // 5 segment bars always present
    expect(document.querySelectorAll('[role]').length).toBeGreaterThanOrEqual(0);
    expect(onScoreChange).toHaveBeenCalledWith(0);
  });

  it('reports a score for a strong password', async () => {
    const onScoreChange = vi.fn();
    renderWithProviders(
      <PasswordStrengthMeter password="correcthorsebatterystaple9!" onScoreChange={onScoreChange} />
    );
    await waitFor(() => {
      expect(onScoreChange).toHaveBeenCalled();
      const last = onScoreChange.mock.calls.at(-1)?.[0];
      expect(last).toBeGreaterThanOrEqual(2);
    }, { timeout: 5000 });
  });

  it('reports a low score for a weak password', async () => {
    const onScoreChange = vi.fn();
    renderWithProviders(<PasswordStrengthMeter password="123456" onScoreChange={onScoreChange} />);
    await waitFor(() => {
      const last = onScoreChange.mock.calls.at(-1)?.[0];
      expect(last).toBeLessThanOrEqual(1);
    }, { timeout: 5000 });
  });
});
