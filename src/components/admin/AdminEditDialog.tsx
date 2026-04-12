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
import { useAdminEdit } from '@/hooks/useAdminEdit';
import { toast } from 'sonner';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import Switch from '@mui/material/Switch';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import { ChevronDown, History, Check, Loader2, Sparkles } from 'lucide-react';
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

  // Get editable fields (non-hidden, non-readonly)
  const editableFields = useMemo(() => {
    if (!config) return [];
    return config.fields.filter((f) => !f.hidden);
  }, [config]);

  // Get field groups for this content type
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
          // Serialize JSON/arrays for editing
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchEditLog is stable, only re-run on open/contentType/contentId change
  }, [open, contentType, contentId]);

  const handleChange = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  /** Apply resolver results to related fields */
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

  /** Handle location autocomplete selection with auto-resolution */
  const handleLocationChange = useCallback(
    async (
      field: FieldConfig,
      address: string,
      coordinates?: { lat: number; lng: number },
      components?: AddressComponents,
    ) => {
      // Update the address field itself + auto-fill related fields
      setFormData((prev) => {
        const updates: Record<string, unknown> = { ...prev, [field.name]: address };
        const map = field.relatedFields || {};
        // Auto-fill text fields from components
        if (components) {
          if (map.city && components.city) updates[map.city] = components.city;
          if (map.state && components.state) updates[map.state] = components.state;
          if (map.country && components.country) updates[map.country] = components.country;
          if (map.postal_code && components.postcode)
            updates[map.postal_code] = components.postcode;
        }
        // Auto-populate lat/lng from coordinates
        if (coordinates) {
          const latField = map.latitude || 'latitude';
          const lngField = map.longitude || 'longitude';
          updates[latField] = coordinates.lat;
          updates[lngField] = coordinates.lng;
        }
        return updates;
      });

      // Resolve city_id/country_id via edge function
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

  /** Handle resolver-typed text fields (nationality, birthplace) on blur */
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

  // Collect hidden FK field names set by resolvers (city_id, country_id, etc.)
  const resolverFkFields = useMemo(() => {
    if (!config) return new Set<string>();
    const fkNames = new Set<string>();
    for (const field of config.fields) {
      if (field.relatedFields) {
        for (const target of Object.keys(field.relatedFields)) {
          // Include hidden fields that are FK targets
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

    // Include resolver-set hidden FK fields (city_id, country_id)
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
        // Parse JSON/tags back
        const newStr = newVal == null ? '' : String(newVal).trim();
        const oldStr =
          oldVal != null && typeof oldVal === 'object'
            ? JSON.stringify(oldVal, null, 2)
            : oldVal == null
              ? ''
              : String(oldVal);
        if (newStr !== oldStr) {
          if (field.type === 'tags' && typeof newStr === 'string') {
            // Tags: parse comma-separated into array
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
              // Invalid JSON — pass as string, let DB reject if needed
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
          // Only fill fields that are empty or explicitly match an editable field
          if (key === 'suggested_tags') continue; // Handle tags separately
          const field = editableFields.find((f) => f.name === key);
          if (field && !field.readOnly) {
            const currentVal = prev[key];
            // Only suggest if current value is empty or we have a clear improvement
            if (!currentVal || String(currentVal).trim() === '') {
              updates[key] = value;
              newEnrichedFields.add(key);
            } else if (
              typeof value === 'string' &&
              typeof currentVal === 'string' &&
              value.length > currentVal.length * 1.3
            ) {
              // Suggest if AI version is significantly longer (30%+ more content)
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
    const enrichedSx = isEnriched
      ? { '& .MuiOutlinedInput-root': { borderColor: 'brand.main', boxShadow: (t: { palette: { brand: { main: string } } }) => `0 0 0 1px ${t.palette.brand.main}` } }
      : {};

    switch (field.type) {
      case 'boolean':
        return (
          <FormControlLabel
            key={field.name}
            control={
              <Switch
                checked={Boolean(value)}
                onChange={(e) => handleChange(field.name, e.target.checked)}
                size="small"
                disabled={isReadOnly}
              />
            }
            label={field.label}
          />
        );

      case 'select':
        return (
          <FormControl key={field.name} fullWidth size="small">
            <InputLabel>{field.label}</InputLabel>
            <Select
              value={String(value ?? '')}
              label={field.label}
              onChange={(e) => handleChange(field.name, e.target.value)}
              disabled={isReadOnly}
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              {field.options?.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );

      case 'richtext':
        return (
          <TextField
            key={field.name}
            label={isEnriched ? `${field.label} ✨` : field.label}
            multiline
            rows={6}
            value={String(value ?? '')}
            onChange={(e) => handleChange(field.name, e.target.value)}
            fullWidth
            size="small"
            disabled={isReadOnly}
            helperText={isEnriched ? 'AI-enriched — review before saving' : field.helpText}
            inputProps={{ maxLength: field.maxLength }}
            sx={enrichedSx}
          />
        );

      case 'textarea':
        return (
          <TextField
            key={field.name}
            label={isEnriched ? `${field.label} ✨` : field.label}
            multiline
            rows={3}
            value={String(value ?? '')}
            onChange={(e) => handleChange(field.name, e.target.value)}
            fullWidth
            size="small"
            disabled={isReadOnly}
            helperText={isEnriched ? 'AI-enriched — review before saving' : field.helpText}
            inputProps={{ maxLength: field.maxLength }}
            sx={enrichedSx}
          />
        );

      case 'json':
        return (
          <TextField
            key={field.name}
            label={field.label}
            multiline
            rows={4}
            value={String(value ?? '')}
            onChange={(e) => handleChange(field.name, e.target.value)}
            fullWidth
            size="small"
            disabled={isReadOnly}
            helperText={field.helpText || 'JSON format'}
            sx={{ fontFamily: 'monospace' }}
          />
        );

      case 'tags':
        return (
          <TextField
            key={field.name}
            label={field.label}
            value={String(value ?? '')}
            onChange={(e) => handleChange(field.name, e.target.value)}
            fullWidth
            size="small"
            disabled={isReadOnly}
            helperText={field.helpText || 'Comma-separated values'}
            placeholder="tag1, tag2, tag3"
          />
        );

      case 'number':
        return (
          <TextField
            key={field.name}
            label={field.label}
            type="number"
            value={value ?? ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
            fullWidth
            size="small"
            disabled={isReadOnly}
            helperText={field.helpText}
            inputProps={{
              min: field.min,
              max: field.max,
            }}
          />
        );

      case 'date':
        return (
          <TextField
            key={field.name}
            label={field.label}
            type="date"
            value={value ? String(value).slice(0, 10) : ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
            fullWidth
            size="small"
            disabled={isReadOnly}
            InputLabelProps={{ shrink: true }}
            helperText={field.helpText}
          />
        );

      case 'datetime':
        return (
          <TextField
            key={field.name}
            label={field.label}
            type="datetime-local"
            value={value ? String(value).slice(0, 16) : ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
            fullWidth
            size="small"
            disabled={isReadOnly}
            InputLabelProps={{ shrink: true }}
            helperText={field.helpText}
          />
        );

      case 'image':
        return (
          <TextField
            key={field.name}
            label={field.label}
            value={String(value ?? '')}
            onChange={(e) => handleChange(field.name, e.target.value)}
            fullWidth
            size="small"
            disabled={isReadOnly}
            placeholder="https://..."
            helperText={field.helpText || 'Image URL'}
          />
        );

      case 'images':
        return (
          <TextField
            key={field.name}
            label={field.label}
            value={String(value ?? '')}
            fullWidth
            size="small"
            disabled
            helperText="Image arrays are managed separately"
          />
        );

      case 'location':
        return (
          <Box key={field.name} sx={{ position: 'relative' }}>
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                <Check style={{ width: 14, height: 14, color: '#22c55e' }} />
                <Typography variant="caption" sx={{ color: '#22c55e' }}>
                  City & country linked
                </Typography>
              </Box>
            )}
          </Box>
        );

      // text, url, email, phone — all rendered as text input
      default: {
        // For resolver-typed fields (nationality, birthplace), add onBlur resolution
        const hasResolver = field.resolverType && !isReadOnly;
        const isResolved = resolvedFields[field.name];

        return (
          <Box key={field.name} sx={{ position: 'relative' }}>
            <TextField
              label={isEnriched ? `${field.label} ✨` : field.label}
              value={String(value ?? '')}
              onChange={(e) => {
                handleChange(field.name, e.target.value);
                if (hasResolver) setResolvedFields((prev) => ({ ...prev, [field.name]: false }));
              }}
              onBlur={
                hasResolver ? () => handleResolverBlur(field, String(value ?? '')) : undefined
              }
              fullWidth
              size="small"
              disabled={isReadOnly}
              placeholder={field.placeholder}
              helperText={isEnriched ? 'AI-enriched — review before saving' : field.helpText}
              inputProps={{ maxLength: field.maxLength }}
              sx={enrichedSx}
              InputProps={
                hasResolver
                  ? {
                      endAdornment: (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {resolving && (
                            <Loader2
                              style={{
                                width: 14,
                                height: 14,
                                color: '#999',
                                animation: 'spin 1s linear infinite',
                              }}
                            />
                          )}
                          {isResolved && (
                            <Check style={{ width: 14, height: 14, color: '#22c55e' }} />
                          )}
                        </Box>
                      ),
                    }
                  : undefined
              }
            />
            {hasResolver && isResolved && (
              <Typography variant="caption" sx={{ color: '#22c55e', mt: 0.25, display: 'block' }}>
                {field.resolverType === 'nationality' ? 'Country linked' : 'City & country linked'}
              </Typography>
            )}
          </Box>
        );
      }
    }
  };

  // Fallback for content types not in registry
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 680, maxHeight: '85vh', overflow: 'auto' }}>
        <DialogHeader>
          <DialogTitle>Edit {typeLabel}</DialogTitle>
          <DialogDescription>
            {contentName ? `Editing "${contentName}"` : `Editing ${typeLabel}`}
          </DialogDescription>
        </DialogHeader>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
          {groups.map((group, idx) => {
            const groupFields = getFieldsByGroup(contentType, group as FieldGroup);
            if (groupFields.length === 0) return null;
            const label = fieldGroupLabels[group as FieldGroup] || group;

            return (
              <Accordion key={group} defaultExpanded={idx === 0} disableGutters>
                <AccordionSummary
                  expandIcon={<ChevronDown style={{ width: 16, height: 16 }} />}
                  sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { margin: '8px 0' } }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {label}
                    <Typography
                      component="span"
                      variant="caption"
                      sx={{ ml: 1, color: 'text.secondary' }}
                    >
                      ({groupFields.length})
                    </Typography>
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0 }}>
                  {groupFields.map(renderField)}
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>

        {editLog.length > 0 && (
          <Accordion sx={{ mt: 2 }} disableGutters>
            <AccordionSummary expandIcon={<ChevronDown style={{ width: 16, height: 16 }} />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <History style={{ width: 16, height: 16 }} />
                <Typography variant="body2">Edit History ({editLog.length})</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {editLog.map((entry) => (
                  <Box
                    key={entry.id}
                    sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {new Date(entry.created_at).toLocaleString()}
                    </Typography>
                    {entry.changed_fields.map((f) => (
                      <Chip key={f} label={f} size="small" variant="outlined" />
                    ))}
                  </Box>
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}

        {logLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
            <CircularProgress size={16} />
          </Box>
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
              <Loader2
                style={{
                  width: 14,
                  height: 14,
                  marginRight: 4,
                  animation: 'spin 1s linear infinite',
                }}
              />
            ) : (
              <Sparkles style={{ width: 14, height: 14, marginRight: 4 }} />
            )}
            {enriching ? 'Enriching...' : 'Enrich with AI'}
          </Button>
          <Button onClick={handleSubmit} disabled={loading || changedCount === 0}>
            {loading ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
            Save{' '}
            {changedCount > 0 ? `(${changedCount} field${changedCount > 1 ? 's' : ''})` : 'Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
