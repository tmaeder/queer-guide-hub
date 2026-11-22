import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { EventObservanceChip } from '@/components/events/EventObservanceChip';

const hook = vi.hoisted(() => ({ useEventObservances: vi.fn() }));
vi.mock('@/hooks/useObservances', () => hook);
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, def: string, vars?: Record<string, unknown>) =>
      def.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars?.[k] ?? '')),
  }),
}));

describe('EventObservanceChip', () => {
  it('renders nothing without observances', () => {
    hook.useEventObservances.mockReturnValue({ data: [] });
    const { container } = renderWithProviders(<EventObservanceChip eventId="e1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links each observance to its hub page', () => {
    hook.useEventObservances.mockReturnValue({
      data: [
        { slug: 'world-aids-day', name: 'World AIDS Day' },
        { slug: 'transgender-day-of-remembrance', name: 'Transgender Day of Remembrance' },
      ],
    });
    renderWithProviders(<EventObservanceChip eventId="e1" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', expect.stringMatching(/\/days\/world-aids-day$/));
    expect(links[1]).toHaveAttribute(
      'href',
      expect.stringMatching(/\/days\/transgender-day-of-remembrance$/),
    );
    expect(links[0]).toHaveTextContent('Part of World AIDS Day');
  });
});
