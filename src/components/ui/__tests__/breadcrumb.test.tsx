import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

describe('breadcrumb primitive', () => {
  it('renders a labelled nav with a current page and a link', () => {
    const { getByRole, getByText } = render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/venues">Venues</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>The Bar</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );
    expect(getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy();
    const link = getByText('Venues').closest('a');
    expect(link?.getAttribute('href')).toBe('/venues');
    expect(getByText('The Bar').getAttribute('aria-current')).toBe('page');
  });

  it('marks the separator as presentational/hidden', () => {
    const { container } = render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Only</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
        </BreadcrumbList>
      </Breadcrumb>,
    );
    const sep = container.querySelector('[role="presentation"]');
    expect(sep?.getAttribute('aria-hidden')).toBe('true');
  });
});
