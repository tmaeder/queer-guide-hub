import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, act } from '@testing-library/react';
import { forwardRef, useImperativeHandle, type ReactNode, type Ref } from 'react';

// Capture ForceGraph2D renders so we can assert on width/height and count.
const forceGraphRenders: Array<{ width: number; height: number }> = [];
const zoomToFit = vi.fn();
const d3ReheatSimulation = vi.fn();
const centerForce = { x: vi.fn(), y: vi.fn() };
const d3Force = vi.fn((name: string) => (name === 'center' ? centerForce : undefined));

vi.mock('react-force-graph-2d', () => {
  const Stub = forwardRef(function Stub(
    props: { width: number; height: number },
    ref: Ref<unknown>,
  ) {
    forceGraphRenders.push({ width: props.width, height: props.height });
    useImperativeHandle(ref, () => ({
      zoomToFit,
      d3Force,
      d3ReheatSimulation,
    }));
    return (
      <div
        data-testid="force-graph-stub"
        data-width={props.width}
        data-height={props.height}
      />
    );
  });
  return { default: Stub };
});

type GraphHookResult = {
  data?: { nodes: unknown[]; edges: unknown[] };
  isLoading: boolean;
  error?: Error | null;
  refetch: () => void;
};
const refetchMock = vi.fn();
let useTagGraphResult: GraphHookResult = {
  data: {
    nodes: [
      { id: '1', name: 'a', category: null, usage_count: 1, slug: 'a' },
      { id: '2', name: 'b', category: null, usage_count: 1, slug: 'b' },
    ],
    edges: [{ source: '1', target: '2', score: 0.9, type: 'semantic' }],
  },
  isLoading: false,
  error: null,
  refetch: refetchMock,
};
const setUseTagGraphResult = (next: Partial<GraphHookResult>) => {
  useTagGraphResult = { ...useTagGraphResult, ...next };
};

vi.mock('@/hooks/useTagRelationships', () => ({
  useTagGraph: () => useTagGraphResult,
}));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

