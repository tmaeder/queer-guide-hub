/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import PipelineDiffDialog from '../PipelineDiffDialog';

const node = (id: string, label: string, x = 0) => ({
  id, type: 'baseNode', position: { x, y: 0 }, data: { label, config: {} },
}) as never;

function wrap(ui: React.ReactNode) { return <TooltipProvider>{ui}</TooltipProvider>; }

describe('PipelineDiffDialog', () => {
  it('renders trigger button', () => {
    render(wrap(<PipelineDiffDialog currentNodes={[]} currentEdges={[]} savedDef={null} />));
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('opens dialog showing diff for changes', () => {
    render(wrap(<PipelineDiffDialog
      currentNodes={[node('n1', 'New')]} currentEdges={[]}
      savedDef={{ nodes: [], edges: [] }} />));
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getAllByText(/New/).length).toBeGreaterThan(0);
  });
});
