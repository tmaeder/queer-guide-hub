/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import Contact from '../Contact';

// Contact is a ROUTE, so it renders inside a router — it reads `?category=`
// to preselect the safety line for the footer's "Report something" link.
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Contact />
    </MemoryRouter>,
  );

const line = (name: RegExp) => screen.getByRole('radio', { name });

describe('Contact', () => {
  // The footer's "Report something" link lands on this page, so a reader can
  // arrive here mid-risk-judgement. docs/design-system/README.md § Crisis
  // surfaces: on such a surface hue may not carry weight, because teaching
  // that a colour means "content type" is what makes the red warning stop
  // reading as a warning. Source-scanned rather than asserted on the DOM: the
  // rule is about which components may appear at all, and a colour the
  // selected state would introduce is invisible to jsdom, which computes no
  // styles.
  it('carries no track colour on a safety-adjacent surface', () => {
    // `import.meta.url` is not a file: URL under vitest's transform, so the
    // path is resolved from the repo root the way the other source-scanning
    // tests in this repo do.
    const src = readFileSync(nodePath.resolve(process.cwd(), 'src/pages/Contact.tsx'), 'utf8');
    // The scan is only meaningful if it read the real file.
    expect(src).toContain('export default function Contact');
    // `border-track-ring` is deliberately NOT in this list: it is ink in both
    // modes and exists to gate a track fill, so it is not itself a hue.
    for (const banned of [
      /\b(bg|text|border|fill|stroke)-track-(pink|blue|green|yellow)\b/,
      /variant=["'](accent|brand)["']/,
      /\bintersection-gradient\b/,
      /\bRouteBullet\b/,
      /\bStationRing\b/,
    ]) {
      expect(src).not.toMatch(banned);
    }
  });

  it('renders without crashing', () => {
    const { container } = renderAt('/contact');
    expect(container).toBeTruthy();
  });

  it('exposes the lines as a radiogroup rather than hiding them in a select', () => {
    renderAt('/contact');
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    // The dropdown this replaced made the routing model invisible until opened.
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('preselects a known category from the query string', () => {
    renderAt('/contact?category=safety');
    expect(line(/safety and moderation/i).getAttribute('aria-checked')).toBe('true');
  });

  it('ignores an unknown category rather than selecting a line that does not exist', () => {
    renderAt('/contact?category=not-a-lane');
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.getAttribute('aria-checked')).toBe('false');
    }
  });

  // The footer sends reporters here with ?category=safety. A person in danger
  // must be handed the crisis route at the point they are already looking,
  // not only in the band above the fold they may have scrolled past.
  it('shows the crisis route on the safety line, and only there', () => {
    const { unmount } = renderAt('/contact?category=safety');
    expect(screen.getByRole('link', { name: /crisis lines by country/i })).toBeTruthy();
    unmount();

    renderAt('/contact?category=partnerships');
    expect(screen.queryByRole('link', { name: /crisis lines by country/i })).toBeNull();
  });

  // The band is not gated on a line, a fetch or a loading branch: it is the
  // first thing a person arriving from the footer's report link should see.
  // Asserting there is exactly ONE is the point — /help listed again among the
  // "terminates elsewhere" rows would rank it level with the legal hub.
  it('routes to /help from one unconditional band', () => {
    renderAt('/contact');
    const help = screen.getAllByRole('link', { name: /^crisis lines$/i });
    expect(help).toHaveLength(1);
    expect(help[0].getAttribute('href')).toContain('/help');
  });

  it('blocks submit until a line is picked and the server minimums are met', () => {
    renderAt('/contact');
    const submit = screen.getByRole('button', { name: /send message/i });
    const type = (label: RegExp, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });

    expect(submit).toBeDisabled();

    type(/^name$/i, 'Ada');
    type(/^email$/i, 'ada@example.com');
    // Nine characters: one under the edge function's own floor, so the guard
    // has to hold here rather than letting the server answer with a raw 400.
    type(/^message$/i, 'too short');
    expect(submit).toBeDisabled();

    type(/^message$/i, 'too short but now it is not');
    expect(submit).toBeDisabled(); // still no line

    fireEvent.click(line(/^support/i));
    expect(submit).toBeEnabled();
  });
});
