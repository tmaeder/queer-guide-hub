import { useRef } from 'react';
import { Download, Upload, Copy, ClipboardPaste, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import type { Node, Edge } from '@xyflow/react';

export interface PipelineExport {
  version: 1;
  name: string;
  display_name?: string;
  description?: string;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: { label?: string; config?: Record<string, unknown>; nodeTypeSlug?: string };
  }>;
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string; condition?: string }>;
  exported_at: string;
}

interface ImportExportMenuProps {
  nodes: Node[];
  edges: Edge[];
  pipelineName: string;
  pipelineDescription?: string;
  onImport: (data: PipelineExport) => void;
}

function serialize(nodes: Node[], edges: Edge[], name: string, description?: string): PipelineExport {
  return {
    version: 1,
    name,
    description,
    nodes: nodes.map(n => {
      const d = (n.data || {}) as Record<string, unknown>;
      return {
        id: n.id,
        type: (d.nodeTypeSlug as string) || n.type || '',
        position: n.position,
        data: {
          label: d.label as string,
          config: (d.config as Record<string, unknown>) || {},
          nodeTypeSlug: d.nodeTypeSlug as string,
        },
      };
    }),
    edges: edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
      targetHandle: e.targetHandle || undefined,
      condition: (e.data as { condition?: string })?.condition,
    })),
    exported_at: new Date().toISOString(),
  };
}

function validate(obj: unknown): obj is PipelineExport {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return o.version === 1 && Array.isArray(o.nodes) && Array.isArray(o.edges);
}

export default function ImportExportMenu({ nodes, edges, pipelineName, pipelineDescription, onImport }: ImportExportMenuProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  const handleExportFile = () => {
    if (nodes.length === 0) {
      toast.error('Nothing to export: Add at least one node first');
      return;
    }
    const payload = serialize(nodes, edges, pipelineName || 'unnamed-pipeline', pipelineDescription);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pipelineName || 'pipeline'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Pipeline exported', description: `${nodes.length} nodes, ${edges.length} edges` });
  };

  const handleCopy = async () => {
    if (nodes.length === 0) {
      toast.error('Nothing to copy');
      return;
    }
    const payload = serialize(nodes, edges, pipelineName || 'unnamed-pipeline', pipelineDescription);
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast({ title: 'Copied to clipboard', description: `${nodes.length} nodes, ${edges.length} edges` });
    } catch (_e) {
      toast.error('Copy failed');
    }
  };

  const handleImportFile = () => fileInput.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!validate(parsed)) throw new Error('Invalid pipeline format (missing version/nodes/edges)');
      onImport(parsed);
      toast({ title: 'Pipeline imported', description: `${parsed.nodes.length} nodes, ${parsed.edges.length} edges` });
    } catch (_err) {
      toast.error('Import failed');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text);
      if (!validate(parsed)) throw new Error('Clipboard does not contain a valid pipeline export');
      onImport(parsed);
      toast({ title: 'Pipeline pasted', description: `${parsed.nodes.length} nodes, ${parsed.edges.length} edges` });
    } catch (_err) {
      toast.error('Paste failed');
    }
  };

  return (
    <>
      <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={onFileChange} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Import / export">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-xs">Export</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleExportFile} className="text-xs">
            <Download className="h-3.5 w-3.5 mr-2" /> Download JSON
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCopy} className="text-xs">
            <Copy className="h-3.5 w-3.5 mr-2" /> Copy to clipboard
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">Import</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleImportFile} className="text-xs">
            <Upload className="h-3.5 w-3.5 mr-2" /> Upload JSON
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePaste} className="text-xs">
            <ClipboardPaste className="h-3.5 w-3.5 mr-2" /> Paste from clipboard
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
