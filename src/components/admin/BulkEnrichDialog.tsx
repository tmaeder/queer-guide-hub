/**
 * BulkEnrichDialog — Admin dialog for bulk AI content enrichment.
 *
 * Runs the content-automation AI enhancer module in batch mode across a
 * selected content type, generating description improvements and field
 * suggestions that flow into the automation review queue.
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

const CONTENT_TYPES = [
  { value: 'venues', label: 'Venues' },
  { value: 'events', label: 'Events' },
  { value: 'personalities', label: 'Personalities' },
  { value: 'news_articles', label: 'News Articles' },
  { value: 'cities', label: 'Cities' },
  { value: 'countries', label: 'Countries' },
];

const MODULES = [
  {
    value: 'ai-content-enhancer',
    label: 'AI Content Enhancement',
    description: 'Generate improved descriptions using AI',
  },
  {
    value: 'content-quality-checker',
    label: 'Quality Check',
    description: 'Find encoding issues, broken HTML, short descriptions',
  },
  {
    value: 'link-validator',
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
    value: 'contact-normalizer',
    label: 'Contact Normalization',
    description: 'Validate emails, URLs, and phone numbers',
  },
  {
    value: 'date-normalizer',
    label: 'Date Normalization',
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
  const [moduleName, setModuleName] = useState('ai-content-enhancer');
  const [result, setResult] = useState<EnrichResult | null>(null);

  const selectedModule = MODULES.find((m) => m.value === moduleName);

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('content-automation', {
        body: { module: moduleName },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || 'Module execution failed');

      setResult({
        items_total: data.items_total ?? 0,
        items_processed: data.items_processed ?? 0,
        items_succeeded: data.items_succeeded ?? 0,
        items_failed: data.items_failed ?? 0,
        flags_created: data.flags_created ?? 0,
        auto_approved: data.auto_approved ?? 0,
        errors: data.errors ?? [],
      });

      toast.success(`Processed ${data.items_processed ?? 0} items`);
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Wand2 style={{ height: 20, width: 20 }} />
              Bulk Content Enrichment
            </Box>
          </DialogTitle>
          <DialogDescription>
            Run automation modules to validate, enrich, and improve content in batch. Results appear
            in the Automation review queue.
          </DialogDescription>
        </DialogHeader>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
          {/* Module Selection */}
          <Box>
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
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5, display: 'block' }}
              >
                {selectedModule.description}
              </Typography>
            )}
          </Box>

          {/* Info box */}
          <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              The module will process items according to its configured batch size and create flags
              in the automation review queue. High-confidence changes may be auto-approved based on
              module settings.
            </Typography>
          </Box>

          {/* Progress */}
          {loading && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Loader2 style={{ height: 16, width: 16, animation: 'spin 1s linear infinite' }} />
                <Typography variant="body2">Running {selectedModule?.label}...</Typography>
              </Box>
              <LinearProgress sx={{ borderRadius: 1 }} />
            </Box>
          )}

          {/* Results */}
          {result && !loading && (
            <Box
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 2,
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircle style={{ height: 18, width: 18, color: '#16a34a' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Processing Complete
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <FileText style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
                  <Typography variant="body2">
                    <strong>{result.items_processed}</strong> / {result.items_total} processed
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Zap style={{ height: 14, width: 14, color: '#f59e0b' }} />
                  <Typography variant="body2">
                    <strong>{result.flags_created}</strong> flags created
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CheckCircle style={{ height: 14, width: 14, color: '#16a34a' }} />
                  <Typography variant="body2">
                    <strong>{result.auto_approved}</strong> auto-approved
                  </Typography>
                </Box>
                {result.items_failed > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AlertTriangle style={{ height: 14, width: 14, color: '#ef4444' }} />
                    <Typography variant="body2">
                      <strong>{result.items_failed}</strong> failed
                    </Typography>
                  </Box>
                )}
              </Box>

              {result.errors.length > 0 && (
                <Box
                  sx={{
                    mt: 1,
                    maxHeight: 100,
                    overflow: 'auto',
                    fontSize: '0.75rem',
                    color: 'error.main',
                  }}
                >
                  {result.errors.slice(0, 5).map((e, i) => (
                    <Typography
                      key={i}
                      variant="caption"
                      sx={{ display: 'block', color: 'error.main' }}
                    >
                      {e}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* Run button */}
          {!loading && (
            <Button onClick={handleRun} style={{ width: '100%' }}>
              <Wand2 style={{ height: 16, width: 16, marginRight: 8 }} />
              {result ? 'Run Again' : `Run ${selectedModule?.label || 'Module'}`}
            </Button>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
