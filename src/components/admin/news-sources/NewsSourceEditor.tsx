import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  sourceForm,
  sourceError,
  useSourcePublishers,
  useSaveNewsSource,
  useCreateSourcePublisher,
  type SourceRecord,
  type SourceForm,
} from '@/hooks/useNewsSourcesAdmin';

const selectClass = 'h-11 w-full rounded-element border border-input bg-background px-4 text-13';
export function NewsSourceEditor({
  source,
  organizationId,
  organizationName,
  disabled,
  canManagePublishers = true,
  onClose,
  onSaved,
}: {
  source?: SourceRecord;
  organizationId?: string;
  organizationName?: string;
  disabled?: boolean;
  canManagePublishers?: boolean;
  onClose: () => void;
  onSaved?: () => Promise<void>;
}) {
  const [form, setForm] = useState(() => sourceForm(source, organizationId));
  const [publisherSearch, setPublisherSearch] = useState('');
  const [publisherName, setPublisherName] = useState(source?.name ?? '');
  const [publisherWebsite, setPublisherWebsite] = useState('');
  const [createdPublisher, setCreatedPublisher] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [error, setError] = useState('');
  const save = useSaveNewsSource();
  const create = useCreateSourcePublisher();
  const publishers = useSourcePublishers(publisherSearch, form.url, canManagePublishers);
  const busy = save.isPending || create.isPending;
  const originalFrequency = source?.fetch_frequency;
  const preservingCadence =
    typeof originalFrequency === 'number' &&
    originalFrequency > 0 &&
    form.fetch_frequency === originalFrequency;
  const legacyCadence =
    typeof originalFrequency === 'number' &&
    originalFrequency > 0 &&
    (originalFrequency < 30 || originalFrequency > 10080);
  const patch = <K extends keyof SourceForm>(key: K, value: SourceForm[K]) =>
    setForm((old) => ({ ...old, [key]: value }));
  const options = publishers.data ?? [];
  const fallbackId = createdPublisher?.id ?? organizationId ?? source?.organization_id;
  const fallbackName = createdPublisher?.name ?? organizationName ?? source?.publisher_name;
  const saveSource = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || disabled) return;
    setError('');
    try {
      await save.mutateAsync({ source, form });
      await onSaved?.();
      toast.success('News source saved');
      onClose();
    } catch (failure) {
      setError(sourceError(failure));
    }
  };
  const createPublisher = async () => {
    if (busy || disabled) return;
    setError('');
    try {
      const publisher = await create.mutateAsync({
        name: publisherName,
        website: publisherWebsite,
      });
      if (!publisher?.id) throw new Error('Publisher was not created. Please retry.');
      setCreatedPublisher(publisher);
      patch('organization_id', publisher.id);
      toast.success('Draft publisher created. Save this source to attach it.');
    } catch (failure) {
      setError(sourceError(failure));
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{source ? 'Edit news source' : 'Add news source'}</DialogTitle>
          <DialogDescription>
            A feed belongs to a publisher Organisation. Ingestion health is managed by the pipeline.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={saveSource} className="space-y-6">
          <fieldset disabled={busy || disabled} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="source-name">Feed name</Label>
              <Input
                id="source-name"
                required
                minLength={2}
                maxLength={255}
                value={form.name}
                onChange={(e) => patch('name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-category">Category</Label>
              <Input
                id="source-category"
                required
                maxLength={100}
                value={form.category}
                onChange={(e) => patch('category', e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="source-url">Feed URL</Label>
              <Input
                id="source-url"
                type="url"
                required
                maxLength={2048}
                value={form.url}
                onChange={(e) => patch('url', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-type">Source type</Label>
              <select
                id="source-type"
                className={selectClass}
                value={form.source_type}
                onChange={(e) => patch('source_type', e.target.value)}
              >
                {[
                  ['rss', 'RSS'],
                  ['api', 'API'],
                  ['news_api', 'News API'],
                  ['wikimedia', 'Wikinews'],
                  ['social', 'Social'],
                  ['manual', 'Manual'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-feed-type">Feed type</Label>
              <select
                id="source-feed-type"
                className={selectClass}
                value={form.feed_type}
                onChange={(e) => patch('feed_type', e.target.value)}
              >
                <option value="news">News</option>
                <option value="podcast">Podcast</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-frequency">Fetch frequency (minutes)</Label>
              <Input
                id="source-frequency"
                type="number"
                required
                min={preservingCadence ? Math.min(30, originalFrequency) : 30}
                max={preservingCadence ? Math.max(10080, originalFrequency) : 10080}
                step={1}
                value={form.fetch_frequency}
                onChange={(e) => patch('fetch_frequency', Number(e.target.value))}
              />
              {legacyCadence && (
                <p className="text-13 text-muted-foreground">
                  Keep the existing cadence, or choose 30–10,080 minutes to change it.
                </p>
              )}
            </div>
            <div className="flex flex-col justify-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-current"
                  checked={form.is_active}
                  onChange={(e) => patch('is_active', e.target.checked)}
                />
                Enabled for ingestion
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-current"
                  checked={form.auto_publish}
                  onChange={(e) => patch('auto_publish', e.target.checked)}
                />
                Allow automatic publication after quality approval
              </label>
            </div>
            {source?.auto_paused && (
              <p className="text-13 sm:col-span-2">
                Automatically paused: {source.auto_paused_reason ?? 'Ingestion failures'}. Use
                Resume in the source list to allow another attempt.
              </p>
            )}
            {form.feed_type === 'podcast' &&
              (
                [
                  ['apple_podcasts_url', 'Apple Podcasts URL'],
                  ['spotify_url', 'Spotify URL'],
                  ['youtube_url', 'YouTube URL'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`source-${key}`}>{label}</Label>
                  <Input
                    id={`source-${key}`}
                    type="url"
                    pattern="https://.*"
                    maxLength={2048}
                    value={form[key]}
                    onChange={(e) => patch(key, e.target.value)}
                  />
                  <p className="text-13 text-muted-foreground">
                    Optional. The show's page on this platform (https). Shown as a "Listen on" link
                    on the public show page.
                  </p>
                </div>
              ))}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="source-keywords">Keywords (one per line)</Label>
              <Textarea
                id="source-keywords"
                value={form.keywords.join('\n')}
                onChange={(e) => patch('keywords', e.target.value.split('\n'))}
              />
            </div>
          </fieldset>
          {canManagePublishers ? (
            <>
              <fieldset disabled={busy || disabled} className="space-y-4 border-t pt-4">
                <legend className="font-medium">Publisher Organisation</legend>
                <p className="text-13 text-muted-foreground">
                  Choose an Organisation with the Publisher role, or leave an aggregator unlinked.
                  Publisher identity is edited in Organisations.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="publisher-search">Find publisher</Label>
                  <Input
                    id="publisher-search"
                    value={publisherSearch}
                    onChange={(e) => setPublisherSearch(e.target.value)}
                    placeholder="Search name or domain"
                  />
                </div>
                {publishers.isError && (
                  <div role="alert" className="flex flex-wrap gap-2">
                    <p>Could not load publishers.</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void publishers.refetch()}
                    >
                      Retry publishers
                    </Button>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="source-publisher">Publisher</Label>
                  <select
                    id="source-publisher"
                    className={selectClass}
                    value={form.organization_id ?? ''}
                    onChange={(e) => patch('organization_id', e.target.value || null)}
                  >
                    <option value="">Unlinked</option>
                    {fallbackId && !options.some((p) => p.id === fallbackId) && (
                      <option value={fallbackId}>{fallbackName ?? 'Current publisher'}</option>
                    )}
                    {options.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.domain_match ? ' — domain matches feed' : ''}
                        {p.status === 'draft' ? ' (draft)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {options.some((p) => p.domain_match) && (
                  <p className="text-13">
                    Domain matches are suggestions. Review the publisher before saving.
                  </p>
                )}
                {options.length === 50 && (
                  <p className="text-13">Refine your search to find another publisher.</p>
                )}
                {form.organization_id && (
                  <Link
                    className="inline-block text-13 underline underline-offset-4"
                    target="_blank"
                    rel="noreferrer"
                    to={`/admin/content/organizations?edit=${form.organization_id}`}
                  >
                    Edit publisher in Organisations
                  </Link>
                )}
                <details className="space-y-4">
                  <summary className="cursor-pointer font-medium">Create a draft Publisher</summary>
                  <div className="space-y-2">
                    <Label htmlFor="publisher-name">Organisation name</Label>
                    <Input
                      id="publisher-name"
                      minLength={2}
                      maxLength={255}
                      value={publisherName}
                      onChange={(e) => setPublisherName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="publisher-website">Organisation website</Label>
                    <Input
                      id="publisher-website"
                      type="url"
                      value={publisherWebsite}
                      onChange={(e) => setPublisherWebsite(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!publisherName.trim() || busy}
                    onClick={() => void createPublisher()}
                  >
                    {create.isPending ? 'Creating…' : 'Create Publisher'}
                  </Button>
                </details>
              </fieldset>
            </>
          ) : (
            <div className="space-y-2 border-t pt-4">
              <p className="font-medium">Publisher: {source?.publisher_name ?? 'Unlinked'}</p>
              <p className="text-13 text-muted-foreground">
                Publisher relationships are managed by administrators.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-13 text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || disabled}>
              {save.isPending ? 'Saving…' : 'Save source'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
