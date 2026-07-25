import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

const IMAGE_ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * URL field with an optional direct upload into the public `brand` storage
 * bucket (admin-write via RLS). The resulting public URL is written into the
 * branding draft like any hand-entered URL. Handles images (default) or fonts
 * (pass accept/contentType/pathPrefix).
 */
export function BrandUploadField({
  label,
  hint,
  value,
  onChange,
  previewClassName = 'h-12 w-auto max-w-40',
  accept = IMAGE_ACCEPTED,
  contentType,
  pathPrefix = '',
  kind = 'image',
  error,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  previewClassName?: string;
  accept?: string[];
  contentType?: string;
  pathPrefix?: string;
  kind?: 'image' | 'font';
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const upload = async (file: File) => {
    // OS pickers often report application/octet-stream for .woff2, so for fonts
    // we validate by extension and force the content type on upload.
    const okType =
      kind === 'font' ? /\.woff2$/i.test(file.name) : accept.includes(file.type);
    if (!okType) {
      toast.error(kind === 'font' ? 'Only .woff2 fonts allowed' : 'Only PNG, JPEG, WebP or SVG allowed');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('File too large (max 2 MB)');
      return;
    }
    setUploading(true);
    try {
      const ext = kind === 'font' ? 'woff2' : (file.name.split('.').pop()?.toLowerCase() ?? 'png');
      const path = `${pathPrefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { data, error: upErr } = await supabase.storage
        .from('brand')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: contentType ?? (kind === 'font' ? 'font/woff2' : undefined),
        });
      if (upErr) throw upErr;
      const {
        data: { publicUrl },
      } = supabase.storage.from('brand').getPublicUrl(data.path);
      // Replaced a previous brand-bucket upload? Remove the orphaned object.
      const oldPath = value.match(/\/storage\/v1\/object\/public\/brand\/(.+)$/)?.[1];
      if (oldPath && oldPath !== data.path) {
        void supabase.storage.from('brand').remove([decodeURIComponent(oldPath)]);
      }
      setLoadFailed(false);
      onChange(publicUrl);
      toast.success('Uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
          placeholder={kind === 'font' ? 'Upload a .woff2 file' : 'https://… (leave empty for default)'}
          className={`font-mono text-13 ${error ? 'border-destructive' : ''}`}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-1 h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={kind === 'font' ? '.woff2,font/woff2' : accept.join(',')}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
      {kind === 'image' &&
        value &&
        (loadFailed ? (
          <p className="rounded-element border border-destructive px-2 py-1 text-13 text-destructive">
            Couldn't load this image — check the URL.
          </p>
        ) : (
          // onError is the honest "broken URL" signal (no CORS-broken HEAD probe).
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
          <img
            key={value}
            src={value}
            alt={`${label} preview`}
            onError={() => setLoadFailed(true)}
            className={`${previewClassName} rounded-element border object-contain`}
          />
        ))}
      {error ? (
        <p className="text-2xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-2xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
