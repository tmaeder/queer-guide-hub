import { useEffect, useId, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { memberRedirectApi } from '@/lib/redirects/memberApi';
import {
  createQrImage,
  previewHostedQr,
  qrPublicationInput,
  readQrImages,
  type CreatedQrImageLink,
  type QrImageLink,
} from '@/lib/redirects/qrImages';
import { qrTrackingUrl, type QrStyle } from '@/lib/redirects/qr';
import { toast } from 'sonner';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { AdminTextSkeleton, AdminInlineSpinner } from '@/components/admin/primitives/AdminLoading';

function imageStatus(row: QrImageLink) {
  return row.revokedAt
    ? 'Revoked'
    : row.expiresAt && Date.parse(row.expiresAt) <= Date.now()
      ? 'Expired'
      : row.state === 'pending'
        ? 'Unpublished draft'
        : 'Published';
}

/** The parent keys this surface by account, link and URL; bearers stay in local state. */
export function RedirectQrImageLinks({
  accountId,
  url,
  linkId,
  tracked,
  style,
  logoMode,
  ready,
  explicitAppearance,
  onBusy,
  purpose = 'visit',
}: {
  purpose?: 'visit' | 'install';
  accountId: string;
  url: string;
  linkId?: string;
  tracked: boolean;
  style: QrStyle;
  logoMode: 'saved' | 'none' | 'custom';
  ready: boolean;
  explicitAppearance: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const id = useId();
  const client = useQueryClient();
  const queryKey = ['redirect-qr-images', accountId];
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(0);
  const [fixed, setFixed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [issued, setIssued] = useState<CreatedQrImageLink | null>(null);
  const [preview, setPreview] = useState('');
  const [format, setFormat] = useState<'png' | 'jpg' | 'svg'>('png');
  const [manage, setManage] = useState(false);
  const [confirmation, setConfirmation] = useState<QrImageLink | null>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (confirmation) confirmationRef.current?.focus();
  }, [confirmation]);
  const operation = useRef<AbortController | null>(null);
  const objectUrl = useRef('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  useEffect(() => {
    onBusy(publishing);
    return () => onBusy(false);
  }, [publishing, onBusy]);
  const images = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => readQrImages(pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: manage,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const clearPreview = () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = '';
    setPreview('');
  };
  const verify = async (record: CreatedQrImageLink, controller: AbortController) => {
    setVerifying(true);
    setPreviewError('');
    clearPreview();
    try {
      const value = await previewHostedQr(
        record.imageUrls.png,
        qrTrackingUrl(url, tracked),
        controller.signal,
      );
      if (!alive.current || controller.signal.aborted) {
        URL.revokeObjectURL(value);
        return;
      }
      objectUrl.current = value;
      setPreview(value);
    } catch (err) {
      if (alive.current && !controller.signal.aborted)
        setPreviewError(err instanceof Error ? err.message : 'Could not verify the hosted image.');
    } finally {
      if (alive.current && !controller.signal.aborted) setVerifying(false);
    }
  };
  const publish = async () => {
    if (publishing || issued) return;
    const controller = new AbortController();
    operation.current = controller;
    setPublishing(true);
    setError('');
    try {
      const record = await createQrImage(
        qrPublicationInput({
          url,
          linkId,
          purpose,
          label,
          days,
          style,
          logoMode,
          followSaved: !fixed && !explicitAppearance,
        }),
        controller.signal,
      );
      if (!alive.current || controller.signal.aborted) return;
      setIssued(record);
      void client.invalidateQueries({ queryKey });
      await verify(record, controller);
    } catch (err) {
      if (alive.current && !controller.signal.aborted) {
        setError(
          (err instanceof Error ? err.message : 'Publication failed.') +
            ' Reload image links to review any created record before trying again.',
        );
      }
    } finally {
      if (alive.current && !controller.signal.aborted) setPublishing(false);
    }
  };
  const revoke = useMutation({
    mutationFn: (row: QrImageLink) =>
      memberRedirectApi<QrImageLink>('/qr-images/' + encodeURIComponent(row.id), 'DELETE', {
        version: row.version,
      }),
    onSuccess: (row) => {
      void client.invalidateQueries({ queryKey });
      if (!alive.current) return;
      if (issued?.id === row.id) {
        operation.current?.abort();
        clearPreview();
        setIssued(null);
        setPreviewError('');
        setVerifying(false);
      }
      setConfirmation(null);
      toast.success('QR image link revoked');
    },
  });
  const rows = images.data?.pages.flatMap((page) => page.data) ?? [];
  const askRevoke = (row: QrImageLink) => {
    revoke.reset();
    setConfirmation(row);
  };
  return (
    <section aria-label="Hosted QR image links" className="space-y-4 border-t pt-4">
      <h3 className="font-semibold">Hosted image</h3>
      <p className="text-sm">
        Publish an image URL for websites or emails. Anyone with the URL can view it until it
        expires, is revoked, or its creator loses access. URLs are shown once; save them before
        closing.
      </p>
      {!issued && (
        <fieldset disabled={publishing} className="space-y-4">
          <label htmlFor={id + '-label'} className="block space-y-1 text-sm">
            Image label
            <Input
              id={id + '-label'}
              value={label}
              maxLength={100}
              placeholder="e.g. Autumn newsletter"
              onChange={(event) => setLabel(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label htmlFor={id + '-lifetime'} className="block space-y-1 text-sm">
            Image link lifetime
            <select
              id={id + '-lifetime'}
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="h-10 w-full rounded-element border bg-background px-4"
            >
              <option value={0}>Until revoked</option>
              <option value={30}>30 days</option>
              <option value={365}>One year</option>
            </select>
          </label>
          {!explicitAppearance && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fixed}
                onChange={(event) => setFixed(event.target.checked)}
              />
              Keep the current appearance fixed
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            {fixed || explicitAppearance
              ? 'This image keeps the selected shapes and colors.'
              : 'This image follows future saved shape and color changes.'}{' '}
            {logoMode === 'custom'
              ? 'Your uploaded artwork will be publicly hosted for this image. Saved branding stays unchanged.'
              : logoMode === 'none'
                ? 'This image has no logo.'
                : 'This image follows the saved domain or workspace logo.'}
          </p>
          <Button disabled={!ready || !label.trim() || publishing} onClick={() => void publish()}>
            {publishing ? 'Publishing and verifying…' : 'Publish image link'}
          </Button>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {issued && (
        <div className="space-y-4">
          <p role="status" className="break-words text-sm">
            Published “{issued.label}”. Save its URLs before closing this dialog.
          </p>
          {verifying && (
            <p role="status" className="text-sm">
              Checking the hosted image…
            </p>
          )}
          {preview && (
            <img
              src={preview}
              alt={`Verified hosted QR for ${issued.label}`}
              width={256}
              height={256}
              className="mx-auto max-w-full"
            />
          )}
          {previewError && (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">
                {previewError}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={verifying || revoke.isPending}
                onClick={() => {
                  operation.current?.abort();
                  const controller = new AbortController();
                  operation.current = controller;
                  void verify(issued, controller);
                }}
              >
                Retry hosted preview
              </Button>
            </div>
          )}
          {preview && (
            <>
              <label htmlFor={id + '-format'} className="block space-y-1 text-sm">
                Image format
                <select
                  id={id + '-format'}
                  value={format}
                  onChange={(event) => setFormat(event.target.value as typeof format)}
                  className="h-10 w-full rounded-element border bg-background px-4"
                >
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="svg">SVG</option>
                </select>
              </label>
              <label htmlFor={id + '-url'} className="block space-y-1 text-sm">
                Published image URL
                <Input
                  id={id + '-url'}
                  value={issued.imageUrls[format]}
                  readOnly
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <Button
                size="sm"
                variant="outline"
                disabled={revoke.isPending}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(issued.imageUrls[format])
                    .then(() => toast.success('Image URL copied'))
                    .catch(() =>
                      toast.error('Could not copy image URL. Select and copy the field above.'),
                    );
                }}
              >
                Copy {format.toUpperCase()} image URL
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={publishing || revoke.isPending}
            onClick={() => askRevoke(issued)}
          >
            Revoke this image link
          </Button>
          <p className="text-xs text-muted-foreground">
            {purpose === 'install'
              ? 'Image requests and opening the app choice page do not record visits. Attribution is requested only when the visitor chooses an app handoff.'
              : 'Image requests do not count as redirect visits. Scanning a managed link records a QR visit.'}
          </p>
        </div>
      )}
      <details onToggle={(event) => setManage(event.currentTarget.open)}>
        <summary className="cursor-pointer py-2 text-sm font-semibold">Manage image links</summary>
        {manage && (
          <div className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              Your accessible image records. Owners can manage workspace records. Existing image
              URLs cannot be recovered; publish a new image if you lost one.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={images.isFetching || revoke.isPending}
              onClick={() => {
                setConfirmation(null);
                revoke.reset();
                void images.refetch();
              }}
            >
              Reload image links
            </Button>
            {images.isPending && <AdminTextSkeleton lines={3} />}
            {images.isError && <p role="alert">{images.error.message}</p>}
            {images.isSuccess && !rows.length && (
              <AdminEmpty
                noun="image links"
                variant="inline"
                description="Publish one using the controls above."
              />
            )}
            <ul className="divide-y">
              {rows.map((row) => (
                <li key={row.id} className="space-y-2 py-4">
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="break-words font-medium">{row.label}</p>
                    {row.purpose === 'install' && (
                      <p className="text-sm text-muted-foreground">App installation</p>
                    )}
                    <p>
                      {imageStatus(row)}
                      {row.linkId && row.linkId === linkId ? ' · This redirect' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(row.createdAt).toLocaleDateString()}
                      {row.expiresAt
                        ? ` · Expires ${new Date(row.expiresAt).toLocaleDateString()}`
                        : ' · No expiry'}
                    </p>
                  </div>
                  {!row.revokedAt && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={revoke.isPending || publishing}
                      onClick={() => askRevoke(row)}
                      aria-label={`Revoke “${row.label}”`}
                    >
                      Revoke image link
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {images.hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                disabled={images.isFetching}
                onClick={() => void images.fetchNextPage()}
              >
                {images.isFetchingNextPage ? (
                  <>
                    <AdminInlineSpinner /> More image links
                  </>
                ) : (
                  'Load more image links'
                )}
              </Button>
            )}
          </div>
        )}
      </details>
      {confirmation && (
        <div
          role="group"
          ref={confirmationRef}
          tabIndex={-1}
          aria-label="Confirm image link revocation"
          className="space-y-4 border-t pt-4"
        >
          <p className="break-words text-sm">
            Revoke “{confirmation.label}”? Embedded images using its URLs will stop loading.
            Downloaded codes still open the redirect.
          </p>
          {revoke.isError && (
            <p role="alert" className="text-sm text-destructive">
              {revoke.error.message} Reload image links before trying again.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              disabled={revoke.isPending || revoke.isError}
              onClick={() => revoke.mutate(confirmation)}
            >
              {revoke.isPending ? 'Revoking…' : 'Confirm revoke image link'}
            </Button>
            <Button
              variant="ghost"
              disabled={revoke.isPending}
              onClick={() => {
                setConfirmation(null);
                revoke.reset();
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
