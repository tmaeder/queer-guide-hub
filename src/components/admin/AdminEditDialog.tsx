import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAdminEdit } from '@/hooks/useAdminEdit';
import { toast } from 'sonner';
import { History, Check, Loader2, Sparkles } from 'lucide-react';
import {
  contentTypeRegistry,
  getFieldsByGroup,
  getFieldGroups,
  fieldGroupLabels,
} from '@/config/contentTypeRegistry';
import type { FieldConfig, FieldGroup } from '@/types/cms';
import {
  LocationAutocomplete,
  type AddressComponents,
} from '@/components/ui/location-autocomplete';
import { useAddressResolver } from '@/hooks/useAddressResolver';
import { supabase } from '@/integrations/supabase/client';

interface AdminEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: string;
  contentId: string;
  contentName?: string;
  currentData?: Record<string, unknown>;
  onSaved?: () => void;
}

interface EditLogEntry {
  id: string;
  editor_id: string;
  changed_fields: string[];
  created_at: string;
}

const NONE_VALUE = '__none__';

export function AdminEditDialog({
  open,
  onOpenChange,
  contentType,
  contentId,
  contentName,
  currentData,
  onSaved,
}: AdminEditDialogProps) {
  const { loading, editContent, fetchEditLog } = useAdminEdit();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [editLog, setEditLog] = useState<EditLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [resolvedFields, setResolvedFields] = useState<Record<string, boolean>>({});
  const [enriching, setEnriching] = useState(false);
  const [enrichedFields, setEnrichedFields] = useState<Set<string>>(new Set());

  const { resolveAddress, resolveNationality, resolveBirthPlace, resolving } = useAddressResolver();

  const config = contentTypeRegistry[contentType];
  const typeLabel = config?.label?.singular || contentType;

  const editableFields = useMemo(() => {
    if (!config) return [];
    return config.fields.filter((f) => !f.hidden);
  }, [config]);

  const groups = useMemo(() => {
    if (!config) return [];
    return getFieldGroups(contentType).filter((group) => {
      const groupFields = getFieldsByGroup(contentType, group);
      return groupFields.length > 0;
    });
  }, [config, contentType]);

  useEffect(() => {
    if (open && currentData) {
      const initial: Record<string, unknown> = {};
      for (const field of editableFields) {
        const val = currentData[field.name];
        if (field.type === 'json' || field.type === 'tags') {
          if (val != null && typeof val === 'object') {
            initial[field.name] = JSON.stringify(val, null, 2);
          } else {
            initial[field.name] = val ?? '';
          }
        } else {
          initial[field.name] = val ?? '';
        }
      }
      setFormData(initial);
    }
  }, [open, currentData, editableFields]);

  useEffect(() => {
    if (open && contentId) {
      setLogLoading(true);
      fetchEditLog(contentType, contentId).then((entries) => {
        setEditLog(entries as EditLogEntry[]);
        setLogLoading(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contentType, contentId]);

  const handleChange = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const applyRelatedFields = useCallback(
    (
      field: FieldConfig,
      result: {
        city_id?: string | null;
        city_name?: string | null;
        country_id?: string | null;
        country_name?: string | null;
      },
    ) => {
      if (!field.relatedFields) return;
      setFormData((prev) => {
        const updates: Record<string, unknown> = { ...prev };
        const map = field.relatedFields!;
        if (map.city_id && result.city_id) updates[map.city_id] = result.city_id;
        if (map.country_id && result.country_id) updates[map.country_id] = result.country_id;
        if (map.city && result.city_name) updates[map.city] = result.city_name;
        if (map.country && result.country_name) updates[map.country] = result.country_name;
        return updates;
      });
      setResolvedFields((prev) => ({ ...prev, [field.name]: true }));
    },
    [],
  );

  const handleLocationChange = useCallback(
    async (
      field: FieldConfig,
      address: string,
      coordinates?: { lat: number; lng: number },
      components?: AddressComponents,
    ) => {
      setFormData((prev) => {
        const updates: Record<string, unknown> = { ...prev, [field.name]: address };
        const map = field.relatedFields || {};
        if (components) {
          if (map.city && components.city) updates[map.city] = components.city;
          if (map.state && components.state) updates[map.state] = components.state;
          if (map.country && components.country) updates[map.country] = components.country;
          if (map.postal_code && components.postcode)
            updates[map.postal_code] = components.postcode;
        }
        if (coordinates) {
          const latField = map.latitude || 'latitude';
          const lngField = map.longitude || 'longitude';
          updates[latField] = coordinates.lat;
          updates[lngField] = coordinates.lng;
        }
        return updates;
      });

      if (components?.country) {
        const result = await resolveAddress(
          components.city,
          components.country,
          coordinates?.lat,
          coordinates?.lng,
        );
        if (result) {
          applyRelatedFields(field, result);
          if (result.created) {
            toast.success(`New city created: ${result.city_name}`);
          }
        }
      }
    },
    [resolveAddress, applyRelatedFields],
  );

  const handleResolverBlur = useCallback(
    async (field: FieldConfig, value: string) => {
      if (!value?.trim() || !field.resolverType) return;

      setResolvedFields((prev) => ({ ...prev, [field.name]: false }));
      let result = null;

      if (field.resolverType === 'nationality') {
        result = await resolveNationality(value);
      } else if (field.resolverType === 'birthplace') {
        result = await resolveBirthPlace(value);
      }

      if (result) {
        applyRelatedFields(field, result);
      }
    },
    [resolveNationality, resolveBirthPlace, applyRelatedFields],
  );

  const resolverFkFields = useMemo(() => {
    if (!config) return new Set<string>();
    const fkNames = new Set<string>();
    for (const field of config.fields) {
      if (field.relatedFields) {
        for (const target of Object.keys(field.relatedFields)) {
          const targetField = config.fields.find((f) => f.name === target);
          if (targetField?.hidden) {
            fkNames.add(target);
          }
        }
      }
    }
    return fkNames;
  }, [config]);

  const getChangedFields = (): Record<string, unknown> => {
    if (!currentData) return formData;
    const changes: Record<string, unknown> = {};

    for (const fkName of resolverFkFields) {
      const newVal = formData[fkName];
      const oldVal = currentData[fkName];
      if (newVal != null && newVal !== '' && String(newVal) !== String(oldVal ?? '')) {
        changes[fkName] = newVal;
      }
    }

    for (const field of editableFields) {
      if (field.readOnly) continue;
      const newVal = formData[field.name];
      const oldVal = currentData[field.name];

      if (field.type === 'json' || field.type === 'tags') {
        const newStr = newVal == null ? '' : String(newVal).trim();
        const oldStr =
          oldVal != null && typeof oldVal === 'object'
            ? JSON.stringify(oldVal, null, 2)
            : oldVal == null
              ? ''
              : String(oldVal);
        if (newStr !== oldStr) {
          if (field.type === 'tags' && typeof newStr === 'string') {
            changes[field.name] = newStr
              ? newStr
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
          } else if (field.type === 'json') {
            try {
              changes[field.name] = newStr ? JSON.parse(newStr) : null;
            } catch {
              changes[field.name] = newStr || null;
            }
          } else {
            changes[field.name] = newStr || null;
          }
        }
      } else if (field.type === 'boolean') {
        const oldBool = Boolean(oldVal);
        const newBool = Boolean(newVal);
        if (oldBool !== newBool) {
          changes[field.name] = newBool;
        }
      } else if (field.type === 'number') {
        const oldNum = oldVal == null ? '' : String(oldVal);
        const newNum = newVal == null ? '' : String(newVal);
        if (oldNum !== newNum) {
          changes[field.name] = newNum !== '' ? Number(newVal) : null;
        }
      } else {
        const oldStr = oldVal == null ? '' : String(oldVal);
        const newStr = newVal == null ? '' : String(newVal);
        if (oldStr !== newStr) {
          changes[field.name] = newStr || null;
        }
      }
    }
    return changes;
  };

  const handleEnrich = async () => {
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke('content-automation', {
        body: {
          module: 'ai-content-enhancer',
          content_type: contentType,
          content_id: contentId,
        },
      });

      if (error) throw error;
      if (!data?.suggestions || Object.keys(data.suggestions).length === 0) {
        toast.info('No enrichment suggestions available');
        return;
      }

      const suggestions = data.suggestions as Record<string, unknown>;
      const newEnrichedFields = new Set<string>();

      setFormData((prev) => {
        const updates = { ...prev };
        for (const [key, value] of Object.entries(suggestions)) {
          if (key === 'suggested_tags') continue;
          const field = editableFields.find((f) => f.name === key);
          if (field && !field.readOnly) {
            const currentVal = prev[key];
            if (!currentVal || String(currentVal).trim() === '') {
              updates[key] = value;
              newEnrichedFields.add(key);
            } else if (
              typeof value === 'string' &&
              typeof currentVal === 'string' &&
              value.length > currentVal.length * 1.3
            ) {
              updates[key] = value;
              newEnrichedFields.add(key);
            }
          }
        }
        return updates;
      });

      setEnrichedFields(newEnrichedFields);
      const count = newEnrichedFields.size;
      if (count > 0) {
        toast.success(`AI suggested improvements for ${count} field${count > 1 ? 's' : ''}`);
      } else {
        toast.info('Content already looks good — no changes suggested');
      }
    } catch (err: unknown) {
      toast.error(`Enrichment failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setEnriching(false);
    }
  };

  const handleSubmit = async () => {
    const changes = getChangedFields();
    if (Object.keys(changes).length === 0) {
      toast.info('No changes to save');
      return;
    }

    const result = await editContent(contentType, contentId, changes);
    if (result.success) {
      toast.success(`${typeLabel} updated successfully`);
      onOpenChange(false);
      onSaved?.();
    } else {
      toast.error(result.error || 'Failed to save changes');
    }
  };

  const changedCount = Object.keys(getChangedFields()).length;

  const renderField = (field: FieldConfig) => {
    const value = formData[field.name];
    const isReadOnly = field.readOnly === true;
    const isEnriched = enrichedFields.has(field.name);
    const labelText = isEnriched ? `${field.label} ✨` : field.label;
    const fieldId = `field-${field.name}`;
    const enrichedClass = isEnriched ? 'border-[hsl(var(--foreground))] ring-1 ring-[hsl(var(--foreground))]' : '';

    switch (field.type) {
      case 'boolean':
        return (
          <div key={field.name} className="flex items-center gap-2">
            <Switch
              id={fieldId}
              checked={Boolean(value)}
              onCheckedChange={(c) => handleChange(field.name, c)}
              disabled={isReadOnly}
            />
            <Label htmlFor={fieldId}>{field.label}</Label>
          </div>
        );

      case 'select':
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label>{field.label}</Label>
            <Select
              value={value ? String(value) : NONE_VALUE}
              onValueChange={(v) => handleChange(field.name, v === NONE_VALUE ? '' : v)}
              disabled={isReadOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>
                  <em>None</em>
                </SelectItem>
                {field.options?.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 'richtext':
      case 'textarea':
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>{labelText}</Label>
            <Textarea
              id={fieldId}
              rows={field.type === 'richtext' ? 6 : 3}
              value={String(value ?? '')}
              onChange={(e) => handleChange(field.name, e.target.value)}
              disabled={isReadOnly}
              maxLength={field.maxLength}
              className={enrichedClass}
            />
            {(isEnriched || field.helpText) && (
              <span className="text-xs text-muted-foreground">
                {isEnriched ? 'AI-enriched — review before saving' : field.helpText}
              </span>
            )}
          </div>
        );

      case 'json':
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>{field.label}</Label>
            <Textarea
              id={fieldId}
              rows={4}
              value={String(value ?? '')}
              onChange={(e) => handleChange(field.name, e.target.value)}
              disabled={isReadOnly}
              className="font-mono"
            />
            <span className="text-xs text-muted-foreground">{field.helpText || 'JSON format'}</span>
          </div>
        );

      case 'tags':
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>{field.label}</Label>
            <Input
              id={fieldId}
              value={String(value ?? '')}
              onChange={(e) => handleChange(field.name, e.target.value)}
              disabled={isReadOnly}
              placeholder="tag1, tag2, tag3"
            />
            <span className="text-xs text-muted-foreground">
              {field.helpText || 'Comma-separated values'}
            </span>
          </div>
        );

      case 'number':
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>{field.label}</Label>
            <Input
              id={fieldId}
              type="number"
              value={(value as string | number | undefined) ?? ''}
              onChange={(e) => handleChange(field.name, e.target.value)}
              disabled={isReadOnly}
              min={field.min}
              max={field.max}
            />
            {field.helpText && (
              <span className="text-xs text-muted-foreground">{field.helpText}</span>
            )}
          </div>
        );

      case 'date':
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>{field.label}</Label>
            <Input
              id={fieldId}
              type="date"
              value={value ? String(value).slice(0, 10) : ''}
              onChange={(e) => handleChange(field.name, e.target.value)}
              disabled={isReadOnly}
            />
            {field.helpText && (
              <span className="text-xs text-muted-foreground">{field.helpText}</span>
            )}
          </div>
        );

      case 'datetime':
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>{field.label}</Label>
            <Input
              id={fieldId}
              type="datetime-local"
              value={value ? String(value).slice(0, 16) : ''}
              onChange={(e) => handleChange(field.name, e.target.value)}
              disabled={isReadOnly}
            />
            {field.helpText && (
              <span className="text-xs text-muted-foreground">{field.helpText}</span>
            )}
          </div>
        );

      case 'image':
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>{field.label}</Label>
            <Input
              id={fieldId}
              value={String(value ?? '')}
              onChange={(e) => handleChange(field.name, e.target.value)}
              disabled={isReadOnly}
              placeholder="https://..."
            />
            <span className="text-xs text-muted-foreground">{field.helpText || 'Image URL'}</span>
          </div>
        );

      case 'images':
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={fieldId}>{field.label}</Label>
            <Input id={fieldId} value={String(value ?? '')} disabled />
            <span className="text-xs text-muted-foreground">
              Image arrays are managed separately
            </span>
          </div>
        );

      case 'location':
        return (
          <div key={field.name} className="relative">
            <LocationAutocomplete
              value={String(value ?? '')}
              onChange={(address, coordinates, components) =>
                handleLocationChange(field, address, coordinates, components)
              }
              placeholder={field.placeholder || 'Search for an address...'}
              required={field.required}
              disabled={isReadOnly}
              label={field.label}
            />
            {resolvedFields[field.name] && (
              <div className="flex items-center gap-1 mt-1">
                <Check style={{ width: 14, height: 14, color: 'hsl(var(--foreground))' }} />
                <span className="text-xs" style={{ color: 'hsl(var(--foreground))' }}>
                  City & country linked
                </span>
              </div>
            )}
          </div>
        );

      default: {
        const hasResolver = field.resolverType && !isReadOnly;
        const isResolved = resolvedFields[field.name];

        return (
          <div key={field.name} className="flex flex-col gap-2 relative">
            <Label htmlFor={fieldId}>{labelText}</Label>
            <div className="relative">
              <Input
                id={fieldId}
                value={String(value ?? '')}
                onChange={(e) => {
                  handleChange(field.name, e.target.value);
                  if (hasResolver) setResolvedFields((prev) => ({ ...prev, [field.name]: false }));
                }}
                onBlur={
                  hasResolver ? () => handleResolverBlur(field, String(value ?? '')) : undefined
                }
                disabled={isReadOnly}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                className={enrichedClass}
              />
              {hasResolver && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {resolving && (
                    <Loader2 size={14} style={{ color: 'hsl(var(--muted-foreground))' }} className="animate-spin" />
                  )}
                  {isResolved && <Check size={14} style={{ color: 'hsl(var(--foreground))' }} />}
                </div>
              )}
            </div>
            {(isEnriched || field.helpText) && (
              <span className="text-xs text-muted-foreground">
                {isEnriched ? 'AI-enriched — review before saving' : field.helpText}
              </span>
            )}
            {hasResolver && isResolved && (
              <span className="text-xs block" style={{ color: 'hsl(var(--foreground))' }}>
                {field.resolverType === 'nationality' ? 'Country linked' : 'City & country linked'}
              </span>
            )}
          </div>
        );
      }
    }
  };

  if (!config) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent style={{ maxWidth: 600 }}>
          <DialogHeader>
            <DialogTitle>Edit {contentType}</DialogTitle>
            <DialogDescription>
              Content type "{contentType}" is not configured in the registry.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const defaultGroup = groups[0] ? String(groups[0]) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 680, maxHeight: '85vh', overflow: 'auto' }}>
        <DialogHeader>
          <DialogTitle>Edit {typeLabel}</DialogTitle>
          <DialogDescription>
            {contentName ? `Editing "${contentName}"` : `Editing ${typeLabel}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 mt-2">
          <Accordion type="single" collapsible defaultValue={defaultGroup}>
            {groups.map((group) => {
              const groupFields = getFieldsByGroup(contentType, group as FieldGroup);
              if (groupFields.length === 0) return null;
              const label = fieldGroupLabels[group as FieldGroup] || group;

              return (
                <AccordionItem key={group} value={String(group)}>
                  <AccordionTrigger>
                    <span className="text-sm font-semibold">
                      {label}
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        ({groupFields.length})
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-4 pt-0">{groupFields.map(renderField)}</div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>

        {editLog.length > 0 && (
          <Accordion type="single" collapsible className="mt-4">
            <AccordionItem value="history">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <History style={{ width: 16, height: 16 }} />
                  <span className="text-sm">Edit History ({editLog.length})</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2">
                  {editLog.map((entry) => (
                    <div key={entry.id} className="flex gap-2 flex-wrap items-center">
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                      {entry.changed_fields.map((f) => (
                        <Badge key={f} variant="outline">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {logLoading && (
          <div className="flex justify-center mt-2">
            <Loader2 size={16} className="animate-spin" aria-label="Loading" />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading || enriching}
          >
            Cancel
          </Button>
          <Button variant="outline" onClick={handleEnrich} disabled={loading || enriching}>
            {enriching ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {enriching ? 'Enriching...' : 'Enrich with AI'}
          </Button>
          <Button onClick={handleSubmit} disabled={loading || changedCount === 0}>
            {loading ? <Loader2 size={16} className="animate-spin" aria-label="Loading" /> : null}
            Save{' '}
            {changedCount > 0 ? `(${changedCount} field${changedCount > 1 ? 's' : ''})` : 'Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
