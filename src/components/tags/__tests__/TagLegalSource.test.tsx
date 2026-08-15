import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { TagLegalSource } from '../TagLegalSource';
import type { TagLegalSourceRow } from '@/hooks/usePageFetchers';

const source = (over: Partial<TagLegalSourceRow> = {}): TagLegalSourceRow => ({
  id: 's1',
  source_type: 'statute',
  source_url: 'https://ulii.org/akn/ug/act/2023/1',
  official_title: 'The Anti-Homosexuality Act, 2023',
  jurisdiction: 'UG',
  adopted_year: 2023,
  instrument_status: 'in_force',
  claim_summary: null,
  verified_at: null,
  ...over,
});

describe('TagLegalSource', () => {
  it('renders nothing for an ordinary tag with no sources and no rights topic', () => {
    const { container } = renderWithProviders(<TagLegalSource sources={[]} tagSlug="bear-bar" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a cited instrument with its title, jurisdiction, year and status', () => {
    renderWithProviders(
      <TagLegalSource sources={[source()]} tagSlug="uganda-anti-homosexuality-act" />,
    );
    const link = screen.getByRole('link', { name: /Anti-Homosexuality Act, 2023/ });
    expect(link).toHaveAttribute('href', 'https://ulii.org/akn/ug/act/2023/1');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('UG')).toBeInTheDocument();
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('In force')).toBeInTheDocument();
  });

  it('labels a repealed instrument as repealed', () => {
    // A repeal date is not decoration: "adopted 1993" with no repeal marker is a
    // wrong claim about what the law is today.
    renderWithProviders(
      <TagLegalSource
        sources={[source({ instrument_status: 'repealed' })]}
        tagSlug="don-t-ask-don-t-tell"
      />,
    );
    expect(screen.getByText('Repealed')).toBeInTheDocument();
  });

  it('spells out INT rather than printing the code', () => {
    renderWithProviders(
      <TagLegalSource
        sources={[source({ jurisdiction: 'INT', source_type: 'treaty' })]}
        tagSlug="convention-on-the-rights-of-the-child"
      />,
    );
    expect(screen.getByText('International')).toBeInTheDocument();
  });

  it('skips a malformed row instead of rendering a bare URL under "Source of law"', () => {
    const { container } = renderWithProviders(
      <TagLegalSource sources={[source({ official_title: null })]} tagSlug="bear-bar" />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('tells a class-of-law tag it is not one law and links the per-country ledger', () => {
    renderWithProviders(<TagLegalSource sources={[]} tagSlug="marriage-equality" />);
    expect(screen.getByText(/not a single law/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See status by country/i })).toHaveAttribute(
      'href',
      '/rights#marriage',
    );
    // The claim has to carry its source, same as every other rights surface.
    expect(screen.getByRole('link', { name: /ILGA World Database/i })).toBeInTheDocument();
  });

  it('renders the citation before the per-country fallback when both apply', () => {
    const { container } = renderWithProviders(
      <TagLegalSource
        sources={[source({ official_title: 'Marriage Act 2013' })]}
        tagSlug="marriage-equality"
      />,
    );
    const card = container.querySelector('section') as HTMLElement;
    const text = within(card).getByText(/not a single law/i);
    const cite = within(card).getByRole('link', { name: /Marriage Act 2013/ });
    // Node.compareDocumentPosition: 4 === the argument follows the reference node.
    expect(cite.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('TagLegalSource — whole-field tags', () => {
  it('tells an umbrella tag it spans the whole corpus, not one right', () => {
    renderWithProviders(<TagLegalSource sources={[]} tagSlug="lgbtqia-rights" />);
    expect(screen.getByText(/whole field of law/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See all 18 rights by country/i })).toHaveAttribute(
      'href',
      '/rights',
    );
    // Must NOT also claim to be a single right — that is the contradiction the
    // umbrella branch exists to avoid.
    expect(screen.queryByText(/not a single law/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ILGA World Database/i })).toBeInTheDocument();
  });

  it('links the /rights index, never a topic anchor', () => {
    renderWithProviders(<TagLegalSource sources={[]} tagSlug="transgender-rights" />);
    const link = screen.getByRole('link', { name: /See all 18 rights by country/i });
    expect(link.getAttribute('href')).not.toContain('#');
  });
});