// Control ResizeObserver — component must wait for it before mounting ForceGraph2D.
type ResizeCallback = (entries: Array<{ contentRect: { width: number; height: number } }>) => void;
const allObservers: Array<{ cb: ResizeCallback }> = [];
class MockResizeObserver {
  cb: ResizeCallback;
  constructor(cb: ResizeCallback) {
    this.cb = cb;
    allObservers.push({ cb });
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error test polyfill
global.ResizeObserver = MockResizeObserver;

// getBoundingClientRect returns whatever boundingRect is set to.
// Callback-ref based fix measures synchronously on attach, so controlling
// this value lets us simulate pre-layout vs post-layout mount.
let boundingRect = { width: 0, height: 0 };
Element.prototype.getBoundingClientRect = function () {
  return {
    width: boundingRect.width,
    height: boundingRect.height,
    top: 0,
    left: 0,
    right: boundingRect.width,
    bottom: boundingRect.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
};

import TagRelationshipGraph from '../TagRelationshipGraph';

const wrap = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const emitResize = (width: number, height: number) => {
  act(() => {
    for (const obs of allObservers) {
      obs.cb([{ contentRect: { width, height } }]);
    }
  });
};

describe('TagRelationshipGraph — left-alignment regression', () => {
  beforeEach(() => {
    forceGraphRenders.length = 0;
    zoomToFit.mockClear();
    d3ReheatSimulation.mockClear();
    centerForce.x.mockClear();
    centerForce.y.mockClear();
    refetchMock.mockClear();
    allObservers.length = 0;
    boundingRect = { width: 0, height: 0 };
    setUseTagGraphResult({
      data: {
        nodes: [
          { id: '1', name: 'a', category: null, usage_count: 1, slug: 'a' },
          { id: '2', name: 'b', category: null, usage_count: 1, slug: 'b' },
        ],
        edges: [{ source: '1', target: '2', score: 0.9, type: 'semantic' }],
      },
      isLoading: false,
      error: null,
    });
  });

  it('does not render ForceGraph2D with stale default dimensions before the container is measured', () => {
    // Container mounts with zero-size layout (pre-layout).
    const { queryByTestId } = render(
      <TagRelationshipGraph onTagClick={() => {}} categories={[]} />,
      { wrapper: wrap },
    );
    expect(queryByTestId('force-graph-stub')).toBeNull();
    expect(forceGraphRenders).toHaveLength(0);
  });

  it('mounts ForceGraph2D with the measured dimensions from getBoundingClientRect (synchronous)', () => {
    // Simulate the container having real dimensions at mount time — the
    // callback ref measures synchronously on attach.
    boundingRect = { width: 1200, height: 600 };
    const { queryByTestId } = render(
      <TagRelationshipGraph onTagClick={() => {}} categories={[]} />,
      { wrapper: wrap },
    );
    const stub = queryByTestId('force-graph-stub');
    expect(stub).not.toBeNull();
    expect(stub?.getAttribute('data-width')).toBe('1200');
    expect(stub?.getAttribute('data-height')).toBe('600');
    // Never with the old 800 default.
    expect(forceGraphRenders.every((r) => r.width === 1200 && r.height === 600)).toBe(true);
  });

  it('mounts ForceGraph2D after ResizeObserver reports real dimensions (post-layout)', () => {
    const { queryByTestId } = render(
      <TagRelationshipGraph onTagClick={() => {}} categories={[]} />,
      { wrapper: wrap },
    );
    expect(queryByTestId('force-graph-stub')).toBeNull();
    emitResize(1200, 600);
    const stub = queryByTestId('force-graph-stub');
    expect(stub).not.toBeNull();
    expect(stub?.getAttribute('data-width')).toBe('1200');
    expect(stub?.getAttribute('data-height')).toBe('600');
  });

  it('recenters the d3 force simulation when dimensions change', () => {
    render(<TagRelationshipGraph onTagClick={() => {}} categories={[]} />, { wrapper: wrap });
    emitResize(1200, 600);
    centerForce.x.mockClear();
    centerForce.y.mockClear();
    d3ReheatSimulation.mockClear();
    emitResize(1600, 800);
    expect(centerForce.x).toHaveBeenCalledWith(800);
    expect(centerForce.y).toHaveBeenCalledWith(400);
    expect(d3ReheatSimulation).toHaveBeenCalled();
  });

  it('remount (Grid ↔ Network toggle) does not render with stale defaults', () => {
    const first = render(
      <TagRelationshipGraph onTagClick={() => {}} categories={[]} />,
      { wrapper: wrap },
    );
    emitResize(1200, 600);
    first.unmount();

    // Simulate toggle back to Network with pre-layout (0x0) state.
    boundingRect = { width: 0, height: 0 };
    forceGraphRenders.length = 0;
    const second = render(
      <TagRelationshipGraph onTagClick={() => {}} categories={[]} />,
      { wrapper: wrap },
    );
    expect(second.queryByTestId('force-graph-stub')).toBeNull();
    expect(forceGraphRenders).toHaveLength(0);
    emitResize(900, 500);
    expect(forceGraphRenders.every((r) => r.width === 900 && r.height === 500)).toBe(true);
  });
});

describe('TagRelationshipGraph — error state (P0-1)', () => {
  beforeEach(() => {
    forceGraphRenders.length = 0;
    refetchMock.mockClear();
    allObservers.length = 0;
    boundingRect = { width: 1200, height: 600 };
  });

  it('renders the error state when the RPC errors (e.g. 403), not the empty graph', () => {
    setUseTagGraphResult({
      data: undefined,
      isLoading: false,
      error: Object.assign(new Error('permission denied for function get_tag_graph_data'), {
        code: '42501',
      }),
    });

    const { queryByTestId, getByText, queryByTestId: q2 } = render(
      <TagRelationshipGraph onTagClick={() => {}} categories={[]} />,
      { wrapper: wrap },
    );

    expect(queryByTestId('tag-graph-error')).not.toBeNull();
    expect(getByText("Couldn't load the tag graph")).toBeTruthy();
    // Must NOT silently render the canvas as if there were just no data.
    expect(q2('force-graph-stub')).toBeNull();
    expect(forceGraphRenders).toHaveLength(0);
  });

  it('Retry button calls refetch', () => {
    setUseTagGraphResult({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    });

    const { getByRole } = render(
      <TagRelationshipGraph onTagClick={() => {}} categories={[]} />,
      { wrapper: wrap },
    );

    act(() => {
      getByRole('button', { name: /retry/i }).click();
    });
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });
});
