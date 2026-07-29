/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CMSBody } from '../CMSBody';

/**
 * The hydrator is what makes a stored HTML document render live entities
 * without a second ProseMirror renderer on the reader's path.
 */

const controllerProps: Record<string, unknown>[] = [];

vi.mock('../database-block/DatabaseViewController', () => ({
  DatabaseViewController: (props: Record<string, unknown>) => {
    controllerProps.push(props);
    return <div data-testid="controller">{String(props.entityType)}</div>;
  },
}));

const A = '11111111-1111-4111-8111-111111111111';

function blockHtml(over: Partial<Record<string, string>> = {}) {
  const attrs: Record<string, string> = {
    'data-block-id': 'b1',
    'data-entity-type': 'venue',
    'data-source': JSON.stringify({ kind: 'ids', ids: [A] }),
    'data-view-state': JSON.stringify({ activeLayout: 'gallery', filters: { city: ['Berlin'] } }),
    'data-snapshot': JSON.stringify([{ t: 'venue', id: A, s: 'berghain', n: 'Berghain' }]),
    ...over,
  };
  const serialized = Object.entries(attrs)
    .map(([k, v]) => `${k}='${v.replace(/'/g, '&#39;')}'`)
    .join(' ');
  return `<p>Intro copy</p><div class="qg-database-block" ${serialized}><ul><li><a href="/venues/berghain">Berghain</a></li></ul></div>`;
}

beforeEach(() => {
  controllerProps.length = 0;
});

describe('DatabaseBlockHydrator via CMSBody', () => {
  it('mounts a controller into each placeholder', async () => {
    render(<CMSBody html={blockHtml()} className="qg-cms-body" pageSlug="blog" />);
    await waitFor(() => expect(screen.getByTestId('controller')).toBeInTheDocument());
    expect(screen.getByTestId('controller')).toHaveTextContent('venue');
  });

  it('passes the parsed attributes through, including reader view state', async () => {
    render(<CMSBody html={blockHtml()} className="qg-cms-body" pageSlug="blog" />);
    await waitFor(() => expect(controllerProps.length).toBeGreaterThan(0));

    const props = controllerProps[0];
    expect(props.blockId).toBe('b1');
    expect(props.entityType).toBe('venue');
    expect(props.source).toEqual({ kind: 'ids', ids: [A] });
    expect((props.viewState as { activeLayout: string }).activeLayout).toBe('gallery');
    expect((props.viewState as { filters: object }).filters).toEqual({ city: ['Berlin'] });
    expect(props.pageSlug).toBe('blog');
  });

  it('never hands the reader a way to write back to the document', async () => {
    // A reader may re-sort for themselves; that lens must stay private.
    render(<CMSBody html={blockHtml()} className="qg-cms-body" pageSlug="blog" />);
    await waitFor(() => expect(controllerProps.length).toBeGreaterThan(0));
    expect(controllerProps[0]).not.toHaveProperty('onCardsResolved');
  });

  it('leaves the surrounding prose untouched', async () => {
    render(<CMSBody html={blockHtml()} className="qg-cms-body" pageSlug="blog" />);
    await waitFor(() => expect(screen.getByTestId('controller')).toBeInTheDocument());
    expect(screen.getByText('Intro copy')).toBeInTheDocument();
  });

  it('replaces the crawlable fallback rather than rendering it twice', async () => {
    const { container } = render(
      <CMSBody html={blockHtml()} className="qg-cms-body" pageSlug="blog" />,
    );
    await waitFor(() => expect(screen.getByTestId('controller')).toBeInTheDocument());
    // The <ul> is there for crawlers and no-JS readers; once React mounts it
    // must not sit above a duplicate live list.
    expect(container.querySelectorAll('a[href="/venues/berghain"]')).toHaveLength(0);
  });

  it('does nothing on a document with no blocks', () => {
    render(<CMSBody html="<p>Just prose.</p>" className="qg-cms-body" pageSlug="about" />);
    expect(screen.queryByTestId('controller')).not.toBeInTheDocument();
    expect(screen.getByText('Just prose.')).toBeInTheDocument();
  });

  it('falls back to defaults for a placeholder with mangled attributes', async () => {
    render(
      <CMSBody
        html={blockHtml({ 'data-source': '{not json', 'data-view-state': '{{{' })}
        className="qg-cms-body"
        pageSlug="blog"
      />,
    );
    await waitFor(() => expect(controllerProps.length).toBeGreaterThan(0));
    expect(controllerProps[0].source).toEqual({ kind: 'ids', ids: [] });
    expect((controllerProps[0].viewState as { activeLayout: string }).activeLayout).toBe('list');
  });

  it('mounts one controller per block', async () => {
    const two = blockHtml() + blockHtml({ 'data-block-id': 'b2', 'data-entity-type': 'event' });
    render(<CMSBody html={two} className="qg-cms-body" pageSlug="blog" />);
    await waitFor(() => expect(screen.getAllByTestId('controller')).toHaveLength(2));
    expect(controllerProps.map((p) => p.entityType).sort()).toEqual(['event', 'venue']);
  });
});
