import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SUPABASE_URL } from './types';

interface PreviewDialogProps {
  open: boolean;
  onClose: () => void;
}

export function PreviewDialog({ open, onClose }: PreviewDialogProps) {
  const [testUrl, setTestUrl] = useState('');
  const [previewResult, setPreviewResult] = useState<string | null>(null);

  const handlePreview = () => {
    let slug = testUrl.trim();
    if (slug.includes('/go/')) slug = slug.split('/go/')[1]?.split('?')[0] || '';
    if (!slug) {
      setPreviewResult('Enter a slug or /go/<slug> URL');
      return;
    }
    const edgeUrl = `${SUPABASE_URL}/functions/v1/redirect-handler?slug=${encodeURIComponent(slug)}`;
    setPreviewResult(`Edge function URL:\n${edgeUrl}\n\nOpen this URL to test the redirect.`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Preview / Test Redirect</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground" style={{ marginBottom: 16 }}>
          Enter a slug or short URL to preview the redirect resolution.
        </p>
        <Input
          value={testUrl}
          onChange={(e) => setTestUrl(e.target.value)}
          placeholder="pride-zrh or https://queer.guide/go/pride-zrh"
          onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
        />
        <Button variant="outline" onClick={handlePreview} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
          Test
        </Button>
        {previewResult && (
          <div className="bg-muted" style={{ marginTop: 16, padding: 16, borderRadius: 4 }}>
            <p
              style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}
            >
              {previewResult}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
