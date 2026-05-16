/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

vi.mock('../panels/KeyboardShortcuts', () => ({ default: () => null }));
vi.mock('../panels/PipelineDiffDialog', () => ({ default: () => null }));
vi.mock('../panels/VersionHistoryDialog', () => ({ default: () => null }));
vi.mock('../panels/ScheduleDialog', () => ({ default: () => null }));
vi.mock('../panels/AccessDialog', () => ({ default: () => null }));
vi.mock('../panels/PresenceIndicator', () => ({ default: () => null }));
vi.mock('../panels/AISuggestDialog', () => ({ default: () => null }));
vi.mock('../panels/TemplateLibrary', () => ({ default: () => null }));
vi.mock('../panels/ImportExportMenu', () => ({ default: () => null }));

import PipelineToolbar from '../PipelineToolbar';

function wrapper({ children }: { children: ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

describe('PipelineToolbar', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <PipelineToolbar
        selectedPipelineId={undefined} setSelectedPipelineId={vi.fn()}
        pipelineList={[]} isDirty={false} setViewingRunId={vi.fn()}
        setParams={vi.fn()} setNodes={vi.fn()} setIsDirty={vi.fn()}
        setPipelineName={vi.fn()} pipelineName=""
        isSaving={false} isRunning={false} showSavedPulse={null}
        handleSave={vi.fn()} handleRun={vi.fn()}
        loadPipeline={vi.fn()} nodeTypeList={[]}
        toastChangesDiscarded={vi.fn()} resetUndo={vi.fn()}
        undo={vi.fn()} redo={vi.fn()} canUndo={false} canRedo={false}
        handleAutoLayout={vi.fn()} handleAddComment={vi.fn()} handleAddGroup={vi.fn()}
        nodes={[]} edges={[]} selectedForTemplateNodes={[]} selectedForTemplateEdges={[]}
        handleTemplateApply={vi.fn()} applyAISuggestion={vi.fn()} handleImport={vi.fn()}
        loadVersionRevert={vi.fn()}
        activeRunId={null} runStatus={null} setActiveRunId={vi.fn()} clearOverlay={vi.fn()}
        logDrawerOpen={false} setLogDrawerOpen={vi.fn()}
        viewingRunId={null} latestRun={undefined} validationCount={0}
        navigate={vi.fn()}
      />,
      { wrapper },
    );
    expect(container).toBeTruthy();
  });
});
