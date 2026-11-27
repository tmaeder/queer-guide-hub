import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const save = vi.fn(async () => {});
const upsertIntimate = vi.fn(async () => {});

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useBodyProfile', () => ({
  useBodyProfile: () => ({ data: null, isLoading: false }),
  useSaveBodyProfile: () => ({ mutateAsync: save, isPending: false }),
}));
vi.mock('@/hooks/useIntimateProfile', () => ({
  useMyIntimateProfile: () => ({
    data: { consent_18plus_at: '2026-01-01', height_cm: 180, body_type: 'average' },
  }),
  useUpsertIntimateProfile: () => ({ mutateAsync: upsertIntimate, isPending: false }),
}));

import { BodyProfileEditor } from '../BodyProfileEditor';

describe('BodyProfileEditor', () => {
  it('starts from the intimate profile, saves privately and mirrors build back', async () => {
    render(<BodyProfileEditor />);
    expect(screen.getByLabelText('Height (cm)')).toHaveValue(180);
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(upsertIntimate).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ height_cm: 180, weight_kg: 75, visibility: 'private' }),
    );
    expect(upsertIntimate).toHaveBeenCalledWith(
      expect.objectContaining({ height_cm: 180, body_type: 'average' }),
    );
  });

  it('flags a body type that disagrees with height and weight, and blocks impossible values', () => {
    render(<BodyProfileEditor />);
    fireEvent.click(screen.getByRole('button', { name: /twink/ }));
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '110' } });
    expect(screen.getByRole('region', { name: 'Worth a second look' })).toHaveTextContent('twink');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '400' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
