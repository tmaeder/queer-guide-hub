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

export function QrExport({ url }: { url: string }) {
  const qr = useQuery({
    queryKey: ['redirect-qr', url],
    staleTime: Infinity,
    queryFn: async () => {
      const code = await import('qrcode');
      const options = {
        errorCorrectionLevel: 'M' as const,
        margin: 4,
        width: 512,
      };
      return {
        png: await code.toDataURL(url, options),
        svg: await code.toString(url, { ...options, type: 'svg' }),
      };
    },
  });
  return (
    <div className="space-y-4">
      <p className="break-all font-mono text-xs">{url}</p>
      {qr.isPending && <p role="status">Generating QR code…</p>}
      {qr.isError && (
        <p role="alert" className="text-destructive">
          Could not generate this QR code. Try a shorter link.
        </p>
      )}
      {qr.data && (
        <img
          src={qr.data.png}
          width={256}
          height={256}
          alt={`QR code for ${url}`}
          className="mx-auto max-w-full"
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void navigator.clipboard
              .writeText(url)
              .then(() => toast.success('Link copied'))
              .catch(() => toast.error('Could not copy link'))
          }
        >
          Copy link
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!qr.data}
          onClick={() => qr.data && downloadQr(qr.data.png, 'queerguide-qr.png')}
        >
          Download PNG
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!qr.data}
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
    </div>
  );
}

export function RedirectQrDialog({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share a QR code</DialogTitle>
          <DialogDescription>
            The QR code opens this URL. Create a tracked link to collect visit analytics.
          </DialogDescription>
        </DialogHeader>
        <QrExport url={url} />
      </DialogContent>
    </Dialog>
  );
}
