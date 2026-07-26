/**
 * UrlImportCard — paste a URL (Bluesky / TikTok / any OG-meta page) to seed a
 * community submission for review. Moved here from the deleted
 * /admin/ingestion-rules page (the rules engine itself was never used).
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link2 } from 'lucide-react';

const URL_CONNECTORS: Array<{ test: RegExp; fn: string; label: string }> = [
  { test: /(^|\.)bsky\.app$/i, fn: 'source-bluesky-url', label: 'Bluesky' },
  { test: /(^|\.)tiktok\.com$/i, fn: 'source-tiktok-url', label: 'TikTok' },
  { test: /.*/, fn: 'source-social-url', label: 'Generic OG meta' },
];

function pickConnector(url: string): { fn: string; label: string } | null {
  try {
    const host = new URL(url).hostname;
    for (const c of URL_CONNECTORS) {
      if (c.test.test(host)) return { fn: c.fn, label: c.label };
    }
  } catch {
    return null;
  }
  return null;
}

export function UrlImportCard() {
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    const url = importUrl.trim();
    if (!url) return;
    const conn = pickConnector(url);
    if (!conn) {
      toast.error('Unsupported URL');
      return;
    }
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke(conn.fn, { body: { url } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Imported via ${conn.label}`, {
        description: data?.submission_id ? `Submission ${data.submission_id.slice(0, 8)}…` : '',
      });
      setImportUrl('');
    } catch (err) {
      toast.error(`Import failed: ${err}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-title">
          <Link2 size={18} /> URL import
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            className="flex-1"
            placeholder="https://bsky.app/profile/… or https://www.tiktok.com/… or any URL"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleImport();
            }}
          />
          <Button onClick={handleImport} disabled={importing || !importUrl}>
            {importing ? 'Importing…' : 'Import'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Detects Bluesky / TikTok / generic OG-meta automatically. Submissions land in the review
          inbox.
        </p>
      </CardContent>
    </Card>
  );
}
