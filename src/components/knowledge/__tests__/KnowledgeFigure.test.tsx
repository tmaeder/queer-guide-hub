import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/hooks/knowledge/useKnowledgeEditorial', () => ({
  usePublicKnowledgeEditorial: () => ({ data: [] }),
}));
import { KnowledgeFigure, KnowledgeVisuals } from '../KnowledgeFigure';
import { PILOT_FIGURES } from '@/lib/knowledge/pilotFigures';

describe('knowledge figures', () => {
  it.each(PILOT_FIGURES)('renders the same facts visually and as text: $id', (figure) => {
    const { container } = render(<KnowledgeFigure figure={figure} draft />);
    expect(screen.getByRole('img')).toHaveAccessibleName(figure.summary);
    expect(container.querySelectorAll('dt')).toHaveLength(figure.rows.length);
    const button = screen.getByRole('button', { name: 'Read as text' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/editorial review pending/)).toBeInTheDocument();
  });
  it('does not publish registered draft figures without a public projection', () => {
    const { container } = render(<KnowledgeVisuals kind="unified_tags" entityId="test" />);
    expect(container.querySelector('figure')).toBeNull();
  });
});
