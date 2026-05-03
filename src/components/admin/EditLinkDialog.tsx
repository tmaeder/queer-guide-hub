import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { ContentLink } from '@/hooks/useContentLinks';

interface EditLinkDialogProps {
  open: boolean;
  link: ContentLink | null;
  onClose: () => void;
  onSave: (newUrl: string) => Promise<void>;
}

export function EditLinkDialog({ open, link, onClose, onSave }: EditLinkDialogProps) {
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState('');

  useEffect(() => {
    if (link) {
      setNewUrl(link.original_url);
      setUrlError('');
    }
  }, [link]);

  const validate = (url: string) => {
    try {
      new URL(url);
      setUrlError('');
      return true;
    } catch {
      setUrlError('Invalid URL format');
      return false;
    }
  };

  const handleSave = async () => {
    if (!validate(newUrl)) return;
    setSaving(true);
    try {
      await onSave(newUrl);
      onClose();
    } catch (e: unknown) {
      setUrlError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const useRedirect = () => {
    if (link?.final_url) {
      setNewUrl(link.final_url);
      setUrlError('');
    }
  };

  if (!link) return null;

  const statusVariant: 'default' | 'destructive' | 'secondary' =
    link.status === 'BROKEN' ? 'destructive' : link.status === 'REDIRECT' ? 'secondary' : 'default';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Link URL</DialogTitle>
        </DialogHeader>
        <div className="flex flex-row gap-2 mb-4 mt-2">
          <Badge variant="outline">{link.content_type}</Badge>
          <Badge variant="outline">{link.field_name}</Badge>
          <Badge variant={statusVariant}>{link.status}</Badge>
        </div>

        <span className="text-xs text-muted-foreground block mb-1">
          Current URL
        </span>
        <p className="font-mono text-xs break-all mb-4 p-2 bg-muted rounded">
          {link.original_url}
        </p>

        {link.final_url && link.final_url !== link.original_url && (
          <>
            <span className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <ArrowRight style={{ width: 14, height: 14 }} /> Redirects to
            </span>
            <div className="flex flex-row items-center gap-2 mb-4">
              <p className="font-mono text-xs break-all flex-1 p-2 bg-muted rounded">
                {link.final_url}
              </p>
              <Button size="sm" variant="outline" onClick={useRedirect} className="whitespace-nowrap">
                Use this
              </Button>
            </div>
          </>
        )}

        <div className="flex flex-col gap-1 mt-2">
          <Label htmlFor="new-url">New URL</Label>
          <Input
            id="new-url"
            value={newUrl}
            onChange={e => { setNewUrl(e.target.value); setUrlError(''); }}
            className={urlError ? 'border-destructive' : ''}
          />
          <span className={`text-xs ${urlError ? 'text-destructive' : 'text-muted-foreground'}`}>
            {urlError || 'The source content URL will be updated to this value'}
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !newUrl || newUrl === link.original_url}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditLinkDialog;
