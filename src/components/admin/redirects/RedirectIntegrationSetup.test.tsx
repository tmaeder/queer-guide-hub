import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RedirectIntegrationSetup } from './RedirectIntegrationSetup';
vi.mock('./RedirectIntegrationInstallations', () => ({
  RedirectIntegrationInstallations: () => null,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'fixture-owner' } }) }));
vi.mock('./RedirectWebhooks', () => ({
  RedirectWebhookCreate: ({ preset }: { preset: { url: string; includeCustomerId: boolean } }) => (
    <div role="status">
      Review {preset.url} · {preset.includeCustomerId ? 'Customer IDs enabled' : 'Anonymous events'}
    </div>
  ),
}));
describe('native integration setup', () => {
  it('offers both Segment directions and explicit subscription review', () => {
    const view = render(<RedirectIntegrationSetup />);
    expect(screen.getByRole('link', { name: 'Download Segment destination' })).toHaveAttribute(
      'href',
      '/integrations/redirects/segment-destination.js',
    );
    expect(screen.getByRole('link', { name: 'Download Segment source' })).toHaveAttribute(
      'href',
      '/integrations/redirects/segment-source.js',
    );
    fireEvent.change(screen.getByLabelText('Segment Source Function HTTPS URL'), {
      target: { value: 'https://receiver.example.org/segment' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review outbound subscription' }));
    expect(screen.getByRole('status')).toHaveTextContent('Anonymous events');
    expect(
      screen.getByText('Installation status: awaiting provider verification.'),
    ).toBeInTheDocument();
    view.unmount();
  });
  it('rejects credentials in source URLs and keeps private server keys out of the form', () => {
    const view = render(<RedirectIntegrationSetup />);
    fireEvent.change(screen.getByLabelText('Segment Source Function HTTPS URL'), {
      target: { value: 'https://user:secret@example.org' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review outbound subscription' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Google Tag Manager' }));
    expect(screen.getByRole('link', { name: 'Download Google server template' })).toHaveAttribute(
      'href',
      '/integrations/redirects/google-server-conversions.tpl',
    );
    expect(
      screen.getByRole('link', { name: 'Download browser attribution helper' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    view.unmount();
  });
});
