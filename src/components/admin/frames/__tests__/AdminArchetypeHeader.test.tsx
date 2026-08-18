/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AdminArchetypeHeader } from '../AdminArchetypeHeader';

const at = (path: string, ui: React.ReactNode) =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe('AdminArchetypeHeader', () => {
  it('derives the route line from the registry, not from a prop', () => {
    // Typing the line by hand is how it drifts from the frame the page really
    // renders in. Deriving it means the two cannot disagree.
    at('/admin/automation', <AdminArchetypeHeader title="Automations" />);
    expect(screen.getByText('H · REGISTRY — /admin/automation')).toBeInTheDocument();
  });

  it('emits no route line for an unregistered or exempt route', () => {
    // Better a missing locator than a confidently wrong one.
    const { container } = at('/admin/design', <AdminArchetypeHeader title="Design" />);
    expect(container.textContent).not.toMatch(/·\s+[A-Z ]+—/);
  });

  it('renders the four parts of the grammar in one block', () => {
    at(
      '/admin/content/venues',
      <AdminArchetypeHeader
        title="Venues"
        filters={<button type="button">Open now</button>}
        actions={<button type="button">Add venue</button>}
      />,
    );
    const header = screen.getByRole('banner');
    expect(header).toHaveTextContent('A · INDEX — /admin/content/venues');
    expect(header).toHaveTextContent('Venues');
    // The filter row belongs INSIDE the header, not beside it — the design
    // document lists it as part of the grammar, and every archetype that
    // filters must put it in the same place.
    expect(header.querySelector('button')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add venue' })).toBeInTheDocument();
  });

  it('gives the page exactly one h1', () => {
    at('/admin/inbox', <AdminArchetypeHeader title="Inbox" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('accepts an explicit route line for a record whose identity is not the URL', () => {
    at(
      '/admin/business/abc',
      <AdminArchetypeHeader title="SchwuZ" routeLine="B · RECORD EDITOR — SchwuZ" />,
    );
    expect(screen.getByText('B · RECORD EDITOR — SchwuZ')).toBeInTheDocument();
  });

  it('keeps the title on the display face at headline rank', () => {
    // Rank 3. `rankFourFace.test.ts` forbids a display face at rank 4, so an
    // admin title that drifted down to text-title would take Anton with it.
    at('/admin/users', <AdminArchetypeHeader title="Users" />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.className).toContain('font-display');
    expect(h1.className).toContain('text-headline');
  });
});
