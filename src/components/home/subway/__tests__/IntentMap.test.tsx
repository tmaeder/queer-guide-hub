import { describe, it, expect } from 'vitest';
import {
  renderWithProviders,
  screen,
  expectNoNestedInteractive,
  expectNoPlaceholderLeaks,
} from '@/test/test-utils';
import i18n from '@/i18n';
import { TRACK_BG } from '@/components/transit/routeBulletMap';
import { INTENT_NAV, INTENT_TRACK } from '@/config/navigation';
import { isRtlLocale } from '@/lib/locale';
import { IntentMap } from '../IntentMap';
import { STATIONS } from '../intentMapGeometry';

const anchors = (c: HTMLElement) => Array.from(c.querySelectorAll('li a'));
const hrefs = (c: HTMLElement) => anchors(c).map((a) => a.getAttribute('href') ?? '');

describe('IntentMap', () => {
  it('renders one station per intent plus the interchange', () => {
    const { container } = renderWithProviders(<IntentMap />);
    expect(screen.getAllByRole('listitem')).toHaveLength(INTENT_NAV.length + 1);
    expect(anchors(container)).toHaveLength(INTENT_NAV.length + 1);
  });

  it('links each destination exactly once', () => {
    // Guards the failure mode a JS breakpoint split would introduce: two
    // layouts rendering the same six links, fourteen anchors, seven URLs.
    const { container } = renderWithProviders(<IntentMap />);
    const seen = hrefs(container);
    for (const intent of INTENT_NAV) {
      expect(seen.filter((h) => h.endsWith(intent.to))).toHaveLength(1);
    }
    expect(seen.filter((h) => h.endsWith('/search'))).toHaveLength(1);
  });

  it('labels every station from the shared intent copy', () => {
    renderWithProviders(<IntentMap />);
    for (const intent of INTENT_NAV) {
      expect(screen.getByText(intent.fallback)).toBeInTheDocument();
      expect(screen.getByText(intent.subtitleFallback)).toBeInTheDocument();
    }
    expect(screen.getByText('Search everything')).toBeInTheDocument();
  });

  it('drops the untranslated labels the old drawing hardcoded', () => {
    // TrackLines shipped these three English strings to eleven locales.
    const { container } = renderWithProviders(<IntentMap />);
    for (const stale of ['You are here', 'Intersection', 'Community']) {
      expect(container.textContent).not.toContain(stale);
    }
  });

  it('gives every station link `no-underline`', () => {
    // Load-bearing: the unlayered `li a:not(.no-underline)` rule in index.css
    // sets `display: inline`, which collapses the plate and silently kills
    // every `lg:` position on it. Nothing else in CI notices.
    const { container } = renderWithProviders(<IntentMap />);
    for (const a of anchors(container)) {
      expect(a.className, a.getAttribute('href') ?? '').toContain('no-underline');
    }
  });

  it('parks every station on its curve via in-range percentages', () => {
    const { container } = renderWithProviders(<IntentMap />);
    const items = Array.from(container.querySelectorAll('li'));
    expect(items).toHaveLength(STATIONS.length);
    for (const li of items) {
      for (const prop of ['--sx', '--sy']) {
        const raw = (li as HTMLElement).style.getPropertyValue(prop);
        expect(raw, `${prop} missing`).toMatch(/%$/);
        const n = Number.parseFloat(raw);
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThan(100);
      }
    }
  });

  it('colours each station ring with its own line', () => {
    const { container } = renderWithProviders(<IntentMap />);
    for (const intent of INTENT_NAV) {
      const li = container.querySelector(`li[data-track="${INTENT_TRACK[intent.id]}"]`);
      expect(li, `no station on the ${INTENT_TRACK[intent.id]} line`).toBeTruthy();
    }
    for (const station of STATIONS) {
      const li = Array.from(container.querySelectorAll('li')).find((el) =>
        el.querySelector(`a[href$="${station.to}"]`),
      );
      const ring = li?.querySelector('span[aria-hidden] > span');
      expect(ring, `${station.id} has no ring`).toBeTruthy();
      // The interchange takes the sanctioned convergence gradient instead of
      // a single line's colour.
      expect(ring!.className).toContain(
        station.id === 'interchange' ? 'intersection-gradient' : TRACK_BG[station.track],
      );
    }
  });

  it('mirrors the geometry under RTL instead of scaling the stage', async () => {
    // An `rtl:-scale-x-100` on the stage flips the ring's own centring
    // translate a SECOND time and lands every station 32px off its line
    // (measured in the browser). The mirror has to live in the data.
    const read = (c: HTMLElement) =>
      Array.from(c.querySelectorAll('li')).map((li) =>
        Number.parseFloat((li as HTMLElement).style.getPropertyValue('--sx')),
      );

    await i18n.changeLanguage('en');
    const ltrRender = renderWithProviders(<IntentMap />);
    const ltr = read(ltrRender.container);
    const ltrTransform = ltrRender.container.querySelector('svg g')?.getAttribute('transform');
    ltrRender.unmount();

    await i18n.changeLanguage('ar');
    const rtlRender = renderWithProviders(<IntentMap />);
    const rtl = read(rtlRender.container);
    const rtlTransform = rtlRender.container.querySelector('svg g')?.getAttribute('transform');
    const html = rtlRender.container.innerHTML;
    rtlRender.unmount();
    await i18n.changeLanguage('en');

    // The map must read direction from the SAME predicate that writes
    // <html dir>, or it mirrors against the page rather than with it.
    expect(isRtlLocale('ar')).toBe(true);
    expect(isRtlLocale('en')).toBe(false);
    // Each station lands at its own mirror image, and the drawing mirrors with
    // it — internally, so the SVG's own box never moves.
    expect(rtl).toEqual(ltr.map((x) => Number((100 - x).toFixed(4))));
    expect(ltrTransform).toBeNull();
    expect(rtlTransform).toBe('translate(1440,0) scale(-1,1)');
    // No element may carry a horizontal scale — that is the hack this replaced,
    // and it reverses type as well as un-centring every ring.
    expect(html).not.toMatch(/-scale-x-|scaleX\(/);
  });

  it('hides the track drawing from assistive tech', () => {
    const { container } = renderWithProviders(<IntentMap />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
    // Every label is HTML now — nothing informative may live in the drawing.
    expect(svg!.querySelector('text')).toBeNull();
  });

  it('names the section from its visible heading', () => {
    renderWithProviders(<IntentMap />);
    const heading = screen.getByRole('heading', { name: 'What are you here for?' });
    expect(heading.id).toBe('intent-map-heading');
  });

  it('marks the active intent, and nothing on the homepage', () => {
    const onRights = renderWithProviders(<IntentMap />, { route: '/rights' });
    const current = onRights.container.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('href')).toMatch(/\/rights$/);
    onRights.unmount();

    // findActiveIntent('/') is undefined by design.
    const onHome = renderWithProviders(<IntentMap />, { route: '/' });
    expect(onHome.container.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  it('nests no interactive elements and leaks no placeholders', () => {
    const { container } = renderWithProviders(<IntentMap />);
    expectNoNestedInteractive(container);
    expectNoPlaceholderLeaks(container);
  });
});
