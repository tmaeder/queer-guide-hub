import type { Node, Edge } from '@xyflow/react';

export interface Port {
  id: string;
  label: string;
  type: string;
}

export type NodeRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

// These must stay type aliases, not interfaces: @xyflow's Node<T> constrains
// T to Record<string, unknown>, which only aliases satisfy (implicit index signature).
export type BaseNodeData = {
  label?: string;
  config?: Record<string, unknown>;
  icon?: string;
  color?: string;
  category?: string;
  description?: string;
  nodeTypeSlug?: string;
  inputPorts?: Port[];
  outputPorts?: Port[];
  status?: NodeRunStatus;
  itemsIn?: number;
  itemsOut?: number;
  durationMs?: number;
  errorMessage?: string;
  hasValidationIssue?: boolean;
};

export type CommentNodeData = {
  text?: string;
  color?: string;
};

export type GroupNodeData = {
  label?: string;
  color?: string;
};

export type BaseNodeType = Node<BaseNodeData, 'baseNode'>;
export type CommentNodeType = Node<CommentNodeData, 'commentNode'>;
export type GroupNodeType = Node<GroupNodeData, 'groupNode'>;
export type AppNode = BaseNodeType | CommentNodeType | GroupNodeType;

export type AppEdgeData = { condition?: string };
export type AppEdge = Edge<AppEdgeData>;

export function isBaseNode(n: AppNode): n is BaseNodeType {
  return n.type === 'baseNode';
}
