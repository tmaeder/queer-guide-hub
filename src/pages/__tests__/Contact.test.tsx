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

import Contact from '@/components/contribute/ContactBranch';

// Contact is a ROUTE, so it renders inside a router.
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Contact />
    </MemoryRouter>,
  );

const line = (name: RegExp) => screen.getByRole('radio', { name });

describe('Contact', () => {
  // The branch now belongs to the shared contribution surface, including its
  // route colour. The crisis warning still uses the design system's ink tone;
  // destructive red remains reserved for immediate danger and form errors.
  it('keeps crisis guidance in the ink treatment', () => {
    const src = readFileSync(
      nodePath.resolve(process.cwd(), 'src/components/contribute/ContactBranch.tsx'),
      'utf8',
    );
    expect(src).toContain('export default function ContactBranch');
    expect(src).toContain('bg-foreground');
    expect(src).not.toContain('bg-destructive');
  });

  it('renders without crashing', () => {
    const { container } = renderAt('/contact');
    expect(container).toBeTruthy();
  });

  it('exposes the lines as a radiogroup rather than hiding them in a select', () => {
    renderAt('/contact');
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    // The dropdown this replaced made the routing model invisible until opened.
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('ignores an unknown category rather than selecting a line that does not exist', () => {
    renderAt('/contact?category=not-a-lane');
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.getAttribute('aria-checked')).toBe('false');
    }
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

    type(/^name/i, 'Ada');
    type(/^email/i, 'ada@example.com');
    // Nine characters: one under the edge function's own floor, so the guard
    // has to hold here rather than letting the server answer with a raw 400.
    type(/^message/i, 'too short');
    expect(submit).toBeDisabled();

    type(/^message/i, 'too short but now it is not');
    expect(submit).toBeDisabled(); // still no line

    fireEvent.click(line(/^support/i));
    expect(submit).toBeEnabled();
  });
});
