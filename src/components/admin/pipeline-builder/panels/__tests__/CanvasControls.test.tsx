/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const { zoomInFn, zoomOutFn, fitViewFn, getViewportMock, getNodesFn } = vi.hoisted(() => ({
  zoomInFn: vi.fn(),
  zoomOutFn: vi.fn(),
  fitViewFn: vi.fn(),
  getViewportMock: vi.fn().mockReturnValue({ zoom: 1 }),
  getNodesFn: vi.fn().mockReturnValue([]),
}));

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    zoomIn: zoomInFn, zoomOut: zoomOutFn, fitView: fitViewFn,
    getViewport: getViewportMock, getNodes: getNodesFn,
  }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import CanvasControls from '../CanvasControls';

function wrap(ui: React.ReactNode) { return <TooltipProvider>{ui}</TooltipProvider>; }

describe('CanvasControls', () => {
  it('renders zoom + fit + export buttons', () => {
    render(wrap(<CanvasControls pipelineName="p1" hasSelection={false} />));
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(5);
  });

  it('zoom in/out call react-flow hooks', () => {
    render(wrap(<CanvasControls pipelineName="p1" hasSelection={false} />));
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(zoomInFn).toHaveBeenCalled();
    expect(zoomOutFn).toHaveBeenCalled();
  });

  it('Fit selection disabled when no selection', () => {
    render(wrap(<CanvasControls pipelineName="p1" hasSelection={false} />));
    const buttons = screen.getAllByRole('button');
    expect(buttons[3]).toBeDisabled();
  });
});
