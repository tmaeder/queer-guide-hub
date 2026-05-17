import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultOrVars?: string | Record<string, unknown>) =>
      typeof defaultOrVars === 'string' ? defaultOrVars : key,
  }),
}));

import { LoadMoreSentinel } from '../LoadMoreSentinel';

describe('LoadMoreSentinel', () => {
  it('renders nothing when hasMore is false', () => {
    const { container } = render(
      <LoadMoreSentinel hasMore={false} loading={false} onLoadMore={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows a Load more button and fires onLoadMore on click', () => {
    const onLoadMore = vi.fn();
    render(<LoadMoreSentinel hasMore loading={false} onLoadMore={onLoadMore} />);
    const btn = screen.getByRole('button', { name: /Load more/i });
    fireEvent.click(btn);
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('shows a loading state and disables the button while loading', () => {
    render(<LoadMoreSentinel hasMore loading onLoadMore={() => {}} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
