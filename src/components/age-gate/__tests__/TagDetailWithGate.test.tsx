/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/components/age-gate/AgeAffirmationModal', () => ({
  AgeAffirmationModal: () => <div data-testid="modal" />,
}));

import { TagDetailWithGate } from '../TagDetailWithGate';

describe('TagDetailWithGate', () => {
  it('renders children when not adult', () => {
    render(
      <TagDetailWithGate isAdult={false} affirmed={false} onDecline={vi.fn()}>
        <div>kids</div>
      </TagDetailWithGate>,
    );
    expect(screen.getByText('kids')).toBeInTheDocument();
  });

  it('renders children when adult + already affirmed', () => {
    render(
      <TagDetailWithGate isAdult affirmed onDecline={vi.fn()}>
        <div>adult ok</div>
      </TagDetailWithGate>,
    );
    expect(screen.getByText('adult ok')).toBeInTheDocument();
  });

  it('renders placeholder + modal when adult + not affirmed', () => {
    render(
      <TagDetailWithGate isAdult affirmed={false} onDecline={vi.fn()}>
        <div>hidden</div>
      </TagDetailWithGate>,
    );
    expect(screen.queryByText('hidden')).toBeNull();
    expect(screen.getByTestId('age-gate-placeholder')).toBeInTheDocument();
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });
});
