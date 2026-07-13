import type { Node } from '@xyflow/react';
import { formatDistanceToNow } from 'date-fns';
import {
  Save, Play, PlayCircle, BarChart3, Upload, Plus, Clock, Loader2, Check,
  LayoutGrid, Undo2, Redo2, AlertCircle, Command, StickyNote, Folder, Terminal,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

import KeyboardShortcuts from './panels/KeyboardShortcuts';
import PipelineDiffDialog from './panels/PipelineDiffDialog';
import VersionHistoryDialog from './panels/VersionHistoryDialog';
import ScheduleDialog from './panels/ScheduleDialog';
import AccessDialog from './panels/AccessDialog';
import PresenceIndicator from './panels/PresenceIndicator';
import AISuggestDialog from './panels/AISuggestDialog';
import TemplateLibrary from './panels/TemplateLibrary';
import ImportExportMenu, { type PipelineExport } from './panels/ImportExportMenu';
import type { PipelineNodeType, PipelineDefinition, LoadablePipeline, StoredPipelineNode } from './hooks/usePipelineBuilder';
import type { AppNode, AppEdge } from './types';

interface LatestRun {
  id: string;
  status: string;
  started_at?: string;
  created_at: string;
  items_total?: number;
  items_succeeded?: number;
  error_message?: string;
  pipeline_version?: number;
}

interface Props {
  // pipeline selection
  selectedPipelineId: string | undefined;
  setSelectedPipelineId: (id: string | undefined) => void;
  pipelineList: PipelineDefinition[] | undefined;
  isDirty: boolean;
  setViewingRunId: (id: string | null) => void;
  setParams: (updater: (prev: URLSearchParams) => URLSearchParams) => void;
  setNodes: (updater: AppNode[] | ((nds: AppNode[]) => AppNode[])) => void;
  setIsDirty: (b: boolean) => void;
  setPipelineName: (n: string) => void;
  pipelineName: string;
  // save / run
  isSaving: boolean;
  isRunning: boolean;
  showSavedPulse: boolean | null | 0;
  handleSave: () => void;
  handleRun: (opts?: { dryRun?: boolean }) => void;
  // discard
  loadPipeline: (def: LoadablePipeline, nodeTypeList: PipelineNodeType[] | undefined) => void;
  nodeTypeList: PipelineNodeType[] | undefined;
  toastChangesDiscarded: () => void;
  resetUndo: () => void;
  // history
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // canvas actions
  handleAutoLayout: () => void;
  handleAddComment: () => void;
  handleAddGroup: () => void;
  onOpenQuickAdd: () => void;
  // dialogs / panels data
  nodes: AppNode[];
  edges: AppEdge[];
  selectedForTemplateNodes: AppNode[];
  selectedForTemplateEdges: AppEdge[];
  handleTemplateApply: (template: { nodes: AppNode[]; edges: AppEdge[] }) => void;
  templateLibraryOpen: boolean;
  templateLibraryMode: 'browse' | 'save';
  onTemplateLibraryOpenChange: (open: boolean) => void;
  applyAISuggestion: (n: AppNode[], e: AppEdge[]) => void;
  handleImport: (data: PipelineExport) => void;
  loadVersionRevert: (v: {
    pipeline_id: string; name: string; display_name?: string | null; description?: string | null;
    nodes: StoredPipelineNode[]; edges: AppEdge[]; schedule?: string | null; version: number;
  }) => void;
  // run state
  activeRunId: string | null;
  runStatus: string | null | undefined;
  setActiveRunId: (id: string | null) => void;
  clearOverlay: () => void;
  logDrawerOpen: boolean;
  setLogDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // metrics
  viewingRunId: string | null;
  latestRun: LatestRun | undefined;
  validationCount: number;
  // navigation
  navigate: (path: string) => void;
}

export default function PipelineToolbar(p: Props) {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background shrink-0 z-10">
      <Select
        value={p.selectedPipelineId ?? '__new__'}
        onValueChange={(value) => {
          if (p.isDirty && !window.confirm('Unsaved changes will be lost. Continue?')) return;
          const id = value === '__new__' ? undefined : value;
          p.setSelectedPipelineId(id);
          p.setViewingRunId(null);
          if (id) {
            const def = p.pipelineList?.find(pp => pp.id === id);
            if (def) p.setParams(prev => { const next = new URLSearchParams(prev); next.set('pipeline', def.name); return next; });
          } else {
            p.setParams(prev => { const next = new URLSearchParams(prev); next.delete('pipeline'); return next; });
          }
        }}
      >
        <SelectTrigger className="h-8 text-xs min-w-[240px] max-w-[280px]">
          <SelectValue placeholder="Select pipeline..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__new__" className="text-xs italic text-muted-foreground">— New pipeline —</SelectItem>
          {p.pipelineList?.map(pp => (
            <SelectItem key={pp.id} value={pp.id} className="text-xs">
              <span className="flex items-center gap-1.5">
                {!pp.is_enabled && <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground" title="disabled" />}
                {pp.is_enabled && <span className="inline-block w-1.5 h-1.5 rounded-full bg-foreground" title="enabled" />}
                {pp.display_name || pp.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 px-2"
        onClick={() => {
          if (p.isDirty && !window.confirm('Unsaved changes will be lost. Continue?')) return;
          p.setSelectedPipelineId(undefined);
          p.setNodes([]);
          p.setPipelineName('');
          p.setIsDirty(false);
          p.setParams(prev => { const next = new URLSearchParams(prev); next.delete('pipeline'); return next; });
        }}
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        New
      </Button>
      <Input
        value={p.pipelineName}
        onChange={(e) => { p.setPipelineName(e.target.value); p.setIsDirty(true); }}
        placeholder="Pipeline name..."
        className="w-56 h-8 text-sm"
      />
      <Separator orientation="vertical" className="h-6" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant={p.isDirty ? 'default' : 'outline'}
            onClick={p.handleSave}
            disabled={p.isSaving}
            className={p.showSavedPulse ? 'bg-muted dark:bg-foreground/30 text-foreground dark:text-foreground border-foreground/40 dark:border-foreground/40' : ''}
          >
            {p.isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> :
             p.showSavedPulse ? <Check className="h-3.5 w-3.5 mr-1.5" /> :
             <Save className="h-3.5 w-3.5 mr-1.5" />}
            {p.isSaving ? 'Saving...' : p.showSavedPulse ? 'Saved' : 'Save'}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          {p.isDirty ? 'Unsaved changes' : 'All saved'}
          <span className="ml-1 text-muted-foreground">{isMac ? '⌘S' : 'Ctrl+S'}</span>
        </TooltipContent>
      </Tooltip>
      {p.isDirty && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (!window.confirm('Discard all unsaved changes and reload from saved version?')) return;
                if (p.selectedPipelineId && p.pipelineList && p.nodeTypeList) {
                  const def = p.pipelineList.find(pp => pp.id === p.selectedPipelineId);
                  if (def) {
                    p.loadPipeline(def, p.nodeTypeList);
                    p.setIsDirty(false);
                    p.resetUndo();
                    p.toastChangesDiscarded();
                  }
                }
              }}
            >
              <Undo2 className="h-3.5 w-3.5 mr-1" />
              Discard
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Discard unsaved changes</TooltipContent>
        </Tooltip>
      )}
      <Button size="sm" variant="outline" onClick={() => p.handleRun({ dryRun: true })} disabled={p.isRunning}>
        <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
        Dry Run
      </Button>
      <Button size="sm" onClick={() => p.handleRun()} disabled={p.isRunning}>
        {p.isRunning ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
        {p.isRunning ? 'Starting...' : 'Run'}
      </Button>
      <Separator orientation="vertical" className="h-6" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={p.undo} disabled={!p.canUndo}>
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Undo <span className="ml-1 text-muted-foreground">{isMac ? '⌘Z' : 'Ctrl+Z'}</span></TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={p.redo} disabled={!p.canRedo}>
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Redo <span className="ml-1 text-muted-foreground">{isMac ? '⌘⇧Z' : 'Ctrl+Y'}</span></TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={p.handleAutoLayout} disabled={p.nodes.length === 0}>
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Auto-layout <span className="ml-1 text-muted-foreground">{isMac ? '⌘L' : 'Ctrl+L'}</span></TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={p.onOpenQuickAdd}
          >
            <Command className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Quick-add node <span className="ml-1 text-muted-foreground">{isMac ? '⌘K' : 'Ctrl+K'}</span></TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={p.handleAddComment}>
            <StickyNote className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Add sticky note</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={p.handleAddGroup}>
            <Folder className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Wrap selection in group</TooltipContent>
      </Tooltip>
      <PipelineDiffDialog
        currentNodes={p.nodes}
        currentEdges={p.edges}
        savedDef={(() => {
          const def = p.pipelineList?.find(pp => pp.id === p.selectedPipelineId);
          if (!def) return null;
          // Persisted shape (type=slug, optional position) diffed against canvas nodes — id/data/position only.
          return { nodes: (def.nodes as unknown as Node[]) || [], edges: def.edges || [] };
        })()}
      />
      <ScheduleDialog
        pipelineId={p.selectedPipelineId}
        currentSchedule={p.pipelineList?.find(pp => pp.id === p.selectedPipelineId)?.schedule}
      />
      <AccessDialog
        pipelineId={p.selectedPipelineId}
        pipelineName={p.pipelineName}
      />
      <VersionHistoryDialog
        pipelineId={p.selectedPipelineId}
        currentVersion={p.pipelineList?.find(pp => pp.id === p.selectedPipelineId)?.version}
        onRevert={p.loadVersionRevert}
      />
      <TemplateLibrary
        selectedNodes={p.selectedForTemplateNodes}
        selectedEdges={p.selectedForTemplateEdges}
        onApply={p.handleTemplateApply}
        open={p.templateLibraryOpen}
        onOpenChange={p.onTemplateLibraryOpenChange}
        initialMode={p.templateLibraryMode}
      />
      {p.nodeTypeList && (
        <AISuggestDialog
          nodeTypes={p.nodeTypeList}
          onApply={p.applyAISuggestion}
        />
      )}
      <ImportExportMenu
        nodes={p.nodes}
        edges={p.edges}
        pipelineName={p.pipelineName}
        onImport={p.handleImport}
      />

      {p.activeRunId && p.runStatus && (
        <Badge variant="outline" className={`text-xs ${p.runStatus === 'running' ? 'bg-muted dark:bg-foreground/40 text-foreground dark:text-foreground animate-pulse' : p.runStatus === 'completed' ? 'bg-muted dark:bg-foreground/40 text-foreground dark:text-foreground' : p.runStatus === 'failed' ? 'bg-destructive/10 dark:bg-destructive/40 text-destructive dark:text-destructive' : ''}`}>
          {p.runStatus}
        </Badge>
      )}
      {p.activeRunId && p.runStatus && ['completed', 'failed', 'cancelled'].includes(p.runStatus) && (
        <Button size="sm" variant="ghost" className="text-xs" onClick={() => { p.setActiveRunId(null); p.clearOverlay(); }}>
          Clear
        </Button>
      )}
      {p.activeRunId && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={p.logDrawerOpen ? 'default' : 'ghost'}
              className="h-8 w-8 p-0"
              onClick={() => p.setLogDrawerOpen(o => !o)}
            >
              <Terminal className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Toggle log stream</TooltipContent>
        </Tooltip>
      )}

      <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
        <PresenceIndicator pipelineId={p.selectedPipelineId} isDirty={p.isDirty} />
        {p.viewingRunId && (
          <Badge variant="outline" className="text-xs gap-1 bg-muted dark:bg-foreground/30 text-foreground dark:text-foreground border-foreground/40 dark:border-foreground/40">
            <Clock className="h-3 w-3" />
            viewing historical
            <button className="ml-1 hover:underline" onClick={() => p.setViewingRunId(null)}>×</button>
          </Badge>
        )}
        {!p.viewingRunId && p.latestRun && !p.activeRunId && (
          <Badge
            variant="outline"
            className={`text-xs gap-1 ${
              p.latestRun.status === 'completed' ? 'bg-muted dark:bg-foreground/30 text-foreground dark:text-foreground border-foreground/40 dark:border-foreground/40' :
              p.latestRun.status === 'failed' ? 'bg-destructive/10 dark:bg-destructive/30 text-destructive dark:text-destructive border-destructive dark:border-destructive' :
              p.latestRun.status === 'running' ? 'bg-muted dark:bg-foreground/30 text-foreground dark:text-foreground border-foreground/40 dark:border-foreground/40 animate-pulse' :
              'bg-muted text-muted-foreground'
            }`}
            title={`Run ${p.latestRun.id.slice(0, 8)} • ${p.latestRun.items_succeeded ?? 0}/${p.latestRun.items_total ?? 0} succeeded${p.latestRun.error_message ? ` • ${p.latestRun.error_message}` : ''}`}
          >
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(p.latestRun.started_at || p.latestRun.created_at), { addSuffix: true })} • {p.latestRun.status}
          </Badge>
        )}
        <Badge variant="outline" className="text-xs">{p.nodes.length} nodes</Badge>
        <Badge variant="outline" className="text-xs">{p.edges.length} edges</Badge>
        {p.validationCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs gap-1 bg-muted dark:bg-foreground/30 text-foreground dark:text-foreground border-border dark:border-border cursor-help">
                <AlertCircle className="h-3 w-3" />
                {p.validationCount} incomplete
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="text-xs max-w-[240px]">
              {p.validationCount} node{p.validationCount === 1 ? '' : 's'} with missing required config. Click a node to see its config panel.
            </TooltipContent>
          </Tooltip>
        )}
        {p.isDirty && <Badge variant="outline" className="text-xs bg-muted dark:bg-foreground/30 text-foreground dark:text-foreground border-border dark:border-border">unsaved</Badge>}
        {(() => {
          const def = p.pipelineList?.find(pp => pp.id === p.selectedPipelineId);
          if (!def || !p.latestRun?.pipeline_version) return null;
          if (p.latestRun.pipeline_version === def.version) return null;
          return (
            <Badge variant="outline" className="text-xs gap-1 bg-muted dark:bg-foreground/30 text-foreground dark:text-foreground border-border dark:border-border">
              v{p.latestRun.pipeline_version}→v{def.version}
            </Badge>
          );
        })()}
        <Separator orientation="vertical" className="h-4 mx-1" />
        <KeyboardShortcuts />
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => p.navigate('/admin/pipelines?tab=monitor')}>
          <BarChart3 className="h-3 w-3 mr-1" /> Monitor
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => p.navigate('/admin/imports')}>
          <Upload className="h-3 w-3 mr-1" /> Imports
        </Button>
      </div>
    </div>
  );
}
