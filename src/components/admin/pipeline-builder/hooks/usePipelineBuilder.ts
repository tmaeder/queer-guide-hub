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
import { untypedFrom } from '@/integrations/supabase/untyped';
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
      const { data, error } = await untypedFrom('pipeline_node_types')
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
      const { data, error } = await untypedFrom('pipeline_definitions')
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
      const { data, error } = await untypedFrom('pipeline_definitions')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as PipelineDefinition;
    },
    enabled: !!id,
  });
}

/** Fetch a single pipeline definition by slug/name — used for URL-param loading */
export function usePipelineDefinitionByName(name: string | undefined) {
  return useQuery({
    queryKey: ['pipeline-definition-by-name', name],
    queryFn: async () => {
      if (!name) return null;
      const { data, error } = await untypedFrom('pipeline_definitions')
        .select('*')
        .eq('name', name)
        .maybeSingle();
      if (error) throw error;
      return data as PipelineDefinition | null;
    },
    enabled: !!name,
  });
}

/** Main pipeline builder hook — manages React Flow state + save/load */
export function usePipelineBuilder(pipelineId?: string) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [pipelineName, setPipelineName] = useState('');
  const [pipelineSlug, setPipelineSlug] = useState<string | null>(null);
  const [currentPipelineId, setCurrentPipelineId] = useState<string | null>(pipelineId ?? null);
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

  /**
   * Load a pipeline definition into the canvas.
   * Transforms stored nodes (type=<slug>) → React Flow shape (type='baseNode'
   * + data enriched from nodeTypes), auto-lays-out any missing positions,
   * and remembers the original slug so save() can reverse the transform.
   */
  const loadPipeline = useCallback(
    (pipeline: PipelineDefinition, nodeTypes?: PipelineNodeType[]) => {
      const typeBySlug = new Map<string, PipelineNodeType>();
      for (const nt of nodeTypes || []) typeBySlug.set(nt.slug, nt);

      const transformed = (pipeline.nodes || []).map((n: Node, i: number) => {
        const storedType = (n as Node & { type?: string }).type || '';
        const storedData = (n.data || {}) as Record<string, unknown>;
        const slug = (storedData.nodeTypeSlug as string) || storedType;
        const nt = typeBySlug.get(slug);
        const position = n.position || { x: 50 + i * 240, y: 200 };
        return {
          ...n,
          type: 'baseNode',
          position,
          data: {
            label: (storedData.label as string) || nt?.display_name || slug,
            config: storedData.config || {},
            icon: (storedData.icon as string) || nt?.icon || 'Box',
            color: (storedData.color as string) || nt?.color || '#6b7280',
            category: (storedData.category as string) || nt?.category,
            description: (storedData.description as string) || nt?.description,
            nodeTypeSlug: slug,
            inputPorts: (storedData.inputPorts as unknown) || nt?.input_ports || [],
            outputPorts: (storedData.outputPorts as unknown) || nt?.output_ports || [],
          },
        } as Node;
      });
      setNodes(transformed);
      setEdges((pipeline.edges || []).map(e => ({ ...e, animated: true })));
      setPipelineName(pipeline.display_name || pipeline.name);
      setPipelineSlug(pipeline.name);
      setCurrentPipelineId(pipeline.id);
      setPipelineDescription(pipeline.description || '');
    },
    [setNodes, setEdges]
  );

  /** Save mutation — converts type='baseNode' back to node type slug for executor */
  const saveMutation = useMutation({
    mutationFn: async (overrides?: { name?: string }) => {
      const name = overrides?.name || pipelineName || `pipeline-${Date.now()}`;
      const slug = pipelineSlug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      const serializedNodes = nodes.map(n => {
        const d = (n.data || {}) as Record<string, unknown>;
        const nodeTypeSlug = (d.nodeTypeSlug as string) || (n as Node & { type?: string }).type || '';
        return {
          id: n.id,
          type: nodeTypeSlug,
          position: n.position,
          data: {
            label: d.label,
            config: d.config || {},
          },
        };
      });

      const payload = {
        name: slug,
        display_name: name,
        description: pipelineDescription,
        nodes: serializedNodes,
        edges,
        default_context: {},
        version: 1,
      };

      const targetId = currentPipelineId || pipelineId;
      if (targetId) {
        const { error } = await untypedFrom('pipeline_definitions')
          .update(payload)
          .eq('id', targetId);
        if (error) throw error;
      } else {
        const { data, error } = await untypedFrom('pipeline_definitions')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        if (data?.id) setCurrentPipelineId(data.id);
        setPipelineSlug(slug);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-definitions'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-definition-by-name'] });
      toast({ title: 'Pipeline saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    },
  });

  /** Run mutation — starts pipeline execution (30s timeout, 1 retry) */
  const runMutation = useMutation({
    retry: 1,
    mutationFn: async (options?: { dryRun?: boolean }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const { data, error } = await supabase.functions.invoke('pipeline-executor', {
          body: {
            action: 'start',
            pipeline_id: currentPipelineId || pipelineId,
            pipeline_name: pipelineSlug || pipelineName?.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            dry_run: options?.dryRun || false,
            triggered_by: 'admin',
          },
        });
        if (error) throw error;
        return data;
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw new Error('Pipeline executor timed out after 30s');
        throw e;
      } finally {
        clearTimeout(timeout);
      }
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
    pipelineSlug, setPipelineSlug,
    currentPipelineId,
    pipelineDescription, setPipelineDescription,
    selectedNodeId, setSelectedNodeId,
    save: saveMutation.mutate,
    isSaving: saveMutation.isPending,
    run: runMutation.mutate,
    isRunning: runMutation.isPending,
  };
}
