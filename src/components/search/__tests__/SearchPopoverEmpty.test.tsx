/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultOrVars?: string | Record<string, unknown>) =>
      typeof defaultOrVars === 'string' ? defaultOrVars : key,
  }),
}));

vi.mock('@/hooks/useUserMode', () => ({
  useUserMode: () => ({ mode: 'community', setMode: vi.fn() }),
}));

import { SearchPopoverEmpty } from '../SearchPopoverEmpty';
import { USER_MODES } from '@/config/navigation';
import type { SearchHit } from '@/lib/searchClient';

const trending: SearchHit[] = [
  { id: '1', type: 'venue', title: 'Berghain', city: 'Berlin' } as SearchHit,
  { id: '2', type: 'event', title: 'Pride Zurich', city: 'Zurich' } as SearchHit,
];

function renderEmpty(overrides: Partial<React.ComponentProps<typeof SearchPopoverEmpty>> = {}) {
  const props = {
    trending,
    onSelectTrending: vi.fn(),
    onBrowse: vi.fn(),
    onAsk: vi.fn(),
    ...overrides,
  };
  render(<SearchPopoverEmpty {...props} />);
  return props;
}

describe('SearchPopoverEmpty', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders no map peek', () => {
    renderEmpty();
    expect(screen.queryByText(/Explore the map/)).toBeNull();
    expect(screen.queryByText(/Near me/)).toBeNull();
  });

  it('fires onSelectTrending from a trending tile', () => {
    const props = renderEmpty();
    fireEvent.click(screen.getByText('Berghain'));
    expect(props.onSelectTrending).toHaveBeenCalledWith(trending[0]);
  });

  it('renders the compact mode radiogroup with one radio per mode', () => {
    renderEmpty();
    expect(screen.getAllByRole('radio')).toHaveLength(USER_MODES.length);
  });

  it('keeps the map reachable via the browse grid', () => {
    const props = renderEmpty();
    fireEvent.click(screen.getByText('header.nav.map'));
    expect(props.onBrowse).toHaveBeenCalledWith('/map');
  });

  it('fires onAsk from the ask-the-guide row', () => {
    const props = renderEmpty();
    fireEvent.click(screen.getByText('Ask the guide a question'));
    expect(props.onAsk).toHaveBeenCalled();
  });

  it('renders recents and clears them', () => {
    const props = renderEmpty({
      recents: ['gay bar berlin'],
      onSelectRecent: vi.fn(),
      onClearRecents: vi.fn(),
    });
    fireEvent.click(screen.getByText('gay bar berlin'));
    expect(props.onSelectRecent).toHaveBeenCalledWith('gay bar berlin');
    fireEvent.click(screen.getByLabelText('Clear'));
    expect(props.onClearRecents).toHaveBeenCalled();
  });
});
