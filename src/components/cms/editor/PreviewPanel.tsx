/**
 * PreviewPanel — live front-end preview for the CMS editor. Renders the real
 * public detail route in an iframe (same origin, same admin session) with
 * `?preview=1` (suppresses view-telemetry, see SearchTelemetryProvider). Locale
 * switcher dogfoods content i18n; viewport toggle checks mobile layout. The
 * iframe reloads when a save completes so the preview reflects the latest data.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Monitor, Smartphone, ExternalLink, RefreshCw } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, LANGUAGE_NAMES } from '@/i18n/languages';
import type { ContentTypeConfig } from '@/types/cms';

interface PreviewPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: ContentTypeConfig;
  row: Record<string, unknown>;
  /** Editor save-in-progress flag; the iframe reloads on the true→false edge. */
  isSaving: boolean;
}

function withPreviewParam(path: string): string {
  return path.includes('?') ? `${path}&preview=1` : `${path}?preview=1`;
}

export function PreviewPanel({
  open,
  onOpenChange,
  contentType,
  row,
  isSaving,
}: PreviewPanelProps) {
  const [locale, setLocale] = useState<string>(DEFAULT_LOCALE);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [reloadKey, setReloadKey] = useState(0);
  const prevSaving = useRef(isSaving);

  // Reload the iframe once a save finishes so the preview shows fresh data.
  useEffect(() => {
    if (prevSaving.current && !isSaving) setReloadKey((k) => k + 1);
    prevSaving.current = isSaving;
  }, [isSaving]);

  const basePath = contentType.publicPath?.(row) ?? null;
  const src = useMemo(() => {
    if (!basePath) return null;
    const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
    return withPreviewParam(`${prefix}${basePath}`);
  }, [basePath, locale]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[600px] p-0 flex flex-col gap-0"
      >
        <SheetHeader className="px-4 py-2 border-b border-border flex-row items-center justify-between gap-2 space-y-0">
          <SheetTitle className="text-sm font-semibold">Live preview</SheetTitle>
          <div className="flex items-center gap-1.5">
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger className="h-7 w-28 text-xs" aria-label="Preview locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LOCALES.map((l) => (
                  <SelectItem key={l} value={l} className="text-xs">
                    {LANGUAGE_NAMES[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDevice((d) => (d === 'desktop' ? 'mobile' : 'desktop'))}
              className="h-7 w-7 p-0"
              aria-label={device === 'desktop' ? 'Switch to mobile width' : 'Switch to desktop width'}
            >
              {device === 'desktop' ? <Smartphone size={15} /> : <Monitor size={15} />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((k) => k + 1)}
              className="h-7 w-7 p-0"
              aria-label="Reload preview"
            >
              <RefreshCw size={15} />
            </Button>
            {src && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(src, '_blank', 'noopener')}
                className="h-7 w-7 p-0"
                aria-label="Open preview in new tab"
              >
                <ExternalLink size={15} />
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto bg-muted flex justify-center">
          {src ? (
            <iframe
              key={`${src}-${reloadKey}`}
              src={src}
              title="Content preview"
              className="bg-background border-0 h-full transition-[width] duration-200"
              style={{ width: device === 'mobile' ? 375 : '100%', maxWidth: '100%' }}
            />
          ) : (
            <div className="flex items-center justify-center h-full p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No public page yet — save this {contentType.label.singular.toLowerCase()} to
                generate its URL, then preview.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
