import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CityIdentityContext } from '../CityIdentityContext';
import { cityResearchExplanation } from '../reviewEvidence';

const counts = {
  venues: 0,
  events: 0,
  organizations: 0,
  hotels: 0,
  neighbourhoods: 0,
  child_places: 0,
  news_articles: 0,
  birthplaces: 0,
  death_places: 0,
  festivals: 0,
  guides: 0,
  milestones: 0,
  competition_editions: 0,
  competition_entrants: 0,
  saved_and_private_links: 0,
};
const city = {
  name: 'Salem',
  region_name: 'Wisconsin',
  country: 'United States',
  latitude: '43.314830',
  longitude: '-88.270368',
  shell_status: 'real',
  seo_indexable: true,
  source_coordinates: { lat: 44.94, lng: -123.03888889 },
  retracted_identity: {
    qid: 'Q43919',
    title: 'Salem, Oregon',
    reason: 'Identifier describes a different US state',
  },
  relationship_counts: { ...counts, birthplaces: 3, news_articles: 3 },
  classification: {
    reason: 'No corroborated settlement classification',
    sources: ['javascript:alert(1)'],
  },
  geography: {
    status: 'review',
    sources: [{ title: 'Country boundary evidence', url: 'https://example.test/boundaries' }],
  },
  official_website: 'javascript:alert(1)',
};
describe('city identity decision context', () => {
  it('shows captured source links and distinguishes a capture from a verified match', () => {
    const research = {
      reason: 'missing_source',
      evidence: [
        {
          url: 'https://gazetteer.example/places/123',
          retrieved_at: '2026-11-07T10:00:00Z',
          text: 'Official place-name evidence.',
        },
        { url: 'javascript:alert(1)', text: 'Unsafe source' },
      ],
    };
    render(<CityIdentityContext value={city} research={research} />);
    const sources = screen.getByRole('region', { name: 'Sources opened during research' });
    expect(within(sources).getByRole('link', { name: 'Open gazetteer.example' })).toHaveAttribute(
      'href',
      'https://gazetteer.example/places/123',
    );
    expect(sources.querySelector('time')).toHaveAttribute('datetime', '2026-11-07T10:00:00.000Z');
    expect(within(sources).getByText('Read captured text').closest('details')).not.toHaveAttribute(
      'open',
    );
    expect(within(sources).queryByText('Unsafe source')).not.toBeInTheDocument();
    expect(cityResearchExplanation(research)).toContain('still needs evidence');
    expect(cityResearchExplanation({ reason: 'missing_source_url' })).toContain('no source link');
  });

  it('puts the stored identity, source conflict and non-venue relationships on the page', () => {
    render(<CityIdentityContext value={city} />);
    const context = screen.getByRole('region', { name: 'Current city identity' });
    expect(within(context).getByText('Wisconsin · United States')).toBeInTheDocument();
    expect(within(context).getByText('43.31483, -88.27037')).toBeInTheDocument();
    expect(within(context).getByText('People’s birthplaces')).toBeInTheDocument();
    expect(within(context).getByText('News articles')).toBeInTheDocument();
    expect(
      within(context).getByRole('note', { name: 'Conflicting identity evidence' }),
    ).toHaveTextContent('Salem, Oregon');
    expect(within(context).getByText('No Wikidata identifier')).toBeInTheDocument();
    expect(within(context).getByText('Geography: Review needed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inspect retracted Wikidata Q43919' })).toHaveAttribute(
      'href',
      'https://www.wikidata.org/wiki/Q43919',
    );
    expect(screen.getByRole('link', { name: 'Country boundary evidence' })).toHaveAttribute(
      'href',
      'https://example.test/boundaries',
    );
    expect(screen.queryByRole('link', { name: 'Stored official website' })).not.toBeInTheDocument();
    expect([...context.querySelectorAll('a')].every((a) => a.href.startsWith('https://'))).toBe(
      true,
    );
  });
  it('shows the recorded place types separately from the country check', () => {
    const { rerender } = render(
      <CityIdentityContext
        value={{
          ...city,
          classification: {
            status: 'unresolved',
            classes: ['administrative district', null, 'administrative district'],
          },
          geography: { checks: { country_match: true } },
        }}
      />,
    );
    expect(screen.getByText('Recorded place types: administrative district')).toBeInTheDocument();
    expect(screen.getByText('The coordinates match the assigned country.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Confirm whether the source identifies a city, town, or village at these coordinates.',
      ),
    ).toBeInTheDocument();
    rerender(
      <CityIdentityContext
        value={{
          ...city,
          classification: { status: 'unresolved', classes: [] },
          geography: { checks: { country_match: false } },
        }}
      />,
    );
    expect(screen.getByText('The available sources record no place type.')).toBeInTheDocument();
    expect(
      screen.getByText('The coordinates conflict with the assigned country.'),
    ).toBeInTheDocument();
  });

  it('distinguishes unavailable relationships from a fully checked empty place', () => {
    const { rerender } = render(
      <CityIdentityContext
        value={{ name: 'Example', relationship_counts: { venues: 0, events: 0 } }}
      />,
    );
    expect(screen.getByText('Relationship counts are unavailable.')).toBeInTheDocument();
    expect(screen.queryByText('No relationships are currently recorded.')).not.toBeInTheDocument();
    rerender(<CityIdentityContext value={{ name: 'Example', relationship_counts: counts }} />);
    expect(screen.getByText('No relationships are currently recorded.')).toBeInTheDocument();
    expect(screen.queryByText('Relationship counts are unavailable.')).not.toBeInTheDocument();
  });
  it('identifies a remaining lifecycle decision only when the place and coordinates are verified', () => {
    const checks = {
      country_match: true,
      identity_verified: true,
      coordinates_verified: true,
      official_commune_code: '13004',
    };
    const placeholder = {
      name: 'Arles',
      shell_status: 'placeholder',
      geography: { status: 'verified', checks },
    };
    const { rerender } = render(<CityIdentityContext value={placeholder} />);
    expect(screen.getByRole('note', { name: 'Lifecycle decision' })).toHaveTextContent(
      'Place identity verified. Lifecycle decision remains.',
    );
    expect(screen.getByText('13004')).toBeInTheDocument();
    rerender(
      <CityIdentityContext
        value={{ ...placeholder, geography: { status: 'country_checked', checks } }}
      />,
    );
    expect(screen.queryByRole('note', { name: 'Lifecycle decision' })).not.toBeInTheDocument();
    expect(screen.getByText('Geography: Country checked')).toBeInTheDocument();
  });
  it('does not interpret missing or malformed coordinates as zero or make unsafe identifier links', () => {
    const { rerender } = render(
      <CityIdentityContext
        value={{
          name: 'Example',
          latitude: null,
          longitude: false,
          wikidata_qid: 'Q123/javascript',
        }}
      />,
    );
    expect(
      screen.queryByRole('link', { name: 'Open stored coordinates on map' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Wikidata/ })).not.toBeInTheDocument();
    rerender(
      <CityIdentityContext
        value={{ name: 'Example', latitude: '0', longitude: '8', wikidata_qid: 'Q123' }}
      />,
    );
    expect(screen.getByText('0.00000, 8.00000')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wikidata Q123' })).toBeInTheDocument();
  });
  it('shows a useful missing-context state for older or failed responses', () => {
    render(<CityIdentityContext value={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('Refresh the evidence before deciding');
  });
});
