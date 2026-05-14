import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Boxes, Save, Trash2, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom, untypedSupabase } from '@/integrations/supabase/untyped';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Node, Edge } from '@xyflow/react';

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  nodes: Node[];
  edges: Edge[];
  created_at: string;
  use_count: number;
}

interface TemplateLibraryProps {
  selectedNodes: Node[];
  selectedEdges: Edge[];
  onApply: (template: Template, origin?: { x: number; y: number }) => void;
}

const CATEGORIES = ['common', 'source', 'processing', 'commit', 'error-handling', 'custom'] as const;

export default function TemplateLibrary({ selectedNodes, selectedEdges, onApply }: TemplateLibraryProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'browse' | 'save'>('browse');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saveCategory, setSaveCategory] = useState<string>('custom');
  const qc = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['pipeline-node-templates'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('pipeline_node_templates')
        .select('id, name, description, category, nodes, edges, created_at, use_count')
        .order('use_count', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Template[];
    },
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await untypedFrom('pipeline_node_templates').insert({
        name: saveName.trim(),
        description: saveDesc.trim() || null,
        category: saveCategory,
        nodes: selectedNodes,
        edges: selectedEdges,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Template saved');
      qc.invalidateQueries({ queryKey: ['pipeline-node-templates'] });
      setSaveName('');
      setSaveDesc('');
      setMode('browse');
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedFrom('pipeline_node_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Template deleted');
      qc.invalidateQueries({ queryKey: ['pipeline-node-templates'] });
    },
    onError: (e: Error) => toast.error(`Delete failed: ${e.message}`),
  });

  const handleApply = async (t: Template) => {
    onApply(t);
    await untypedSupabase.rpc('increment_template_use_count', { p_template_id: t.id });
    qc.invalidateQueries({ queryKey: ['pipeline-node-templates'] });
    toast({ title: `Applied: ${t.name}`, description: `${t.nodes.length} nodes added` });
    setOpen(false);
  };

  const filtered = templates.filter(t => {
    if (category !== 'all' && t.category !== category) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())
               && !(t.description || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const canSave = selectedNodes.length > 0 && saveName.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-8">
              <Boxes className="h-3.5 w-3.5 mr-1.5" />
              Templates
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Template library</TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-3xl h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Node Templates</DialogTitle>
          <DialogDescription>
            Reusable DAG fragments. Save a selection or apply an existing template to your pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setMode('browse')}
            className={`px-3 py-1.5 text-xs border-b-2 transition-colors ${
              mode === 'browse' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Browse ({templates.length})
          </button>
          <button
            onClick={() => setMode('save')}
            className={`px-3 py-1.5 text-xs border-b-2 transition-colors ${
              mode === 'save' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Plus className="h-3 w-3 inline mr-1" />
            Save current selection ({selectedNodes.length})
          </button>
        </div>

        {mode === 'browse' ? (
          <>
            <div className="flex gap-2">
              <Input
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs flex-1"
              />
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 overflow-y-auto border border-border rounded-md">
              {isLoading && <div className="p-4 text-xs text-muted-foreground text-center">Loading...</div>}
              {!isLoading && filtered.length === 0 && (
                <div className="p-8 text-xs text-muted-foreground text-center">
                  {templates.length === 0 ? 'No templates yet. Select nodes on canvas and save your first template.' : 'No templates match filter'}
                </div>
              )}
              {filtered.map(t => (
                <div key={t.id} className="p-3 border-b border-border/50 flex items-start gap-3 hover:bg-accent transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm">{t.name}</span>
                      <Badge variant="outline" className="text-2xs px-1 py-0">{t.category}</Badge>
                      {t.use_count > 0 && (
                        <span className="text-2xs text-muted-foreground">used {t.use_count}×</span>
                      )}
                    </div>
                    {t.description && <div className="text-xs text-muted-foreground mb-1">{t.description}</div>}
                    <div className="text-2xs text-muted-foreground">
                      {t.nodes.length} nodes, {t.edges.length} edges • created {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleApply(t)}>
                    Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => { if (confirm(`Delete template "${t.name}"?`)) deleteMutation.mutate(t.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3 flex-1">
              {selectedNodes.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md">
                  Select one or more nodes on the canvas first (click to select, shift-click to add).
                </div>
              ) : (
                <>
                  <div className="text-xs text-muted-foreground">
                    Saving <strong>{selectedNodes.length}</strong> nodes and <strong>{selectedEdges.length}</strong> edges as a reusable template.
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="tpl-name" className="text-xs font-medium">Name <span className="text-destructive">*</span></label>
                    <Input
                      id="tpl-name"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="e.g. news-ingestion-core"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="tpl-desc" className="text-xs font-medium">Description</label>
                    <Textarea
                      id="tpl-desc"
                      value={saveDesc}
                      onChange={(e) => setSaveDesc(e.target.value)}
                      placeholder="What does this template do?"
                      className="text-xs min-h-[60px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="tpl-category" className="text-xs font-medium">Category</label>
                    <Select value={saveCategory} onValueChange={setSaveCategory}>
                      <SelectTrigger id="tpl-category" aria-label="Category" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="default"
                size="sm"
                disabled={!canSave || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saveMutation.isPending ? 'Saving...' : 'Save template'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
