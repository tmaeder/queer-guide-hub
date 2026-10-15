import { useAuth } from '@/hooks/useAuth';
import { useRedirectQrStyle } from '@/hooks/useRedirectQrStyle';
import { useQrExportStyle } from '@/hooks/useQrExportStyle';
import { qrAppearance } from '@/lib/redirects/qrLogos';
import { QrExportLogoChoice } from './QrExportLogoChoice';
import { useCallback, useId, useState } from 'react';
import { installEntryUrl } from '@/lib/redirects/installLink';
import { RedirectQrImageLinks } from './RedirectQrImageLinks';
import {
  DEFAULT_QR_STYLE,
  qrStyleError,
  generateQr,
  qrTrackingUrl,
  type QrStyle,
} from '@/lib/redirects/qr';
import { QrStyleFields } from './QrStyleFields';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

function downloadQr(url: string, name: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function QrExport({
  url,
  managedShortLink = false,
  linkId,
}: {
  url: string;
  managedShortLink?: boolean;
  linkId?: string;
}) {
  const { user } = useAuth();
  const id = useId();
  const baseScope = JSON.stringify([user?.id, url, linkId, managedShortLink]);
  const [installScope, setInstallScope] = useState<string | null>(null);
  const installUrl = managedShortLink ? installEntryUrl(url) : null;
  const install = !!installUrl && installScope === baseScope;
  const targetUrl = install ? installUrl : url;
  const scope = JSON.stringify([user?.id, targetUrl, linkId]);
  const edits = useQrExportStyle(scope);
  const [publishingScope, setPublishingScope] = useState<string | null>(null);
  const publishing = publishingScope === scope;
  const setPublishing = useCallback(
    (busy: boolean) => {
      setPublishingScope((previous) => (busy ? scope : previous === scope ? null : previous));
    },
    [scope],
  );
  const [logoBusyScope, setLogoBusyScope] = useState<string | null>(null);
  const logoBusy = logoBusyScope === scope;
  const setLogoBusy = (busy: boolean) =>
    setLogoBusyScope((previous) => (busy ? scope : previous === scope ? null : previous));
  const [fallbackScope, setFallbackScope] = useState<string | null>(null);
  const standard = fallbackScope === scope;
  const defaults = useRedirectQrStyle(linkId, standard || edits.skipLogos);
  const ready = !logoBusy && (standard || (defaults.isSuccess && !defaults.isFetching));
  const baseline = standard ? DEFAULT_QR_STYLE : (defaults.data?.style ?? DEFAULT_QR_STYLE);
  const style = edits.compose(baseline);
  const setStyle = (value: React.SetStateAction<QrStyle>) => edits.change(baseline, value);
  const error = qrStyleError(style);
  const qr = useQuery({
    queryKey: [
      'redirect-qr',
      user?.id,
      targetUrl,
      qrAppearance(style),
      style.logoIdentity,
      managedShortLink,
    ],
    staleTime: Infinity,
    gcTime: 60000,
    retry: false,
    enabled: ready && !error,
    queryFn: async ({ signal }) => {
      return generateQr(qrTrackingUrl(targetUrl, managedShortLink), style, signal);
    },
  });
  return (
    <div className="space-y-4">
      {installUrl && (
        <fieldset className="space-y-2" disabled={publishing || logoBusy}>
          <legend className="mb-2 text-sm font-medium">QR destination</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                className="accent-foreground"
                name={id + '-purpose'}
                checked={!install}
                onChange={() => setInstallScope(null)}
              />
              Open link
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                className="accent-foreground"
                name={id + '-purpose'}
                checked={install}
                onChange={() => setInstallScope(baseScope)}
              />
              App installation
            </label>
          </div>
          {install && (
            <p className="text-sm text-muted-foreground">
              Opens the app choice page without recording a visit. Requires a published app with
              handoffs enabled. Save hosted image URLs before switching.
            </p>
          )}
        </fieldset>
      )}
      <div className="space-y-2">
        <p className="break-all font-mono text-xs">{targetUrl}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void navigator.clipboard
              .writeText(targetUrl)
              .then(() => toast.success('Link copied'))
              .catch(() => toast.error('Could not copy link'))
          }
        >
          {install ? 'Copy install link' : 'Copy link'}
        </Button>
      </div>
      {!ready && !defaults.isError && <p role="status">Loading saved QR style…</p>}
      {defaults.isError && !standard && (
        <div className="space-y-2">
          <p role="alert">
            Could not load saved QR style. Retry or explicitly use the standard style.
          </p>
          <Button variant="outline" disabled={publishing} onClick={() => void defaults.refetch()}>
            Retry saved QR style
          </Button>
          <Button
            variant="outline"
            disabled={publishing}
            onClick={() => {
              edits.reset();
              setFallbackScope(scope);
            }}
          >
            Use standard style for this export
          </Button>
        </div>
      )}
      {ready && (
        <p className="text-sm">
          {standard
            ? 'Standard appearance for this export.'
            : `Saved ${defaults.data?.source ?? 'default'} appearance loaded.`}
        </p>
      )}
      <QrExportLogoChoice
        mode={standard && edits.logoMode === 'saved' ? 'none' : edits.logoMode}
        hide={edits.hideLogo}
        saved={() => {
          edits.savedLogo();
          setFallbackScope(null);
          void defaults.refetch();
        }}
        disabled={logoBusy || publishing}
      />
      <QrStyleFields
        key={scope}
        style={style}
        setStyle={setStyle}
        disabled={!ready || publishing}
        onBusy={setLogoBusy}
      />
      {(edits.hasAppearance || standard) && (
        <Button
          variant="ghost"
          disabled={publishing}
          onClick={() => {
            edits.savedAppearance();
            setFallbackScope(null);
            void defaults.refetch();
          }}
        >
          Use saved appearance
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!error && ready && qr.isPending && <p role="status">Generating QR code…</p>}
      {!error && ready && qr.isError && (
        <p role="alert" className="text-destructive">
          {qr.error instanceof Error
            ? qr.error.message
            : 'Could not generate this QR code. Try a shorter link.'}
        </p>
      )}
      {!error && ready && qr.data && (
        <img
          src={qr.data.png}
          width={256}
          height={256}
          alt={`QR code for ${targetUrl}`}
          className="mx-auto max-w-full"
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!ready || !!error || !qr.data}
          onClick={() => qr.data && downloadQr(qr.data.png, 'queerguide-qr.png')}
        >
          Download PNG
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!ready || !!error || !qr.data}
          onClick={() => qr.data && downloadQr(qr.data.jpg, 'queerguide-qr.jpg')}
        >
          Download JPG
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!ready || !!error || !qr.data}
          onClick={() => {
            if (!qr.data) return;
            void (async () => {
              try {
                if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')
                  throw new Error('Image clipboard unavailable');
                const blob = await (await fetch(qr.data!.png)).blob();
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                toast.success('QR image copied');
              } catch {
                toast.error('Could not copy the image. Download PNG instead.');
              }
            })();
          }}
        >
          Copy image
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!ready || !!error || !qr.data}
          onClick={() =>
            qr.data &&
            void navigator.clipboard
              .writeText(qr.data.png)
              .then(() => toast.success('QR data URL copied'))
              .catch(() => toast.error('Could not copy image URL'))
          }
        >
          Copy image data URL
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!ready || !!error || !qr.data}
          onClick={() => {
            if (!qr.data) return;
            const objectUrl = URL.createObjectURL(
              new Blob([qr.data.svg], { type: 'image/svg+xml' }),
            );
            downloadQr(objectUrl, 'queerguide-qr.svg');
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
          }}
        >
          Download SVG
        </Button>
      </div>
      {user?.id && (
        <RedirectQrImageLinks
          key={'hosted:' + scope}
          accountId={user.id}
          url={targetUrl}
          purpose={install ? 'install' : 'visit'}
          linkId={linkId}
          tracked={managedShortLink}
          style={style}
          logoMode={standard && edits.logoMode === 'saved' ? 'none' : edits.logoMode}
          ready={ready && !error && !!qr.data && !qr.isFetching}
          explicitAppearance={standard || edits.hasAppearance}
          onBusy={setPublishing}
        />
      )}
    </div>
  );
}

export function RedirectQrDialog({
  url,
  onClose,
  managedShortLink = false,
  linkId,
}: {
  url: string;
  onClose: () => void;
  managedShortLink?: boolean;
  linkId?: string;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share a QR code</DialogTitle>
          <DialogDescription>
            {managedShortLink
              ? 'Share the link directly, or open its app installation page. Visitors choose whether to allow an app handoff.'
              : 'The QR code opens this URL. Create a tracked link to collect visit analytics.'}
          </DialogDescription>
        </DialogHeader>
        <QrExport key={url} url={url} managedShortLink={managedShortLink} linkId={linkId} />
      </DialogContent>
    </Dialog>
  );
}
