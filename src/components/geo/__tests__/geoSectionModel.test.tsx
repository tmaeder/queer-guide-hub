/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import { geoSections, geoStations } from '../geoSectionModel';
import { GeoSectionList, GeoRouteRail } from '../GeoSections';

describe('geoSections', () => {
  it('drops every falsy content shape the pages actually produce', () => {
    const kept = geoSections([
      { id: 'a', title: 'A', content: <p>real</p> },
      { id: 'b', title: 'B', content: null },
      { id: 'c', title: 'C', content: undefined },
      { id: 'd', title: 'D', content: false },
      { id: 'e', title: 'E', content: [] },
      null,
      false,
      undefined,
    ]);
    expect(kept.map((s) => s.id)).toEqual(['a']);
  });

  it('keeps a zero — a rendered "0" is a fact, not an absence', () => {
    const kept = geoSections([{ id: 'a', title: 'A', content: 0 }]);
    expect(kept).toHaveLength(1);
  });
});

describe('the station/section invariant', () => {
  // This is the whole reason the model is shared rather than a convention: a
  // station that scrolls to a section which self-hid is a dead stop on the
  // line, and the two lists are derived from the same filtered array so that
  // is unrepresentable.
  const defs = [
    { id: 'rights', title: 'Safety & rights', content: <p>rights</p> },
    { id: 'events', title: 'Next departures', content: null },
    { id: 'news', title: 'In the news', content: <p>news</p> },
  ];

  it('stations and rendered sections agree exactly', () => {
    const sections = geoSections(defs);
    expect(geoStations(sections).map((s) => s.id)).toEqual(sections.map((s) => s.id));
    expect(geoStations(sections).map((s) => s.id)).toEqual(['rights', 'news']);
  });

  it('every station has a heading with a matching id in the DOM', () => {
    const sections = geoSections(defs);
    renderWithProviders(
      <>
        <GeoRouteRail
          sections={sections}
          activeId="rights"
          onNavigate={() => {}}
          orientation="vertical"
          label="Sections"
        />
        <GeoSectionList sections={sections} />
      </>,
    );
    for (const station of geoStations(sections)) {
      const link = screen.getByRole('link', { name: new RegExp(station.title) });
      expect(link).toHaveAttribute('href', `#${station.id}`);
      expect(document.getElementById(station.id)).not.toBeNull();
    }
    expect(document.getElementById('events')).toBeNull();
  });
});

describe('GeoRouteRail', () => {
  it('renders nothing for a one-stop line', () => {
    const { container } = renderWithProviders(
      <GeoRouteRail
        sections={geoSections([{ id: 'a', title: 'A', content: <p>x</p> }])}
        activeId="a"
        onNavigate={() => {}}
        orientation="vertical"
        label="Sections"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('uses anchors, not buttons — so a section is linkable and middle-clickable', () => {
    renderWithProviders(
      <GeoRouteRail
        sections={geoSections([
          { id: 'a', title: 'A', content: <p>x</p> },
          { id: 'b', title: 'B', content: <p>y</p> },
        ])}
        activeId="a"
        onNavigate={() => {}}
        orientation="vertical"
        label="Sections"
      />,
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
