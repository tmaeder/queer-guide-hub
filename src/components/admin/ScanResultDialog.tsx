import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ShieldCheck, ShieldAlert, ShieldQuestion, RotateCcw } from 'lucide-react';
import type { ContentLink } from '@/hooks/useContentLinks';

interface ScanResultDialogProps {
  open: boolean;
  link: ContentLink | null;
  onClose: () => void;
  onRescan: () => void;
  scanning?: boolean;
}

const VERDICT_CONFIG: Record<string, { className: string; label: string; Icon: typeof ShieldCheck }> = {
  benign: { className: 'bg-green-500/10 text-green-700 border-green-500/30', label: 'Safe', Icon: ShieldCheck },
  malicious: { className: 'bg-destructive/10 text-destructive border-destructive/30', label: 'Malicious', Icon: ShieldAlert },
  suspicious: { className: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30', label: 'Suspicious', Icon: ShieldQuestion },
};

export function ScanResultDialog({ open, link, onClose, onRescan, scanning }: ScanResultDialogProps) {
  if (!link) return null;

  const verdict = link.scan_verdict ?? null;
  const config = verdict ? VERDICT_CONFIG[verdict] : null;
  const score = link.scan_score ?? 0;
  const categories = link.scan_categories ?? [];
  const brands = link.scan_brands ?? [];
  const screenshotUrl = link.scan_screenshot_url;
  const scanId = link.scan_id;
  const scannedAt = link.scanned_at;

  const hasResults = !!scanId;
  const scoreColor = score > 50 ? 'text-destructive' : score > 20 ? 'text-yellow-600' : 'text-green-600';
  const barColor = score > 50 ? 'bg-destructive' : score > 20 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogTitle>
          <span className="flex items-center gap-2">
            URL Scan Result
            {config && (
              <Badge variant="outline" className={`${config.className} text-xs`}>
                <config.Icon className="w-3.5 h-3.5 mr-1" />
                {config.label}
              </Badge>
            )}
          </span>
        </DialogTitle>

        <p className="font-mono text-xs mb-4 break-all">
          {link.original_url}
        </p>

        {!hasResults ? (
          <div className="text-center py-8">
            <ShieldQuestion className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              This URL has not been scanned yet.
            </p>
            <span className="text-xs text-muted-foreground">
              Click "Scan Now" to analyze this URL with URLScan.io
            </span>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <span className="text-xs text-muted-foreground">Threat Score</span>
                <span className={`text-xs font-bold ${scoreColor}`}>
                  {score}/100
                </span>
              </div>
              <div className="w-full h-2 rounded-sm bg-muted overflow-hidden">
                <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, score)}%` }} />
              </div>
            </div>

            {screenshotUrl && (
              <div className="mb-4 rounded-sm overflow-hidden border border-border">
                <img
                  src={screenshotUrl}
                  alt="Page screenshot"
                  role="presentation"
                  className="w-full block"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}

            {categories.length > 0 && (
              <div className="mb-4">
                <span className="text-xs text-muted-foreground mb-1 block">
                  Categories
                </span>
                <div className="flex flex-wrap gap-1">
                  {categories.map((cat, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{cat}</Badge>
                  ))}
                </div>
              </div>
            )}

            {brands.length > 0 && (
              <div className="mb-4">
                <span className="text-xs text-destructive mb-1 block font-semibold">
                  Brand Impersonation Detected
                </span>
                <div className="flex flex-wrap gap-1">
                  {brands.map((brand, i) => (
                    <Badge key={i} variant="outline" className="text-xs text-destructive border-destructive">{brand}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mt-4 pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Scanned: {scannedAt ? new Date(scannedAt).toLocaleString() : 'Unknown'}
              </span>
              {scanId && (
                <a
                  href={`https://urlscan.io/result/${scanId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-sky-500 no-underline"
                >
                  View on URLScan.io <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={onRescan} disabled={scanning}>
            <RotateCcw className={`w-4 h-4 mr-2 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : hasResults ? 'Re-scan' : 'Scan Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ScanResultDialog;
