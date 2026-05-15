import { useState } from 'react';
import { Sparkles, Loader2, Wand2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { autoLayout } from '../utils/autoLayout';
import type { Node, Edge } from '@xyflow/react';
import type { PipelineNodeType } from '../hooks/usePipelineBuilder';

interface SuggestionNode {
  id: string;
  slug: string;
  label: string;
  config: Record<string, unknown>;
}

interface SuggestionEdge {
  source: string;
  target: string;
}

interface Suggestion {
  nodes: SuggestionNode[];
  edges: SuggestionEdge[];
  rationale?: string;
}

interface AISuggestDialogProps {
  nodeTypes: PipelineNodeType[];
  onApply: (nodes: Node[], edges: Edge[]) => void;
}

const EXAMPLES = [
  'Hourly news feed ingestion with dedup and LLM enrichment',
  'Daily scraper for hotels: fetch, validate, dedup, review low-confidence, commit',
  'Eventbrite → normalize → geocode → validate → dedup → commit events',
  'Marketplace product sync with fan-in from Awin, Shopify, Etsy',
];

export default function AISuggestDialog({ nodeTypes, onApply }: AISuggestDialogProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (description.trim().length < 10) {
      toast.error('Describe what the pipeline should do: At least 10 characters');
      return;
    }
    setLoading(true);
    setSuggestion(null);
    try {
      const { data, error } = await supabase.functions.invoke('pipeline-ai-suggest', {
        body: { description: description.trim() },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'no suggestion returned');
      setSuggestion(data.suggestion as Suggestion);
    } catch (_e) {
      toast.error('Suggestion failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!suggestion) return;

    const now = Date.now();
    // Map LLM-returned slugs to React Flow baseNode shape
    const nodes: Node[] = suggestion.nodes.map((s, i) => {
      const nt = nodeTypes.find(t => t.slug === s.slug);
      const rfId = `${s.slug}-${now}-${i}`;
      return {
        id: rfId,
        type: 'baseNode',
        position: { x: 50 + i * 250, y: 100 },
        data: {
          label: s.label || nt?.display_name || s.slug,
          config: s.config || {},
          icon: nt?.icon || 'Box',
          color: nt?.color || '#6b7280',
          category: nt?.category,
          description: nt?.description,
          nodeTypeSlug: s.slug,
          inputPorts: nt?.input_ports || [],
          outputPorts: nt?.output_ports || [],
        },
      } as Node;
    });

    // LLM-returned edge source/target ids → React Flow node ids
    const idMap = new Map<string, string>();
    suggestion.nodes.forEach((s, i) => idMap.set(s.id, nodes[i].id));

    const edges: Edge[] = suggestion.edges.map((e, i) => ({
      id: `ai-edge-${now}-${i}`,
      source: idMap.get(e.source) || e.source,
      target: idMap.get(e.target) || e.target,
      animated: true,
    }));

    // Auto-layout to make it look clean
    const laidOut = autoLayout(nodes, edges);
    onApply(laidOut, edges);
    toast({ title: 'Pipeline applied', description: `${nodes.length} nodes, ${edges.length} edges` });
    setOpen(false);
    setSuggestion(null);
    setDescription('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs">
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          AI suggest
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI pipeline suggest
          </DialogTitle>
          <DialogDescription>
            Describe what the pipeline should do. Claude will propose a DAG using the available node types.
            You'll see the suggestion before it's applied to the canvas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Daily hotel ingestion from Booking.com: fetch, geocode, validate, dedupe, commit"
            className="text-sm min-h-[80px]"
          />
          <div className="flex flex-wrap gap-1">
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => setDescription(ex)}
                className="text-2xs px-2 py-0.5 rounded border border-border bg-background hover:bg-accent transition-colors"
              >
                {ex.slice(0, 40)}…
              </button>
            ))}
          </div>
        </div>

        {suggestion && (
          <div className="border border-border rounded-element bg-background p-3 space-y-2 max-h-[320px] overflow-y-auto">
            {suggestion.rationale && (
              <div className="text-xs text-muted-foreground italic">
                <Wand2 className="h-3 w-3 inline mr-1" />
                {suggestion.rationale}
              </div>
            )}
            <div className="text-xs">
              <span className="font-semibold">{suggestion.nodes.length}</span> nodes,
              {' '}<span className="font-semibold">{suggestion.edges.length}</span> edges
            </div>
            <div className="space-y-1">
              {suggestion.nodes.map((n) => (
                <div key={n.id} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-2xs px-1.5 py-0 font-mono">{n.id}</Badge>
                  <span className="font-mono text-xs2 text-muted-foreground">{n.slug}</span>
                  <span className="truncate">{n.label}</span>
                </div>
              ))}
            </div>
            <div className="text-2xs text-muted-foreground pt-2 border-t border-border/40">
              Edges: {suggestion.edges.map(e => `${e.source}→${e.target}`).join(', ')}
            </div>
          </div>
        )}

        <DialogFooter>
          {!suggestion ? (
            <Button onClick={handleGenerate} disabled={loading || description.length < 10} className="w-full">
              {loading ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-2" />}
              {loading ? 'Designing…' : 'Generate suggestion'}
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setSuggestion(null)}>Discard</Button>
              <Button size="sm" onClick={handleApply}>Apply to canvas</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
