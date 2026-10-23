import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrganizationLocationCell, OrganizationWebsiteCell } from '../organizationListCells';
import { toWebsiteHref } from '@/lib/websiteHref';
import { organizationContentType } from '../organization';

describe('organization list cells', () => {
  it('shows the city name with its region code', () => {
    render(
      <OrganizationLocationCell
        row={{ cities: { name: 'Basel', region_code: 'CH-BS' }, countries: { code: 'CH' } }}
      />,
    );
    expect(screen.getByText('Basel')).toBeInTheDocument();
    expect(screen.getByText('CH-BS')).toBeInTheDocument();
    // The region code already names the country.
    expect(screen.queryByText('CH')).toBeNull();
  });

  it('shows the country and a missing-region chip when the city has no region code', () => {
    render(
      <OrganizationLocationCell
        row={{ cities: { name: 'Itu', region_code: null }, countries: [{ code: 'br' }] }}
      />,
    );
    expect(screen.getByText('Itu')).toBeInTheDocument();
    expect(screen.getByText('BR')).toBeInTheDocument();
    expect(screen.getByText('no region')).toBeInTheDocument();
  });

  it('renders nothing with neither city nor country', () => {
    const { container } = render(<OrganizationLocationCell row={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the website as an external icon link', () => {
    render(<OrganizationWebsiteCell row={{ website: 'https://example.org' }} />);
    const link = screen.getByRole('link', { name: 'Open website: https://example.org' });
    expect(link).toHaveAttribute('href', 'https://example.org');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).not.toHaveTextContent(/\S/);
  });

  it('renders no link without a website', () => {
    const { container } = render(<OrganizationWebsiteCell row={{ website: '  ' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('adds a scheme to a schemeless website', () => {
    expect(toWebsiteHref('example.org')).toBe('https://example.org');
    expect(toWebsiteHref('HTTP://x.y')).toBe('HTTP://x.y');
    expect(toWebsiteHref(null)).toBeNull();
  });

  it('wires the cells into the list config', () => {
    expect(organizationContentType.listSelect).toBe('*,cities(name,region_code),countries(code)');
    const cols = organizationContentType.fields.filter((f) => f.listColumn).map((f) => f.name);
    expect(cols).toEqual(expect.arrayContaining(['location', 'website_link']));
    expect(cols).not.toContain('website_domain');
  });
});
