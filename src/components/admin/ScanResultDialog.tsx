import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import MuiButton from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import { ExternalLink, ShieldCheck, ShieldAlert, ShieldQuestion, RotateCcw } from 'lucide-react';
import type { ContentLink } from '@/hooks/useContentLinks';

interface ScanResultDialogProps {
  open: boolean;
  link: ContentLink | null;
  onClose: () => void;
  onRescan: () => void;
  scanning?: boolean;
}

const VERDICT_CONFIG: Record<string, { color: 'success' | 'error' | 'warning' | 'default'; label: string; Icon: typeof ShieldCheck }> = {
  benign: { color: 'success', label: 'Safe', Icon: ShieldCheck },
  malicious: { color: 'error', label: 'Malicious', Icon: ShieldAlert },
  suspicious: { color: 'warning', label: 'Suspicious', Icon: ShieldQuestion },
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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        URL Scan Result
        {config && (
          <Chip
            size="small"
            label={config.label}
            color={config.color}
            icon={<config.Icon style={{ width: 14, height: 14 }} />}
          />
        )}
      </DialogTitle>
      <DialogContent>
        {/* URL */}
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem', mb: 2, wordBreak: 'break-all' }}>
          {link.original_url}
        </Typography>

        {!hasResults ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <ShieldQuestion style={{ width: 48, height: 48, color: '#999', margin: '0 auto 16px' }} />
            <Typography color="text.secondary">
              This URL has not been scanned yet.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Click "Scan Now" to analyze this URL with URLScan.io
            </Typography>
          </Box>
        ) : (
          <>
            {/* Score Bar */}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">Threat Score</Typography>
                <Typography variant="caption" fontWeight={700}
                  color={score > 50 ? 'error.main' : score > 20 ? 'warning.main' : 'success.main'}
                >
                  {score}/100
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={score}
                color={score > 50 ? 'error' : score > 20 ? 'warning' : 'success'}
                sx={{ height: 8, borderRadius: 1 }}
              />
            </Box>

            {/* Screenshot */}
            {screenshotUrl && (
              <Box sx={{ mb: 2, borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                <img
                  src={screenshotUrl}
                  alt="Page screenshot"
                  style={{ width: '100%', display: 'block' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </Box>
            )}

            {/* Categories */}
            {categories.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Categories
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {categories.map((cat, i) => (
                    <Chip key={i} size="small" label={cat} variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}

            {/* Brands (phishing) */}
            {brands.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="error.main" sx={{ mb: 0.5, display: 'block', fontWeight: 600 }}>
                  Brand Impersonation Detected
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {brands.map((brand, i) => (
                    <Chip key={i} size="small" label={brand} color="error" variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}

            {/* Meta info */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary">
                Scanned: {scannedAt ? new Date(scannedAt).toLocaleString() : 'Unknown'}
              </Typography>
              {scanId && (
                <a
                  href={`https://urlscan.io/result/${scanId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: '#0ea5e9', textDecoration: 'none' }}
                >
                  View on URLScan.io <ExternalLink style={{ width: 12, height: 12 }} />
                </a>
              )}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <MuiButton onClick={onClose}>Close</MuiButton>
        <MuiButton
          variant="contained"
          onClick={onRescan}
          disabled={scanning}
          startIcon={<RotateCcw style={{ width: 16, height: 16, ...(scanning ? { animation: 'spin 1s linear infinite' } : {}) }} />}
        >
          {scanning ? 'Scanning...' : hasResults ? 'Re-scan' : 'Scan Now'}
        </MuiButton>
      </DialogActions>
    </Dialog>
  );
}

export default ScanResultDialog;
