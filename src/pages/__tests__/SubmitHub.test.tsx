/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { navigateFn, useAuthMock, flyerScanMock } = vi.hoisted(() => ({
  navigateFn: vi.fn(),
  useAuthMock: vi.fn(),
  flyerScanMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigateFn }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/useFlyerScan', () => ({ useFlyerScan: flyerScanMock }));
vi.mock('@/components/submission/FlyerScanUpload', () => ({
  FlyerScanUpload: ({ onUrlSubmit }: { onUrlSubmit?: (u: string) => void }) => (
    <div data-testid="scan-hero">{onUrlSubmit ? 'url-enabled' : 'no-url'}</div>
  ),
}));
vi.mock('@/components/submission/FlyerScanResults', () => ({
  FlyerScanResults: () => <div data-testid="scan-results" />,
}));
vi.mock('@/config/submissionRegistry', () => ({
  primarySubmissionTypes: [
    { id: 'event', label: 'Event', description: 'desc', icon: () => null, color: '#000', group: 'primary' },
    { id: 'venue', label: 'Venue', description: 'desc', icon: () => null, color: '#000', group: 'primary' },
    { id: 'product', label: 'Product', description: 'desc', icon: () => null, color: '#000', group: 'primary' },
  ],
  moreSubmissionTypes: [
    { id: 'news', label: 'News article', description: 'desc', icon: () => null, color: '#000', group: 'more' },
    { id: 'tag', label: 'Tag', description: 'desc', icon: () => null, color: '#000', group: 'more' },
  ],
}));

import SubmitHub from '../SubmitHub';

beforeEach(() => {
  navigateFn.mockReset();
  useAuthMock.mockReset();
  flyerScanMock.mockReset();
  flyerScanMock.mockReturnValue({
    scanState: 'idle',
    results: [],
    error: null,
    currentFileIndex: 0,
    totalFiles: 0,
    startScan: vi.fn(),
    startUrlScan: vi.fn(),
    reset: vi.fn(),
    applyToForm: vi.fn(),
  });
});

describe('SubmitHub', () => {
  it('renders sign-in prompt and no scan hero when signed-out', () => {
    useAuthMock.mockReturnValue({ user: null });
    render(<SubmitHub />);
    expect(screen.getByText(/An account lets you scan a flyer/)).toBeInTheDocument();
    expect(screen.queryByTestId('scan-hero')).toBeNull();
  });

  it('shows the scan hero (with link paste) when signed-in', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    render(<SubmitHub />);
    const hero = screen.getByTestId('scan-hero');
    expect(hero).toBeInTheDocument();
    expect(hero).toHaveTextContent('url-enabled');
    expect(screen.queryByText(/Sign in or create/)).toBeNull();
  });

  it('renders the three primary type cards', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    render(<SubmitHub />);
    expect(screen.getByText(/Submit Event/)).toBeInTheDocument();
    expect(screen.getByText(/Submit Venue/)).toBeInTheDocument();
    expect(screen.getByText(/Submit Product/)).toBeInTheDocument();
  });

  it('tucks niche types behind a More disclosure', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    render(<SubmitHub />);
    expect(screen.getByText(/More ways to contribute/)).toBeInTheDocument();
    expect(screen.getByText(/Submit News article/)).toBeInTheDocument();
  });

  it('navigates to the type form on card click', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    render(<SubmitHub />);
    fireEvent.click(screen.getByText(/Submit Event/));
    expect(navigateFn).toHaveBeenCalledWith('/submit/event');
  });
});
