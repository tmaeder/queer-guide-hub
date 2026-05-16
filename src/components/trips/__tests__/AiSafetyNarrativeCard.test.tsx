/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useBriefingMock, useGenerateMock, generateMutate } = vi.hoisted(() => ({
  useBriefingMock: vi.fn(),
  useGenerateMock: vi.fn(),
  generateMutate: vi.fn(),
}));

vi.mock('@/hooks/useTripSafetyNarrative', () => ({
  useTripSafetyBriefing: useBriefingMock,
  useGenerateTripSafetyBriefing: useGenerateMock,
}));

import { AiSafetyNarrativeCard } from '../AiSafetyNarrativeCard';

beforeEach(() => {
  useBriefingMock.mockReset();
  useGenerateMock.mockReset();
  generateMutate.mockReset();
  useGenerateMock.mockReturnValue({ mutate: generateMutate, isPending: false, isError: false });
});

describe('AiSafetyNarrativeCard', () => {
  it('renders nothing while loading', () => {
    useBriefingMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<AiSafetyNarrativeCard tripId="t1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no briefing and user cannot generate', () => {
    useBriefingMock.mockReturnValue({ data: null, isLoading: false });
    const { container } = render(<AiSafetyNarrativeCard tripId="t1" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows Generate CTA when no briefing and canGenerate', () => {
    useBriefingMock.mockReturnValue({ data: null, isLoading: false });
    render(<AiSafetyNarrativeCard tripId="t1" canGenerate />);
    fireEvent.click(screen.getByRole('button', { name: /Generate briefing/i }));
    expect(generateMutate).toHaveBeenCalledWith({ tripId: 't1', refresh: false });
  });

  it('renders narrative + article count + relative date when briefing exists', () => {
    useBriefingMock.mockReturnValue({
      data: {
        narrative: 'Things to know.',
        article_count: 5,
        generated_at: new Date(Date.now() - 60_000).toISOString(),
      },
      isLoading: false,
    });
    render(<AiSafetyNarrativeCard tripId="t1" />);
    expect(screen.getByText('Things to know.')).toBeInTheDocument();
    expect(screen.getByText(/5 recent articles/)).toBeInTheDocument();
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });

  it('Refresh button fires regenerate when canGenerate', () => {
    useBriefingMock.mockReturnValue({
      data: { narrative: 'x', article_count: 1, generated_at: new Date().toISOString() },
      isLoading: false,
    });
    render(<AiSafetyNarrativeCard tripId="t1" canGenerate />);
    fireEvent.click(screen.getByRole('button', { name: /Regenerate briefing/i }));
    expect(generateMutate).toHaveBeenCalledWith({ tripId: 't1', refresh: true });
  });

  it('shows generation error message', () => {
    useBriefingMock.mockReturnValue({ data: null, isLoading: false });
    useGenerateMock.mockReturnValue({ mutate: generateMutate, isPending: false, isError: true });
    render(<AiSafetyNarrativeCard tripId="t1" canGenerate />);
    expect(screen.getByText(/Could not generate briefing/i)).toBeInTheDocument();
  });
});
