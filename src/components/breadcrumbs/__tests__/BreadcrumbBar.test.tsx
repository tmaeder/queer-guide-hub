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
    expect(container.querySelector('[data-icon="chevron-right"]')).not.toBeInTheDocument();
  });

  it.each([
    ['/tags', 'pink'],
    ['/de/tags/c/health', 'pink'],
    ['/news', 'blue'],
    ['/fr/news/all', 'blue'],
    ['/marketplace', 'yellow'],
  ])('uses the navigation track colour for %s', (pathname, colour) => {
    renderBar(pathname);

    expect(screen.getByTestId('breadcrumb-track')).toHaveClass(
      `route-network-rail__track--${colour}`,
    );
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

function RepeatedLabelPublisher() {
  useBreadcrumbs([
    { label: 'Glossary', href: '/tags' },
    { label: 'Consent', href: '/tags/c/consent' },
    { label: 'Consent' },
  ]);
  return null;
}

describe('BreadcrumbBar JSON-LD', () => {
  const ldTrails = () =>
    [...document.head.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent || '{}'))
      .filter((o) => o['@type'] === 'BreadcrumbList');

  it('replaces the edge BreadcrumbList with its own, so the page has one', () => {
    const edge = document.createElement('script');
    edge.type = 'application/ld+json';
    edge.dataset.qgEdge = '/city/zurich/club';
    edge.textContent = JSON.stringify({ '@type': 'BreadcrumbList', itemListElement: [] });
    document.head.appendChild(edge);

    renderBar('/city/zurich/club', <LongTrailPublisher />);

    const trails = ldTrails();
    expect(trails).toHaveLength(1);
    expect(trails[0].itemListElement.length).toBeGreaterThan(1);
  });

  it('drops a crumb that repeats the next crumb’s label', () => {
    renderBar('/tags/consent', <RepeatedLabelPublisher />);
    expect(screen.getAllByText('Consent')).toHaveLength(1);
  });
});
