/**
 * @vitest-environment jsdom
 *
 * The band itself: does a term that a figure teaches actually get one?
 *
 * This is the test the e2e spec could not give a straight answer to, because
 * the dev server and the preview server both fell over mid-run. It exercises
 * the same path — registry lookup, safe-mode filter, band render — with no
 * network and no browser.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TagInfographics } from '../TagInfographics';
import { TestProviders } from '@/test/test-utils';
import { SafeModeProvider } from '@/providers/SafeModeProvider';

// The band resolves the terms it links to. That is a Supabase read, and it is
// not what this file is about.
vi.mock('@/hooks/useInfographicsForTag', () => ({
  useInfographicsForTag: () => ({ data: {} }),
}));

function renderBand(slug: string) {
  return render(
    <TestProviders>
      <SafeModeProvider>
        <TagInfographics slug={slug} pageAlreadyGated={false} />
      </SafeModeProvider>
    </TestProviders>,
  );
}

describe('TagInfographics', () => {
  it('renders a band on a term a figure teaches', () => {
    const { container } = renderBand('consent');
    expect(container.querySelector('#figure')).not.toBeNull();
  });

  it('renders a band on the other flagship term', () => {
    const { container } = renderBand('gender-identity');
    expect(container.querySelector('#figure')).not.toBeNull();
  });

  it('renders a band on a term a figure merely teaches, not only its subject', () => {
    // `aftercare` is taught by the consent figure but is not its subject.
    const { container } = renderBand('aftercare');
    expect(container.querySelector('#figure')).not.toBeNull();
  });

  it('renders nothing on a term no figure teaches', () => {
    const { container } = renderBand('leather');
    expect(container.querySelector('#figure')).toBeNull();
  });

  it('renders nothing on a term a figure only MENTIONS', () => {
    // The distinction the reverse index exists for: a term named in a legend
    // has not been taught, so it does not get a 400px interactive.
    const { container } = renderBand('cisgender');
    expect(container.querySelector('#figure')).toBeNull();
  });

  it('names the figure and offers the table', () => {
    renderBand('consent');
    expect(screen.getByText(/the line that stops/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /read as a table/i })).toBeTruthy();
  });

  it('gives the drawing an accessible name and cites its sources', () => {
    const { container } = renderBand('consent');
    const img = container.querySelector('[role="img"]');
    expect(img?.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(20);
    expect(screen.getByText(/drawn from/i)).toBeTruthy();
    // A risk-encoding figure shows how old its check is.
    expect(screen.getByText(/last checked/i)).toBeTruthy();
  });
});
