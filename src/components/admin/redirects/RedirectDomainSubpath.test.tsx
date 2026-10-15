import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectDomainSubpath } from './RedirectDomainSubpath';
const clipboard = vi.fn();
beforeEach(() => {
  clipboard.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboard },
  });
});
function show(ready = true) {
  const view = render(<RedirectDomainSubpath hostname="links.example.com" ready={ready} />);
  fireEvent.click(screen.getByText('Use under a website path'));
  fireEvent.change(screen.getByLabelText('Existing website origin'), {
    target: { value: 'https://example.com' },
  });
  return view;
}
describe('website subpath setup controls', () => {
  it('gates generation on live routing readiness', () => {
    show(false);
    expect(screen.getByRole('button', { name: 'Generate website configuration' })).toBeDisabled();
    expect(screen.getByText(/Verify ownership, TLS and branded routing/)).toBeVisible();
  });
  it('generates a concrete mapping, copies it and discards stale platform/path output', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Generate website configuration' }));
    expect(screen.getByText('https://example.com/r/community?utm_source=website')).toBeVisible();
    const configuration = (screen.getByLabelText('worker.js configuration') as HTMLTextAreaElement)
      .value;
    fireEvent.click(screen.getByRole('button', { name: 'Copy website configuration' }));
    await waitFor(() => expect(clipboard).toHaveBeenCalledWith(configuration));
    expect(await screen.findByRole('status')).toHaveTextContent('Install and test');
    fireEvent.change(screen.getByLabelText('Website hosting'), { target: { value: 'netlify' } });
    expect(
      screen.queryByRole('button', { name: 'Copy website configuration' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generate website configuration' }));
    expect(screen.getByLabelText('_redirects configuration')).toHaveValue(
      '/r https://links.example.com/ 302!\n/r/* https://links.example.com/:splat 302!\n',
    );
    fireEvent.change(screen.getByLabelText('Website path prefix'), { target: { value: '/api' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate website configuration' }));
    expect(screen.getByRole('alert')).toHaveTextContent('non-root path');
    expect(
      screen.queryByRole('button', { name: 'Copy website configuration' }),
    ).not.toBeInTheDocument();
  });
  it('clears generated setup when routing becomes unavailable and provides clipboard fallback', async () => {
    const view = show();
    fireEvent.click(screen.getByRole('button', { name: 'Generate website configuration' }));
    clipboard.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy website configuration' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Select and copy');
    view.rerender(<RedirectDomainSubpath hostname="links.example.com" ready={false} />);
    expect(
      screen.queryByRole('button', { name: 'Copy website configuration' }),
    ).not.toBeInTheDocument();
  });
});
