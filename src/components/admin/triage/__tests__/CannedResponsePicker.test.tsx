/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useCannedResponsesMock } = vi.hoisted(() => ({
  useCannedResponsesMock: vi.fn(),
}));

vi.mock('@/hooks/useCannedResponses', () => ({ useCannedResponses: useCannedResponsesMock }));

import { CannedResponsePicker } from '../CannedResponsePicker';

beforeEach(() => {
  useCannedResponsesMock.mockReset();
});

describe('CannedResponsePicker', () => {
  it('returns null when no responses', () => {
    useCannedResponsesMock.mockReturnValue({ data: [] });
    const { container } = render(<CannedResponsePicker value="" onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when data undefined', () => {
    useCannedResponsesMock.mockReturnValue({ data: undefined });
    const { container } = render(<CannedResponsePicker value="" onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders trigger placeholder with responses', () => {
    useCannedResponsesMock.mockReturnValue({
      data: [{ slug: 'hi', label: 'Greeting', template: 'Hello!' }],
    });
    render(<CannedResponsePicker value="" onSelect={vi.fn()} />);
    expect(screen.getByText(/Quick response/i)).toBeInTheDocument();
  });
});
