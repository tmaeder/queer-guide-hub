/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { MapNotice } from '../chrome/MapNotice';

const base = {
  count: 0,
  ready: true,
  settled: true,
  hasPointLayers: true,
  filters: {},
  locationHint: null,
};

beforeEach(() => {
  localStorage.clear();
});

describe('MapNotice — the empty state is a claim about the data', () => {
  it('stays silent before the first fetch has completed', () => {
    // The regression this guards: on a cold load `ready` is already true (no
    // fetch is in flight yet) and the feed is empty, so a gate of
    // `ready && count === 0` announces "No spots here yet" about an area the
    // map has not looked at. `settled` is what makes the claim honest.
    render(<MapNotice {...base} settled={false} />);
    expect(screen.queryByText(/No spots here yet/i)).not.toBeInTheDocument();
  });

  it('stays silent while a fetch is in flight', () => {
    render(<MapNotice {...base} ready={false} />);
    expect(screen.queryByText(/No spots here yet/i)).not.toBeInTheDocument();
  });

  it('says it plainly once the map has looked and found nothing', () => {
    render(<MapNotice {...base} />);
    expect(screen.getByText(/No spots here yet/i)).toBeInTheDocument();
  });

  it('never claims empty when every line is switched off', () => {
    // "pan, zoom out" is the wrong advice here — panning cannot help, and the
    // map has not established that the area is empty.
    render(<MapNotice {...base} hasPointLayers={false} />);
    expect(screen.queryByText(/No spots here yet/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Every line is switched off/i)).toBeInTheDocument();
  });

  it('blames the filter that is actually responsible', () => {
    const { rerender } = render(<MapNotice {...base} filters={{ openNow: true }} />);
    expect(screen.getByText(/Nothing open right now/i)).toBeInTheDocument();

    // Asserting the message VARIANT, not the interpolation: the test i18n
    // returns defaultValue verbatim, so `{{query}}` stays literal here. Which
    // variant gets chosen is this component's job; filling the slot is i18next's.
    rerender(<MapNotice {...base} filters={{ search: 'sauna' }} />);
    expect(screen.getByText(/No matches for/i)).toBeInTheDocument();

    rerender(<MapNotice {...base} filters={{ dateRange: { start: 'a', end: 'b' } }} />);
    expect(screen.getByText(/No events in this time range/i)).toBeInTheDocument();
  });

  it('shows nothing at all when there are points and no hint', () => {
    const { container } = render(<MapNotice {...base} count={12} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prefers the location hint over silence, but never over the empty state', () => {
    render(<MapNotice {...base} count={12} locationHint="Showing Berlin" />);
    expect(screen.getByText('Showing Berlin')).toBeInTheDocument();

    // count 0 + settled → the empty state wins; the hint is not also shown.
    const { container } = render(<MapNotice {...base} locationHint="Showing Berlin" />);
    expect(container.textContent).toMatch(/No spots here yet/i);
    expect(container.textContent).not.toMatch(/Showing Berlin/);
  });
});
