/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useAgeAffirmation', () => ({ useAgeAffirmation: () => ({ affirmed: false, affirm: vi.fn() }) }));

import { AgeAffirmationModal } from '../AgeAffirmationModal';

describe('AgeAffirmationModal', () => {
  it('renders inactive', () => {
    const { container } = render(<AgeAffirmationModal active={false} onDecline={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
