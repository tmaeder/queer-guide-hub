import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { BreadcrumbBar } from '../BreadcrumbBar';
import { BreadcrumbProvider, useBreadcrumbs } from '@/contexts/BreadcrumbContext';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

function renderBar(pathname: string, publisher?: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <BreadcrumbProvider>
        {publisher}
        <BreadcrumbBar />
      </BreadcrumbProvider>
    </MemoryRouter>,
  );
}

function LongTrailPublisher() {
  useBreadcrumbs([
    { label: 'Switzerland', href: '/country/switzerland' },
    { label: 'Zurich', href: '/city/zurich' },
    { label: 'Nightlife', href: '/going-out' },
    { label: 'Example club' },
  ]);
  return null;
}

describe('BreadcrumbBar route stops', () => {
  it('renders route-linked ancestors and a terminal current station without chevrons', () => {
    const { container } = renderBar('/going-out');

    expect(screen.getByTestId('breadcrumb-route')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-track')).toHaveClass('route-network-rail__track--pink');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Going out').closest('[aria-current]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(container.querySelectorAll('[data-breadcrumb-stop]')).toHaveLength(2);
    expect(container.querySelector('.lucide-chevron-right')).not.toBeInTheDocument();
  });

  it('keeps collapsed intermediate stops reachable from an overflow station', async () => {
    const user = userEvent.setup();
    const { container } = renderBar('/venues/example-club', <LongTrailPublisher />);

    expect((await screen.findByText('Example club')).closest('[aria-current]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByTestId('breadcrumb-overflow')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show the levels above' }));
    expect(screen.getByRole('menuitem', { name: 'Switzerland' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Zurich' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Nightlife' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-breadcrumb-stop]')).toHaveLength(5);
  });
});
