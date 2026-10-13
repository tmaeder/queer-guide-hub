import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useRedirects } from '@/hooks/useRedirects';
import {
  buildCampaignDestination,
  CAMPAIGN_FIELDS,
  LINK_ORIGIN,
  suggestCampaignSlug,
  type CampaignFields,
} from '@/lib/redirects/linkTools';
import { validateSlug } from '@/lib/redirects/validation';
import type { InventoryRedirect } from '@/lib/redirects/inventory';
import { QrExport } from './RedirectQrDialog';

export function RedirectLinkBuilder({
  seed,
  onClose,
}: {
  seed: InventoryRedirect | null;
  onClose: () => void;
}) {
  const [target, setTarget] = useState(seed?.target ?? '');
  const [slug, setSlug] = useState(suggestCampaignSlug(seed?.target ?? ''));
  const [campaign, setCampaign] = useState<CampaignFields>(seed?.campaign ?? {});
  const [parameters, setParameters] = useState<Array<{ id: string; key: string; value: string }>>(
    Object.entries(seed?.prefill ?? {}).map(([key, value]) => ({ id: key, key, value })),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const { createRedirect } = useRedirects();
  const client = useQueryClient();
  let destination = '';
  let destinationError = '';
  try {
    destination = buildCampaignDestination(target, campaign, parameters);
  } catch (err) {
    destinationError = err instanceof Error ? err.message : 'Invalid destination';
  }

  const save = async () => {
    setError('');
    const valid = validateSlug(slug);
    if (!valid.valid || destinationError) {
      setError(valid.error ?? destinationError);
      return;
    }
    setSaving(true);
    try {
      const created = await createRedirect({
        type: 'SHORT',
        slug,
        target: destination,
        match_kind: 'EXACT',
        status_code: 302,
        is_enabled: true,
        query_mode: 'PRESERVE',
      });
      if (!created)
        throw new Error(
          'Could not create the link. Check that the slug is available and try again.',
        );
      setSavedUrl(`${LINK_ORIGIN}/go/${created.slug}`);
      await client.invalidateQueries({ queryKey: ['cms-content-list'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create link');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{savedUrl ? 'Your tracked link' : 'Create a tracked link'}</DialogTitle>
          <DialogDescription>
            {savedUrl
              ? 'Visits through this short link will appear in its tracking report.'
              : 'Create a short link with campaign tags and optional destination prefill parameters.'}
          </DialogDescription>
        </DialogHeader>
        {savedUrl ? (
          <QrExport url={savedUrl} />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="campaign-target">Destination</Label>
              <Input
                id="campaign-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="/events/pride-zurich"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-slug">Short-link slug</Label>
              <Input
                id="campaign-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                required
              />
              <p className="break-all text-xs text-muted-foreground">
                {LINK_ORIGIN}/go/{slug}
              </p>
            </div>
            <fieldset>
              <legend className="mb-2 font-medium">Campaign tracking</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {CAMPAIGN_FIELDS.map((key) => (
                  <div className="space-y-2" key={key}>
                    <Label htmlFor={key}>
                      {key.replace('utm_', '').replace(/^./, (letter) => letter.toUpperCase())}
                    </Label>
                    <Input
                      id={key}
                      value={campaign[key] ?? ''}
                      onChange={(e) => setCampaign({ ...campaign, [key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="font-medium">Destination prefill</legend>
              <p className="text-xs text-muted-foreground">
                Add query parameters for pages that accept them. Existing parameters and URL
                fragments are preserved.
              </p>
              {parameters.map((parameter) => (
                <div className="flex flex-wrap gap-2" key={parameter.id}>
                  <Input
                    className="min-w-0 flex-1 basis-32"
                    aria-label="Parameter name"
                    placeholder="Parameter name"
                    value={parameter.key}
                    onChange={(e) =>
                      setParameters(
                        parameters.map((p) =>
                          p.id === parameter.id ? { ...p, key: e.target.value } : p,
                        ),
                      )
                    }
                  />
                  <Input
                    className="min-w-0 flex-1 basis-32"
                    aria-label="Parameter value"
                    placeholder="Value"
                    value={parameter.value}
                    onChange={(e) =>
                      setParameters(
                        parameters.map((p) =>
                          p.id === parameter.id ? { ...p, value: e.target.value } : p,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setParameters(parameters.filter((p) => p.id !== parameter.id))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setParameters([...parameters, { id: crypto.randomUUID(), key: '', value: '' }])
                }
              >
                Add parameter
              </Button>
            </fieldset>
            {destination && (
              <div className="rounded-element bg-muted p-4">
                <p className="mb-2 text-xs font-medium">Destination preview</p>
                <p className="break-all font-mono text-xs">{destination}</p>
              </div>
            )}
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={saving || !!destinationError}>
              {saving ? 'Creating…' : 'Create tracked link'}
            </Button>
            {target && destinationError && (
              <p className="text-xs text-muted-foreground">{destinationError}</p>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
