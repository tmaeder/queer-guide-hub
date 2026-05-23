import { useEffect, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useInlineSave } from '@/hooks/useInlineSave';
import { getContentType, fieldGroupLabels } from '@/config/contentTypes';
import type { FieldConfig, FieldGroup } from '@/types/cms';
import { supabase } from '@/integrations/supabase/client';
import { getEditorForFieldType } from './editors';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: string;
  contentId: string;
  contentName?: string;
  /** Seed data passed by the trigger (optional — fetched on open if absent). */
  currentData?: Record<string, unknown>;
  onSaved?: () => void;
}

/**
 * Auto-generated full-form editor. Renders every field in the registry
 * for the given content type, grouped by `field.group` (Accordion), and
 * routes each save through `useInlineSave` so semantics + audit logging
 * match the in-page Alt-click flow exactly. No batched save: each field
 * has its own ✓/✗ controls, identical to inline.
 */
export function AdminFullEditSheet({
  open,
  onOpenChange,
  contentType,
  contentId,
  contentName,
  currentData,
  onSaved,
}: Props) {
  const config = getContentType(contentType);
  const [data, setData] = useState<Record<string, unknown>>(currentData ?? {});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !config) return;
    if (currentData) {
      setData(currentData);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: row, error } = await supabase
        .from(config.tableName as 'venues')
        .select('*')
        .eq('id', contentId)
        .maybeSingle();
      if (cancelled) return;
      setLoading(false);
      if (!error && row) setData(row as Record<string, unknown>);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, config, contentId, currentData]);

  const fieldsByGroup = useMemo(() => {
    if (!config) return new Map<FieldGroup, FieldConfig[]>();
    const groups = new Map<FieldGroup, FieldConfig[]>();
    for (const f of config.fields) {
      if (f.hidden) continue;
      const list = groups.get(f.group) ?? [];
      list.push(f);
      groups.set(f.group, list);
    }
    return groups;
  }, [config]);

  if (!config) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Pencil size={16} />
            Edit {config.label.singular}
          </SheetTitle>
          <SheetDescription>
            {contentName ?? contentId} · changes save per-field
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="mt-6 flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <Accordion
            type="multiple"
            defaultValue={Array.from(fieldsByGroup.keys())}
            className="mt-4"
          >
            {Array.from(fieldsByGroup.entries()).map(([group, fields]) => (
              <AccordionItem key={group} value={group}>
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    {fieldGroupLabels[group] ?? group}
                    <Badge variant="outline">{fields.length}</Badge>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-4">
                    {fields.map((field) => (
                      <SheetField
                        key={field.name}
                        contentType={contentType}
                        recordId={contentId}
                        field={field}
                        value={data[field.name]}
                        onSaved={(next) => {
                          setData((prev) => ({ ...prev, [field.name]: next }));
                          onSaved?.();
                        }}
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface SheetFieldProps {
  contentType: string;
  recordId: string;
  field: FieldConfig;
  value: unknown;
  onSaved: (next: unknown) => void;
}

function SheetField({ contentType, recordId, field, value, onSaved }: SheetFieldProps) {
  const Editor = getEditorForFieldType(field.type);
  const { save, saving } = useInlineSave(contentType, recordId);
  const [editing, setEditing] = useState(false);

  const readOnly = field.readOnly || !Editor;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </span>
        {!editing && !readOnly && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${field.label}`}
          >
            <Pencil size={12} />
          </Button>
        )}
      </div>
      {editing && Editor ? (
        <Editor
          field={field}
          initialValue={value}
          saving={saving}
          onCancel={() => setEditing(false)}
          onSave={async (next) => {
            const res = await save({ field, value: next });
            if (res.success) {
              setEditing(false);
              onSaved(next);
            }
          }}
        />
      ) : (
        <FieldDisplay field={field} value={value} />
      )}
      {field.helpText && (
        <span className="text-xs text-muted-foreground">{field.helpText}</span>
      )}
    </div>
  );
}

function FieldDisplay({ field, value }: { field: FieldConfig; value: unknown }) {
  if (value == null || value === '') {
    return <span className="text-sm text-muted-foreground italic">empty</span>;
  }
  if (field.type === 'boolean') {
    return <Badge variant={value ? 'default' : 'outline'}>{value ? 'On' : 'Off'}</Badge>;
  }
  if (field.type === 'image' && typeof value === 'string') {
    return (
      <img
        src={value}
        alt=""
        role="presentation"
        className="rounded-element border border-border max-w-32 max-h-32 object-cover"
      />
    );
  }
  if (field.type === 'images' && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {(value as unknown[])
          .filter((x): x is string => typeof x === 'string')
          .map((src, i) => (
            <img
              key={`${src}-${i}`}
              src={src}
              alt=""
              role="presentation"
              className="rounded-element border border-border w-12 h-12 object-cover"
            />
          ))}
      </div>
    );
  }
  if (field.type === 'tags' && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {(value as unknown[])
          .filter((x): x is string => typeof x === 'string')
          .map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
      </div>
    );
  }
  if (typeof value === 'object') {
    return (
      <pre className="text-xs text-muted-foreground bg-muted p-2 rounded-element overflow-x-auto">
        {JSON.stringify(value, null, 2).slice(0, 280)}
      </pre>
    );
  }
  return <span className="text-sm break-all">{String(value)}</span>;
}
