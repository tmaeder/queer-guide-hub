import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { FestivalCard } from '../FestivalCard';

function makeFestival(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f-1',
    name: 'Zurich Pride',
    festival_type: 'pride',
    start_date: '2024-06-15',
    end_date: '2024-06-16',
    description: 'Annual pride festival in Zurich',
    featured: false,
    is_recurring: false,
    images: null,
    cities: { name: 'Zurich' },
    countries: { name: 'Switzerland' },
    ...overrides,
  };
}

describe('FestivalCard', () => {
  it('should render festival name', () => {
    render(
      <MemoryRouter>
        <FestivalCard festival={makeFestival() as unknown as React.ComponentProps<typeof FestivalCard>['festival']} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Zurich Pride')).toBeInTheDocument();
  });

  it('should render type chip', () => {
    render(
      <MemoryRouter>
        <FestivalCard festival={makeFestival() as unknown as React.ComponentProps<typeof FestivalCard>['festival']} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Pride')).toBeInTheDocument();
  });

  it('should render location', () => {
    render(
      <MemoryRouter>
        <FestivalCard festival={makeFestival() as unknown as React.ComponentProps<typeof FestivalCard>['festival']} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Zurich, Switzerland')).toBeInTheDocument();
  });

  it('should render description', () => {
    render(
      <MemoryRouter>
        <FestivalCard festival={makeFestival() as unknown as React.ComponentProps<typeof FestivalCard>['festival']} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Annual pride festival in Zurich')).toBeInTheDocument();
  });

  it('should show Featured badge when featured', () => {
    render(
      <MemoryRouter>
        <FestivalCard festival={makeFestival({ featured: true }) as unknown as React.ComponentProps<typeof FestivalCard>['festival']} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Featured')).toBeInTheDocument();
  });

  it('should show Recurring chip when recurring', () => {
    render(
      <MemoryRouter>
        <FestivalCard festival={makeFestival({ is_recurring: true }) as unknown as React.ComponentProps<typeof FestivalCard>['festival']} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Recurring')).toBeInTheDocument();
  });

  it('should show Dates TBA when no start_date', () => {
    render(
      <MemoryRouter>
        <FestivalCard festival={makeFestival({ start_date: null }) as unknown as React.ComponentProps<typeof FestivalCard>['festival']} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Dates TBA')).toBeInTheDocument();
  });

  it('should link to festival detail page', () => {
    render(
      <MemoryRouter>
        <FestivalCard festival={makeFestival() as unknown as React.ComponentProps<typeof FestivalCard>['festival']} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/festivals/f-1');
  });
});
