/**
 * Guards the /pride timeline's pointer targets.
 *
 * Two separate defects were fixed here and each needs its own assertion, because each passes
 * while the other is broken:
 *
 *   SIZE    -- the event bar hardcoded `height: 20px`, under the 24x24 CSS px floor WCAG 2.5.8
 *              requires. axe reported it as `target-size` (serious) on /pride, which reds the
 *              repo-wide `axe full route sweep` for every PR, not just one.
 *
 *   SPACING -- `placeEvents` reserved LABEL_PX (96) per bar in the row packer while each bar
 *              rendered up to `LABEL_PX + 16` (112). Reserving less than a bar renders let two
 *              bars whose start dates sat 96-112px apart share a row, so their click targets
 *              overlapped by up to 16px and one stole the other's clicks. Measured on prod:
 *              a neighbour at x=1251 w=103 ended at 1354 while the target started at 1353.
 *
 * The spacing assertions BRACKET the reservation from both sides on purpose. A lower bound alone
 * ("near-date bars get different rows") is equally satisfied by giving every bar its own row,
 * which would destroy the packing the timeline exists for -- so the upper bound has to be a
 * control that MUST still share a row.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';
import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';
import { PrideTimeline } from '../PrideTimeline';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const YEAR = 2026;
/** Mirrors the component: the track is 1800px wide and spans exactly one year. */
const TRACK_WIDTH = 1800;
const YEAR_MS = Date.UTC(YEAR + 1, 0, 1) - Date.UTC(YEAR, 0, 1);
/** Days of offset that render as `px` along the track, so a case states the px it is probing. */
const daysForPx = (px: number) => (px / TRACK_WIDTH) * (YEAR_MS / 86_400_000);

function evt(id: string, dayOfYear: number): PrideCalendarEvent {
  return {
    id,
    slug: `event-${id}`,
    title: `Pride ${id}`,
    start_date: new Date(Date.UTC(YEAR, 0, 1) + dayOfYear * 86_400_000).toISOString(),
    end_date: null,
    city: 'Berlin',
    city_id: null,
    country: 'DE',
    country_id: null,
    latitude: null,
    longitude: null,
    images: null,
    is_featured: false,
    verification_status: 'verified',
    description: null,
    pride_subtypes: null,
  };
}

function renderBars(events: PrideCalendarEvent[]) {
  const { container } = renderWithProviders(<PrideTimeline events={events} year={YEAR} />);
  const bars = Array.from(container.querySelectorAll<HTMLElement>('[data-event-id]'));
  expect(bars.length).toBe(events.length); // positive control: the bars actually rendered
  return bars;
}

const topOf = (el: HTMLElement) => Number.parseFloat(el.style.top);
const pxOf = (v: string) => Number.parseFloat(v);

describe('PrideTimeline pointer targets (WCAG 2.5.8)', () => {
  it('renders every bar at least 24x24 CSS px', () => {
    const bars = renderBars([evt('a', 10), evt('b', 200)]);
    for (const bar of bars) {
      expect(pxOf(bar.style.height)).toBeGreaterThanOrEqual(24);
      // minWidth, not the measured width: jsdom lays nothing out, and the 24px floor has to hold
      // structurally rather than depend on how long an event's title happens to be.
      expect(pxOf(bar.style.minWidth)).toBeGreaterThanOrEqual(24);
    }
  });

  it('keeps a bar inside its own row', () => {
    // Two bars 99px apart land on consecutive rows, so their `top` delta IS the row pitch.
    const bars = renderBars([evt('a', 0), evt('b', Math.round(daysForPx(99)))]);
    const pitch = Math.abs(topOf(bars[1]) - topOf(bars[0]));
    expect(pitch).toBeGreaterThan(0);
    expect(pxOf(bars[0].style.height)).toBeLessThanOrEqual(pitch);
  });
});

describe('PrideTimeline row packing reserves the RENDERED bar width', () => {
  it('gives different rows to bars 99px apart (under the 112px a bar can render)', () => {
    // 99px > the old 96px reservation, so before the fix these shared a row and overlapped.
    const bars = renderBars([evt('a', 0), evt('b', Math.round(daysForPx(99)))]);
    expect(topOf(bars[0])).not.toBe(topOf(bars[1]));
  });

  it('still shares a row for bars 115px apart (the reservation is not over-widened)', () => {
    // Upper bound / control. Without this, "reserve 100000px" would satisfy the case above while
    // stacking every event on its own row and making the timeline unusable.
    const bars = renderBars([evt('a', 0), evt('b', Math.round(daysForPx(115)))]);
    expect(topOf(bars[0])).toBe(topOf(bars[1]));
  });

  it('still packs distant bars onto one row', () => {
    const bars = renderBars([evt('a', 0), evt('b', 59), evt('c', 120)]);
    const tops = new Set(bars.map(topOf));
    expect(tops.size).toBe(1);
  });
});
