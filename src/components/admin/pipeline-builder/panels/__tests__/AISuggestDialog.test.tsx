/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: { success: true, suggestion: { nodes: [], edges: [] } }, error: null }) } },
}));
vi.mock('../../utils/autoLayout', () => ({ autoLayout: (n: unknown) => n }));

import AISuggestDialog from '../AISuggestDialog';

describe('AISuggestDialog', () => {
  it('renders trigger button', () => {
    render(<AISuggestDialog nodeTypes={[] as never} onApply={vi.fn()} />);
    expect(screen.getByRole('button', { name: /AI suggest/ })).toBeInTheDocument();
  });

  it('opens dialog with textarea + examples', () => {
    render(<AISuggestDialog nodeTypes={[] as never} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /AI suggest/ }));
    expect(screen.getByPlaceholderText(/Daily hotel ingestion/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate suggestion/ })).toBeInTheDocument();
  });

  it('Generate disabled with < 10 chars', () => {
    render(<AISuggestDialog nodeTypes={[] as never} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /AI suggest/ }));
    expect(screen.getByRole('button', { name: /Generate suggestion/ })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Daily hotel/), { target: { value: 'short' } });
    expect(screen.getByRole('button', { name: /Generate suggestion/ })).toBeDisabled();
  });

  it('Generate enabled with 10+ chars', () => {
    render(<AISuggestDialog nodeTypes={[] as never} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /AI suggest/ }));
    fireEvent.change(screen.getByPlaceholderText(/Daily hotel/), { target: { value: 'long enough text here' } });
    expect(screen.getByRole('button', { name: /Generate suggestion/ })).not.toBeDisabled();
  });
});
