/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StepperShell } from '../StepperShell';

describe('StepperShell', () => {
  it('renders steps and content', () => {
    render(
      <StepperShell
        steps={[{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] as never}
        current={0}
        onPrev={vi.fn()} onNext={vi.fn()}
      >
        <div>body</div>
      </StepperShell>,
    );
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});
