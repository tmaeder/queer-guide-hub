import { externalDestination } from '@/lib/externalDestination';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ExternalNavigationNotice } from '../ExternalNavigationNotice';
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, value: string) => value }),
}));

describe('external navigation notice', () => {
  it('only intercepts external website destinations', () => {
    expect(
      externalDestination('https://other.example/place', 'https://queer.guide')?.hostname,
    ).toBe('other.example');
    for (const href of [
      '/city/paris',
      'https://queer.guide/hub',
      'tel:+33142661217',
      'mailto:hello@example.com',
      'javascript:alert(1)',
    ]) {
      expect(externalDestination(href, 'https://queer.guide')).toBeNull();
    }
  });
  it('shows the destination, cancels without navigation, and preserves new-tab intent', () => {
    render(
      <MemoryRouter>
        <ExternalNavigationNotice />
        <a href="https://other.example/place" target="_blank">
          Visit place
        </a>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Visit place'));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('other.example');
    expect(screen.getByRole('link', { name: 'Open website' })).toHaveAttribute('target', '_blank');
    fireEvent.click(screen.getByRole('button', { name: 'Stay here' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('keeps emergency quick-exit navigation immediate', () => {
    render(
      <MemoryRouter>
        <ExternalNavigationNotice />
        <a data-external-notice="skip" href="https://other.example">
          Exit
        </a>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Exit'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
