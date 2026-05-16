/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useRecognitions', () => ({
  useMailingAddress: () => ({ data: null, isLoading: false }),
  useMailingAddressMutations: () => ({ upsert: { mutate: vi.fn(), isPending: false }, remove: { mutate: vi.fn(), isPending: false } }),
}));

import { RecognitionMailingForm } from '../RecognitionMailingForm';

describe('RecognitionMailingForm', () => {
  it('renders', () => {
    const { container } = render(<RecognitionMailingForm />);
    expect(container).toBeTruthy();
  });
});
