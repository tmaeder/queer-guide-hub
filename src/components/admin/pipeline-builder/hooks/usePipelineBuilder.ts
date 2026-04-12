import { useCallback, useState } from 'react';
import {
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PipelineNodeType {
  id: string;
  slug: string;
  category: 'source' | 'processor' | 'validator' | 'enricher' | 'output' | 'control';
  display_name: string;
  description: string;
  icon: string;
  color: string;
  edge_function: string | null;
  config_schema: Record<string, unknown>;
  input_ports: Array<{ id: string; label: string; type: string }>;
  output_ports: Array<{ id: string; label: string; type: string }>;
  is_enabled: boolean;
}

export interface PipelineDefinition {
  id: string;
  name: string;
  display_name: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
  default_context: Record<string, unknown>;
  max_concurrency: number;
  timeout_seconds: number;
  schedule: string | null;
  is_template: boolean;
  is_enabled: boolean;
  version: number;
}

/** Fetch all node types from pipeline_node_types table */
export function usePipelineNodeTypes() {
  return useQuery({
    queryKey: ['pipeline-node-types'],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
        .from('pipeline_node_types')
        .select('*')
        .eq('is_enabled', true)
        .order('category', { ascending: true });
      if (error) throw error;
      return data as PipelineNodeType[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetch all pipeline definitions */
export function usePipelineDefinitions() {
  return useQuery({
    queryKey: ['pipeline-definitions'],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
        .from('pipeline_definitions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as PipelineDefinition[];
    },
  });
}

/** Fetch a single pipeline definition by ID */
export function usePipelineDefinition(id: string | undefined) {
  return useQuery({
    queryKey: ['pipeline-definition', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
        .from('pipeline_definitions')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as PipelineDefinition;
    },
    enabled: !!id,
  });
}

/** Main pipeline builder hook — manages React Flow state + save/load */
export function usePipelineBuilder(pipelineId?: string) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [pipelineName, setPipelineName] = useState('');
  const [pipelineDescription, setPipelineDescription] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  /** Add a node to the canvas from a node type */
  const addNode = useCallback(
    (nodeType: PipelineNodeType, position: { x: number; y: number }) => {
      const id = `${nodeType.slug}-${Date.now()}`;
      const newNode: Node = {
        id,
        type: 'baseNode',
        position,
        data: {
          label: nodeType.display_name,
          icon: nodeType.icon,
          color: nodeType.color,
          category: nodeType.category,
          description: nodeType.description,
          nodeTypeSlug: nodeType.slug,
          inputPorts: nodeType.input_ports,
          outputPorts: nodeType.output_ports,
          config: {},
        },
      };
      setNodes((nds) => [...nds, newNode]);
      return id;
    },
    [setNodes]
  );

  /** Load a pipeline definition into the canvas */
  const loadPipeline = useCallback(
    (pipeline: PipelineDefinition) => {
      setNodes(pipeline.nodes || []);
      setEdges(pipeline.edges || []);
      setPipelineName(pipeline.display_name || pipeline.name);
      setPipelineDescription(pipeline.description || '');
    },
    [setNodes, setEdges]
  );

  /** Save mutation */
  const saveMutation = useMutation({
    mutationFn: async (overrides?: { name?: string }) => {
      const name = overrides?.name || pipelineName || `pipeline-${Date.now()}`;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      const payload = {
        name: slug,
        display_name: name,
        description: pipelineDescription,
        nodes,
        edges,
        default_context: {},
        version: 1,
      };

      if (pipelineId) {
        const { error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
          .from('pipeline_definitions')
          .update(payload)
          .eq('id', pipelineId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
          .from('pipeline_definitions')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-definitions'] });
      toast({ title: 'Pipeline saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    },
  });

  /** Run mutation — starts pipeline execution */
  const runMutation = useMutation({
    mutationFn: async (options?: { dryRun?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('pipeline-executor', {
        body: {
          action: 'start',
          pipeline_id: pipelineId,
          pipeline_name: pipelineName?.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          dry_run: options?.dryRun || false,
          triggered_by: 'admin',
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({ title: data?.dry_run ? 'Dry run started' : 'Pipeline started', description: `Run ID: ${data?.pipeline_run_id}` });
    },
    onError: (error: Error) => {
      toast({ title: 'Run failed', description: error.message, variant: 'destructive' });
    },
  });

  return {
    nodes, edges, setNodes, setEdges,
    onNodesChange, onEdgesChange, onConnect,
    addNode, loadPipeline,
    pipelineName, setPipelineName,
    pipelineDescription, setPipelineDescription,
    selectedNodeId, setSelectedNodeId,
    save: saveMutation.mutate,
    isSaving: saveMutation.isPending,
    run: runMutation.mutate,
    isRunning: runMutation.isPending,
  };
}
