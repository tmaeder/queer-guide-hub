import { useState, useEffect } from 'react';
import { Link2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Redirect, RedirectFormData, RedirectType, QueryMode } from '@/hooks/useRedirects';
import {
  validateSlug,
  validateTarget,
  validateSourcePath,
  detectLoop,
} from '@/lib/redirects/validation';

interface RedirectFormDialogProps {
  open: boolean;
  editingRedirect: Redirect | null;
  onClose: () => void;
  onSave: (data: RedirectFormData) => Promise<void>;
}

export function RedirectFormDialog({ open, editingRedirect, onClose, onSave }: RedirectFormDialogProps) {
  const [type, setType] = useState<RedirectType>('SHORT');
  const [slug, setSlug] = useState('');
  const [sourcePath, setSourcePath] = useState('');
  const [matchKind, setMatchKind] = useState<'EXACT' | 'WILDCARD' | 'REGEX'>('EXACT');
  const [target, setTarget] = useState('');
  const [statusCode, setStatusCode] = useState(301);
  const [isEnabled, setIsEnabled] = useState(true);
  const [queryMode, setQueryMode] = useState<QueryMode>('PRESERVE');
  const [queryOverride, setQueryOverride] = useState('');
  const [utmDefaults, setUtmDefaults] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [clickLimit, setClickLimit] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && editingRedirect) {
      setType(editingRedirect.type);
      setSlug(editingRedirect.slug || '');
      setSourcePath(editingRedirect.source_path || '');
      setMatchKind(editingRedirect.match_kind);
      setTarget(editingRedirect.target);
      setStatusCode(editingRedirect.status_code);
      setIsEnabled(editingRedirect.is_enabled);
      setQueryMode(editingRedirect.query_mode);
      setQueryOverride(
        editingRedirect.query_override ? JSON.stringify(editingRedirect.query_override) : '',
      );
      setUtmDefaults(
        editingRedirect.utm_defaults ? JSON.stringify(editingRedirect.utm_defaults) : '',
      );
      setStartAt(editingRedirect.start_at ? editingRedirect.start_at.substring(0, 16) : '');
      setEndAt(editingRedirect.end_at ? editingRedirect.end_at.substring(0, 16) : '');
      setClickLimit(editingRedirect.click_limit ? String(editingRedirect.click_limit) : '');
      setNotes(editingRedirect.notes || '');
    } else if (open) {
      setType('SHORT');
      setSlug('');
      setSourcePath('');
      setMatchKind('EXACT');
      setTarget('');
      setStatusCode(301);
      setIsEnabled(true);
      setQueryMode('PRESERVE');
      setQueryOverride('');
      setUtmDefaults('');
      setStartAt('');
      setEndAt('');
      setClickLimit('');
      setNotes('');
    }
    setValidationErrors({});
  }, [open, editingRedirect]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (type === 'SHORT') {
      const sv = validateSlug(slug);
      if (!sv.valid) errs.slug = sv.error!;
    } else {
      const pv = validateSourcePath(sourcePath);
      if (!pv.valid) errs.sourcePath = pv.error!;
    }
    const tv = validateTarget(target);
    if (!tv.valid) errs.target = tv.error!;
    if (tv.valid) {
      const loop = detectLoop(type === 'SHORT' ? `/go/${slug}` : sourcePath, target);
      if (!loop.safe) errs.target = loop.error!;
    }
    if (queryOverride) {
      try {
        JSON.parse(queryOverride);
      } catch {
        errs.queryOverride = 'Must be valid JSON';
      }
    }
    if (utmDefaults) {
      try {
        JSON.parse(utmDefaults);
      } catch {
        errs.utmDefaults = 'Must be valid JSON';
      }
    }
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    await onSave({
      type,
      slug: type === 'SHORT' ? slug.toLowerCase().trim() : undefined,
      source_path: type === 'PATH' ? sourcePath.trim() : undefined,
      match_kind: matchKind,
      target: target.trim(),
      status_code: statusCode,
      is_enabled: isEnabled,
      query_mode: queryMode,
      query_override: queryOverride ? JSON.parse(queryOverride) : null,
      utm_defaults: utmDefaults ? JSON.parse(utmDefaults) : null,
      start_at: startAt || null,
      end_at: endAt || null,
      click_limit: clickLimit ? parseInt(clickLimit, 10) : null,
      notes: notes || undefined,
    });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingRedirect ? 'Edit Redirect' : 'New Redirect'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col" style={{ gap: 16, paddingTop: 8 }}>
          <Tabs value={type} onValueChange={(v) => setType(v as RedirectType)} style={{ marginBottom: 8 }}>
            <TabsList>
              <TabsTrigger value="SHORT" className="flex items-center" style={{ gap: 4 }}>
                <Link2 size={16} />
                Short Link
              </TabsTrigger>
              <TabsTrigger value="PATH" className="flex items-center" style={{ gap: 4 }}>
                <ArrowRight size={16} />
                Path Redirect
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {type === 'SHORT' ? (
            <div>
              <Label>Slug</Label>
              <div className="flex items-center" style={{ gap: 4 }}>
                <span style={{ color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>/go/</span>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="flex-1"
                />
              </div>
              <p
                className="text-xs"
                style={{ marginTop: 4, color: validationErrors.slug ? 'hsl(var(--destructive))' : 'var(--muted-foreground)' }}
              >
                {validationErrors.slug || `Short URL: queer.guide/go/${slug || '...'}`}
              </p>
            </div>
          ) : (
            <div className="flex" style={{ gap: 8 }}>
              <div className="flex-1">
                <Label>Source Path</Label>
                <Input
                  value={sourcePath}
                  onChange={(e) => setSourcePath(e.target.value)}
                  placeholder="/old/page"
                />
                {validationErrors.sourcePath && (
                  <p className="text-xs" style={{ marginTop: 4, color: 'hsl(var(--destructive))' }}>
                    {validationErrors.sourcePath}
                  </p>
                )}
              </div>
              <div style={{ minWidth: 120 }}>
                <Label>Match</Label>
                <Select value={matchKind} onValueChange={(v) => setMatchKind(v as 'EXACT' | 'WILDCARD' | 'REGEX')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXACT">Exact</SelectItem>
                    <SelectItem value="WILDCARD">Wildcard</SelectItem>
                    <SelectItem value="REGEX">Regex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div>
            <Label>Target URL</Label>
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="/events/pride-zurich-2026"
            />
            <p
              className="text-xs"
              style={{ marginTop: 4, color: validationErrors.target ? 'hsl(var(--destructive))' : 'var(--muted-foreground)' }}
            >
              {validationErrors.target || 'Relative path (/page) or allowlisted absolute URL'}
            </p>
          </div>

          <div className="flex" style={{ gap: 16 }}>
            <div style={{ minWidth: 140, flex: 1 }}>
              <Label>HTTP Status</Label>
              <Select value={String(statusCode)} onValueChange={(v) => setStatusCode(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="301">301 Permanent</SelectItem>
                  <SelectItem value="302">302 Temporary</SelectItem>
                  <SelectItem value="307">307 Temporary</SelectItem>
                  <SelectItem value="308">308 Permanent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div style={{ minWidth: 140, flex: 1 }}>
              <Label>Query Params</Label>
              <Select value={queryMode} onValueChange={(v) => setQueryMode(v as QueryMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRESERVE">Preserve</SelectItem>
                  <SelectItem value="DROP">Drop</SelectItem>
                  <SelectItem value="OVERRIDE">Override</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {queryMode === 'OVERRIDE' && (
            <div>
              <Label>Query Override (JSON)</Label>
              <Input
                value={queryOverride}
                onChange={(e) => setQueryOverride(e.target.value)}
              />
              <p
                className="text-xs"
                style={{ marginTop: 4, color: validationErrors.queryOverride ? 'hsl(var(--destructive))' : 'var(--muted-foreground)' }}
              >
                {validationErrors.queryOverride || 'e.g. {"ref":"campaign-a"}'}
              </p>
            </div>
          )}

          <div>
            <Label>UTM Defaults (JSON, optional)</Label>
            <Input value={utmDefaults} onChange={(e) => setUtmDefaults(e.target.value)} />
            <p
              className="text-xs"
              style={{ marginTop: 4, color: validationErrors.utmDefaults ? 'hsl(var(--destructive))' : 'var(--muted-foreground)' }}
            >
              {validationErrors.utmDefaults || 'Added if not already present'}
            </p>
          </div>

          <div className="flex" style={{ gap: 16 }}>
            <div className="flex-1">
              <Label>Start (optional)</Label>
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label>End (optional)</Label>
              <Input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
          </div>

          <div className="flex" style={{ gap: 16 }}>
            <div style={{ width: 160 }}>
              <Label>Click Limit (optional)</Label>
              <Input
                type="number"
                value={clickLimit}
                onChange={(e) => setClickLimit(e.target.value)}
              />
            </div>
            <div className="flex items-center self-end" style={{ gap: 8, height: 40 }}>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
              <span className="text-sm">{isEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : editingRedirect ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
