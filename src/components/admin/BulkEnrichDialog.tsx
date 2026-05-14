/**
 * BulkEnrichDialog — Admin dialog for bulk AI content enrichment.
 *
 * Runs the content-automation AI enhancer module in batch mode across a
 * selected content type, generating description improvements and field
 * suggestions that flow into the automation review queue.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Wand2, Loader2, CheckCircle, AlertTriangle, FileText, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
const MODULES = [
  {
    value: 'ai-enhancer',
    label: 'AI Content Enhancement',
    description: 'Generate improved descriptions using AI',
  },
  {
    value: 'content-validator',
    label: 'Quality Check',
    description: 'Find encoding issues, broken HTML, short descriptions',
  },
  {
    value: 'link-sanitizer',
    label: 'Link Validation',
    description: 'Check for dead links and tracking parameters',
  },
  {
    value: 'geo-enricher',
    label: 'Geo Enrichment',
    description: 'Validate coordinates and assign locations',
  },
  {
    value: 'auto-tagger',
    label: 'Auto Tagger',
    description: 'Suggest tags based on content analysis',
  },
  {
    value: 'data-normalizer',
    label: 'Data Normalization',
    description: 'Validate emails, URLs, phone numbers, and contacts',
  },
  {
    value: 'event-validator',
    label: 'Event Validation',
    description: 'Detect past events and missing end times',
  },
];

interface EnrichResult {
  items_total: number;
  items_processed: number;
  items_succeeded: number;
  items_failed: number;
  flags_created: number;
  auto_approved: number;
  errors: string[];
}

interface BulkEnrichDialogProps {
  onComplete?: () => void;
}

export default function BulkEnrichDialog({ onComplete }: BulkEnrichDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [moduleName, setModuleName] = useState('ai-enhancer');
  const [result, setResult] = useState<EnrichResult | null>(null);

  const selectedModule = MODULES.find((m) => m.value === moduleName);

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('content-automation', {
        body: { module: moduleName, full_scan: true },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || 'Module execution failed');

      setResult({
        items_total: data.items_total ?? 0,
        items_processed: data.items_total ?? 0,
        items_succeeded: (data.items_total ?? 0) - (data.errors ?? 0),
        items_failed: data.errors ?? 0,
        flags_created: data.changes_proposed ?? 0,
        auto_approved: data.changes_auto_approved ?? 0,
        errors: data.results
          ? Object.entries(data.results)
              .filter(([, v]: [string, unknown]) => v.first_error)
              .map(([k, v]: [string, unknown]) => `${k}: ${v.first_error}`)
          : [],
      });

      toast.success(
        `Scanned ${data.items_total ?? 0} items, ${data.changes_proposed ?? 0} changes proposed`,
      );
      onComplete?.();
    } catch (err: unknown) {
      toast.error(`Enrichment failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!loading) {
      setOpen(isOpen);
      if (!isOpen) setResult(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Wand2 style={{ height: 16, width: 16, marginRight: 8 }} />
          Bulk Enrich
        </Button>
      </DialogTrigger>
      <DialogContent style={{ maxWidth: 540 }}>
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Wand2 style={{ height: 20, width: 20 }} />
              Bulk Content Enrichment
            </span>
          </DialogTitle>
          <DialogDescription>
            Run automation modules to validate, enrich, and improve content in batch. Results appear
            in the Automation review queue.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 mt-2">
          {/* Module Selection */}
          <div>
            <Label>Automation Module</Label>
            <Select value={moduleName} onValueChange={setModuleName} disabled={loading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODULES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedModule && (
              <span className="block mt-1 text-xs text-muted-foreground">
                {selectedModule.description}
              </span>
            )}
          </div>

          {/* Info box */}
          <div className="bg-muted rounded p-3">
            <span className="text-xs text-muted-foreground">
              The module will process items according to its configured batch size and create flags
              in the automation review queue. High-confidence changes may be auto-approved based on
              module settings.
            </span>
          </div>

          {/* Progress */}
          {loading && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Loader2 style={{ height: 16, width: 16 }} className="animate-spin" />
                <span className="text-sm">Running {selectedModule?.label}...</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded bg-secondary">
                <div className="h-full w-1/3 animate-pulse bg-primary" />
              </div>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <div className="border border-border rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle style={{ height: 18, width: 18, color: '#16a34a' }} />
                <span className="text-sm font-semibold">Processing Complete</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1">
                  <FileText style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
                  <span className="text-sm">
                    <strong>{result.items_processed}</strong> / {result.items_total} processed
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Zap style={{ height: 14, width: 14, color: '#f59e0b' }} />
                  <span className="text-sm">
                    <strong>{result.flags_created}</strong> flags created
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle style={{ height: 14, width: 14, color: '#16a34a' }} />
                  <span className="text-sm">
                    <strong>{result.auto_approved}</strong> auto-approved
                  </span>
                </div>
                {result.items_failed > 0 && (
                  <div className="flex items-center gap-1">
                    <AlertTriangle style={{ height: 14, width: 14, color: '#ef4444' }} />
                    <span className="text-sm">
                      <strong>{result.items_failed}</strong> failed
                    </span>
                  </div>
                )}
              </div>

              {result.errors.length > 0 && (
                <div className="mt-2 max-h-24 overflow-auto text-xs text-destructive">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <span key={i} className="block text-xs text-destructive">
                      {e}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Run button */}
          {!loading && (
            <Button onClick={handleRun} style={{ width: '100%' }}>
              <Wand2 style={{ height: 16, width: 16, marginRight: 8 }} />
              {result ? 'Run Again' : `Run ${selectedModule?.label || 'Module'}`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
