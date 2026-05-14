import { useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { Node } from '@xyflow/react';

interface NodeConfigPanelProps {
  node: Node | null;
  nodeTypes: Array<{
    slug: string;
    display_name: string;
    description: string;
    config_schema: Record<string, unknown>;
    category: string;
    color: string;
  }>;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}

interface SchemaProperty {
  type: string;
  default?: unknown;
  description?: string;
  enum?: string[];
  items?: { type: string; enum?: string[] };
  minimum?: number;
  maximum?: number;
}

export default function NodeConfigPanel({ node, nodeTypes, onUpdate, onClose }: NodeConfigPanelProps) {
  const updateConfig = useCallback((key: string, value: unknown) => {
    if (!node) return;
    const nd = node.data as Record<string, unknown>;
    const cfg = (nd.config || {}) as Record<string, unknown>;
    const newConfig = { ...cfg, [key]: value };
    onUpdate(node.id, { ...nd, config: newConfig });
  }, [node, onUpdate]);

  if (!node) return null;

  const nodeData = node.data as Record<string, unknown>;
  const nodeTypeSlug = nodeData.nodeTypeSlug as string;
  const nodeType = nodeTypes.find(nt => nt.slug === nodeTypeSlug);
  const config = (nodeData.config || {}) as Record<string, unknown>;

  const schema = nodeType?.config_schema as { type?: string; properties?: Record<string, SchemaProperty>; required?: string[] } | undefined;
  const properties = schema?.properties || {};
  const requiredFields = schema?.required || [];

  return (
    <Card className="w-80 border-l rounded-none h-full">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-medium">{nodeData.label as string || nodeTypeSlug}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{nodeType?.category}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>

      <Separator />

      <CardContent className="pt-4 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
        {/* Node label */}
        <div className="space-y-1.5">
          <Label className="text-xs">Label</Label>
          <Input
            value={(nodeData.label as string) || ''}
            onChange={(e) => onUpdate(node.id, { ...nodeData, label: e.target.value })}
            className="h-8 text-sm"
            placeholder="Node label..."
          />
        </div>

        {Object.keys(properties).length > 0 && (
          <>
            <Separator />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Configuration</p>
          </>
        )}

        {/* Render form fields from JSON Schema */}
        {Object.entries(properties).map(([key, prop]) => {
          const value = config[key] ?? prop.default;
          const isRequired = requiredFields.includes(key);
          const label = key
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());

          return (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                {label}
                {isRequired && <span className="text-red-500">*</span>}
              </Label>

              {prop.description && (
                <p className="text-2xs text-muted-foreground">{prop.description}</p>
              )}

              {/* Boolean → Switch */}
              {prop.type === 'boolean' && (
                <Switch
                  checked={value as boolean || false}
                  onCheckedChange={(checked) => updateConfig(key, checked)}
                />
              )}

              {/* String with enum → Select */}
              {prop.type === 'string' && prop.enum && (
                <Select value={String(value || '')} onValueChange={(v) => updateConfig(key, v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {prop.enum.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* String without enum → Input */}
              {prop.type === 'string' && !prop.enum && (
                <Input
                  value={String(value || '')}
                  onChange={(e) => updateConfig(key, e.target.value)}
                  className="h-8 text-sm"
                  placeholder={`Enter ${label.toLowerCase()}...`}
                />
              )}

              {/* Integer/Number → Input */}
              {(prop.type === 'integer' || prop.type === 'number') && (
                <Input
                  type="number"
                  value={value !== undefined && value !== null ? Number(value) : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') { updateConfig(key, undefined); return; }
                    const n = Number(v);
                    if (!Number.isNaN(n)) updateConfig(key, n);
                  }}
                  className="h-8 text-sm"
                  min={prop.minimum}
                  max={prop.maximum}
                  placeholder={prop.default !== undefined ? `Default: ${prop.default}` : ''}
                />
              )}

              {/* Array of strings → comma-separated input */}
              {prop.type === 'array' && prop.items?.type === 'string' && !prop.items?.enum && (
                <Input
                  value={Array.isArray(value) ? (value as string[]).join(', ') : ''}
                  onChange={(e) => updateConfig(key, e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  className="h-8 text-sm"
                  placeholder="Comma-separated values..."
                />
              )}

              {/* Array of strings with enum → multi-select badges */}
              {prop.type === 'array' && prop.items?.type === 'string' && prop.items?.enum && (
                <div className="flex flex-wrap gap-1">
                  {prop.items.enum.map(opt => {
                    const selected = Array.isArray(value) && (value as string[]).includes(opt);
                    return (
                      <Badge
                        key={opt}
                        variant={selected ? 'default' : 'outline'}
                        className="cursor-pointer text-xs"
                        onClick={() => {
                          const current = Array.isArray(value) ? [...value as string[]] : [];
                          if (selected) {
                            updateConfig(key, current.filter(v => v !== opt));
                          } else {
                            updateConfig(key, [...current, opt]);
                          }
                        }}
                      >
                        {opt}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {Object.keys(properties).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No configuration options for this node type</p>
        )}
      </CardContent>
    </Card>
  );
}
