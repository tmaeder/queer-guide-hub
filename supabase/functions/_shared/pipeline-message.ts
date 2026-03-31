// ============================================================
// Pipeline Message Types — standardized payload for all pipeline communication
// ============================================================

/** Message sent between pipeline nodes via pgmq */
export interface PipelineMessage {
  pipeline_run_id: string
  pipeline_id: string
  pipeline_name: string
  /** Current node being executed */
  current_node_id: string
  /** Index of current node in topological order */
  current_step: number
  /** Total steps in the pipeline */
  total_steps: number
  /** Runtime context (dry_run, triggered_by, etc.) */
  context: PipelineContext
  /** IDs of staging items to process (passed between nodes) */
  staging_item_ids?: string[]
  /** For fan-out: batch index and total */
  batch_index?: number
  batch_total?: number
  /** For retry: which attempt this is */
  attempt?: number
}

export interface PipelineContext {
  dry_run: boolean
  triggered_by: string
  batch_size: number
  [key: string]: unknown
}

/** Per-node state stored in pipeline_runs.node_states JSONB */
export interface NodeState {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  started_at?: string
  completed_at?: string
  items_in: number
  items_out: number
  error?: string
  duration_ms?: number
}

/** Pipeline definition node (stored in pipeline_definitions.nodes) */
export interface PipelineNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    config: Record<string, unknown>
    label?: string
  }
}

/** Pipeline definition edge (stored in pipeline_definitions.edges) */
export interface PipelineEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  condition?: string
}

/** Full pipeline definition row */
export interface PipelineDefinition {
  id: string
  name: string
  display_name: string
  description: string
  nodes: PipelineNode[]
  edges: PipelineEdge[]
  default_context: Record<string, unknown>
  max_concurrency: number
  timeout_seconds: number
  schedule: string | null
  is_template: boolean
  is_enabled: boolean
  version: number
}

/** Pipeline run row */
export interface PipelineRun {
  id: string
  pipeline_id: string
  pipeline_name: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused'
  node_states: Record<string, NodeState>
  context: PipelineContext
  items_total: number
  items_processed: number
  items_succeeded: number
  items_failed: number
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  error_message: string | null
  triggered_by: string
}

/** Node type from pipeline_node_types table */
export interface PipelineNodeType {
  id: string
  slug: string
  category: 'source' | 'processor' | 'validator' | 'enricher' | 'output' | 'control'
  display_name: string
  description: string
  icon: string
  color: string
  edge_function: string | null
  config_schema: Record<string, unknown>
  input_ports: Array<{ id: string; label: string; type: string }>
  output_ports: Array<{ id: string; label: string; type: string }>
  is_enabled: boolean
}
