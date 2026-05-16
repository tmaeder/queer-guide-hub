/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { AnimatedModal } from '../AnimatedModal';

describe('AnimatedModal', () => {
  it('renders closed', () => {
    const { container } = render(<AnimatedModal open={false} onClose={vi.fn()}>body</AnimatedModal>);
    expect(container).toBeTruthy();
  });
});
