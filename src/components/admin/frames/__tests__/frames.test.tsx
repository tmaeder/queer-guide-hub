/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AdminIndexFrame } from '../AdminIndexFrame';
import { AdminRecordFrame } from '../AdminRecordFrame';
import { AdminCompareFrame } from '../AdminCompareFrame';
import { AdminOpsFrame } from '../AdminOpsFrame';
import { AdminAnalyticsFrame } from '../AdminAnalyticsFrame';
import { AdminInboxFrame } from '../AdminInboxFrame';
import { AdminTreeCanvasFrame } from '../AdminTreeCanvasFrame';
import { AdminRegistryFrame, AdminRegistryRow } from '../AdminRegistryFrame';

const at = (path: string, ui: React.ReactNode) =>
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

const FRAMES_DIR = resolve(__dirname, '..');

describe('admin archetype frames: shared contract', () => {
  it('every frame emits the header grammar exactly once', () => {
    const cases: Array<[string, React.ReactNode]> = [
      [
        '/admin/content',
        <AdminIndexFrame key="a" title="Content">
          rows
        </AdminIndexFrame>,
      ],
      [
        '/admin/business/1',
        <AdminRecordFrame key="b" title="SchwuZ" tabRail={<span />}>
          fields
        </AdminRecordFrame>,
      ],
      [
        '/admin/duplicates',
        <AdminCompareFrame
          key="c"
          title="Duplicates"
          leftHeader={<span />}
          rightHeader={<span />}
          rows={[]}
        />,
      ],
      ['/admin/cloudflare', <AdminOpsFrame key="d" title="Cloudflare" />],
      [
        '/admin/analytics',
        <AdminAnalyticsFrame key="e" title="Analytics" chart={<span />} rankedList={<span />} />,
      ],
      ['/admin/inbox', <AdminInboxFrame key="f" title="Inbox" list={<span />} thread={<span />} />],
      [
        '/admin/geography',
        <AdminTreeCanvasFrame key="g" title="Geography" tree={<span />} canvas={<span />} />,
      ],
      [
        '/admin/automation',
        <AdminRegistryFrame key="h" title="Automations">
          rows
        </AdminRegistryFrame>,
      ],
    ];
    for (const [path, ui] of cases) {
      const { unmount } = at(path, ui);
      // One banner, one h1 — a page that stacks two heading bands is the exact
      // thing the fixed grammar exists to prevent.
      expect(screen.getAllByRole('banner'), path).toHaveLength(1);
      expect(screen.getAllByRole('heading', { level: 1 }), path).toHaveLength(1);
      unmount();
    }
  });

  it('no frame fetches its own data', () => {
    // The frames are layout. A frame that queried would put a network call
    // behind a styling decision, and the route-baseline spec would then be
    // measuring the frame instead of the page.
    for (const file of readdirSync(FRAMES_DIR).filter((f) => f.endsWith('.tsx'))) {
      const src = readFileSync(resolve(FRAMES_DIR, file), 'utf8');
      expect(src, `${file} imports supabase`).not.toMatch(/from '@\/integrations\/supabase/);
      expect(src, `${file} imports a data hook`).not.toMatch(/useQuery|useMutation/);
    }
  });

  it('no frame carries motion', () => {
    // Admin is motion-free (eslint bans framer-motion in the tree); the mock's
    // only movement is a flat hover wash on a row.
    for (const file of readdirSync(FRAMES_DIR).filter((f) => f.endsWith('.tsx'))) {
      const src = readFileSync(resolve(FRAMES_DIR, file), 'utf8');
      expect(src, `${file} uses card-lift`).not.toMatch(/card-lift/);
      expect(src, `${file} imports motion`).not.toMatch(/framer-motion|motion\/react/);
    }
  });

  it('no frame adds its own horizontal gutter', () => {
    // AdminShell's <main> is documented as "the ONE owner of admin page
    // spacing" and already applies PAGE_GUTTER. A frame adding px would
    // double-pad every admin page — the exact defect that rule ended, and one
    // all eight frames shipped with until the first real migration exposed it.
    for (const file of readdirSync(FRAMES_DIR).filter((f) => f.endsWith('.tsx'))) {
      const src = readFileSync(resolve(FRAMES_DIR, file), 'utf8');
      const code = src.replace(/\/\*\*[\s\S]*?\*\//g, '');
      expect(code, `${file} adds a horizontal gutter`).not.toMatch(/\bp[xl]-\d/);
    }
  });

  it('every multi-column frame guards against overflow', () => {
    // A bare `1fr` child has an implicit `min-width:auto`, so one long
    // unbroken string widens the column and takes the document's horizontal
    // scroll with it — which e2e/page-layout.spec.ts asserts can never happen.
    for (const file of readdirSync(FRAMES_DIR).filter((f) => f.endsWith('Frame.tsx'))) {
      const src = readFileSync(resolve(FRAMES_DIR, file), 'utf8');
      const templates = [...src.matchAll(/grid-cols-\[([^\]]+)\]/g)].map((m) => m[1]);
      for (const t of templates) {
        expect(t, `${file}: "${t}" uses a bare 1fr`).not.toMatch(/(^|_)1fr($|_)/);
      }
    }
  });
});

describe('AdminIndexFrame (A)', () => {
  it('separates the count line from pagination', () => {
    // The mock shows a text count and no numbered pager. Reading that as
    // "delete the pager" reintroduces a bug already shipped once: gallery and
    // board views lost their page controls, so a 40k-row entity showed 25
    // records and no way forward.
    at(
      '/admin/content',
      <AdminIndexFrame
        title="Content"
        countLine="1–8 of 12,408"
        pagination={<button type="button">Next</button>}
      >
        rows
      </AdminIndexFrame>,
    );
    expect(screen.getByText('1–8 of 12,408')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('takes any view, not just a table', () => {
    // A is an index frame with a pluggable view. Defined as "a table" it fails
    // on ContentListPanel — 24 of 40 routes — which ships five view modes.
    at(
      '/admin/content',
      <AdminIndexFrame title="Content" viewSwitch={<button type="button">Gallery</button>}>
        <ul>
          <li>a gallery, not a table</li>
        </ul>
      </AdminIndexFrame>,
    );
    expect(screen.getByRole('button', { name: 'Gallery' })).toBeInTheDocument();
    expect(screen.getByText('a gallery, not a table')).toBeInTheDocument();
  });
});

describe('AdminRegistryFrame (H)', () => {
  it('takes any body, not a fixed row shape', () => {
    // The frame owns the chrome; the caller owns the body — the same contract
    // as A. H shipped with a row shape baked in, and the first real migration
    // showed why that was wrong: /admin/automation is the page H was modelled
    // on and it renders SEVEN columns with row-click to open a detail.
    // Flattening that to name-plus-toggle would be a downgrade dressed as
    // consistency.
    at(
      '/admin/automation',
      <AdminRegistryFrame title="Automations">
        <table>
          <tbody>
            <tr>
              <td>city_safety_backfill</td>
              <td>30 4 * * *</td>
            </tr>
          </tbody>
        </table>
      </AdminRegistryFrame>,
    );
    expect(screen.getByText('city_safety_backfill')).toBeInTheDocument();
    expect(screen.getByText('30 4 * * *')).toBeInTheDocument();
  });

  it('AdminRegistryRow renders name, fired-count and toggle', () => {
    render(
      <AdminRegistryRow
        name="city_safety_backfill"
        firedCount="412 runs"
        toggle={<button type="button">Enabled</button>}
      />,
    );
    expect(screen.getByText('city_safety_backfill')).toBeInTheDocument();
    expect(screen.getByText('412 runs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enabled' })).toBeInTheDocument();
  });

  it('marks an alerting row by weight, never by a track colour', () => {
    // CLAUDE.md holds in two locked places that a track colour may never
    // encode a state. Admin is not a good enough reason to erode a rule the
    // public safety surfaces depend on.
    const { container } = render(<AdminRegistryRow name="failing_job" alert />);
    const row = container.firstElementChild!;
    expect(row.className).toContain('font-bold');
    expect(row.className).not.toMatch(/bg-track-|text-track-/);
  });

  it('divides rows with a hairline and never with a shadow', () => {
    const { container } = render(<AdminRegistryRow name="a" />);
    const row = container.firstElementChild!;
    expect(row.className).toContain('border-border-hairline');
    expect(row.className).not.toMatch(/shadow-/);
  });
});

describe('AdminCompareFrame (C)', () => {
  it('names the conflicting field in words, not just in styling', () => {
    at(
      '/admin/duplicates',
      <AdminCompareFrame
        title="Duplicates"
        leftHeader={<span>Keep</span>}
        rightHeader={<span>Merge</span>}
        rows={[{ field: 'name', left: 'SchwuZ', right: 'Schwuz', conflict: true }]}
      />,
    );
    // WCAG 1.4.1: the marker must survive a reader who cannot see the emphasis.
    expect(screen.getByText('Conflict')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
  });

  it('offers a single merge action', () => {
    at(
      '/admin/duplicates',
      <AdminCompareFrame
        title="Duplicates"
        leftHeader={<span />}
        rightHeader={<span />}
        rows={[]}
        mergeAction={<button type="button">Merge into left</button>}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('AdminInboxFrame (F)', () => {
  it('renders the action rail as a sibling column, not inside the thread', () => {
    // Promoting the rail out of TriageDetailPanel changes DOM order, which
    // changes tab order, which is what useTriageKeyboard navigates. Pinning
    // the structure here is what makes that migration reviewable.
    const { container } = at(
      '/admin/inbox',
      <AdminInboxFrame
        title="Inbox"
        list={<div data-testid="list" />}
        thread={<div data-testid="thread" />}
        actionRail={<div data-testid="rail" />}
      />,
    );
    const thread = screen.getByTestId('thread');
    const rail = screen.getByTestId('rail');
    expect(thread.contains(rail)).toBe(false);
    expect(
      container.querySelector('.lg\\:grid-cols-\\[340px_minmax\\(0\\,1fr\\)_300px\\]'),
    ).toBeTruthy();
  });

  it('drops to two columns when there is no rail', () => {
    const { container } = at(
      '/admin/inbox',
      <AdminInboxFrame title="Inbox" list={<span />} thread={<span />} />,
    );
    expect(container.querySelector('.lg\\:grid-cols-\\[340px_minmax\\(0\\,1fr\\)\\]')).toBeTruthy();
  });
});

describe('AdminTreeCanvasFrame (G)', () => {
  it('never clips the canvas column', () => {
    // overflow-hidden here kills drag-to-edge panning on the pipeline builder
    // and cuts nodes off at the boundary.
    const { container } = at(
      '/admin/geography',
      <AdminTreeCanvasFrame title="Geo" tree={<span />} canvas={<div data-testid="canvas" />} />,
    );
    const canvasCol = screen.getByTestId('canvas').parentElement!;
    expect(canvasCol.className).not.toMatch(/overflow-hidden|rounded-/);
    expect(container.querySelector('.lg\\:grid-cols-\\[320px_minmax\\(0\\,1fr\\)\\]')).toBeTruthy();
  });
});

describe('AdminRecordFrame (B)', () => {
  it('keeps the rail in the DOM at every breakpoint', () => {
    // A quality panel that silently disappears on a laptop is worse than one
    // that scrolls — the same rule the public SinglePage spine follows.
    at(
      '/admin/business/1',
      <AdminRecordFrame title="R" tabRail={<span />} rail={<div data-testid="rail" />}>
        fields
      </AdminRecordFrame>,
    );
    const rail = screen.getByTestId('rail').parentElement!;
    expect(rail.className).not.toMatch(/hidden/);
  });
});
