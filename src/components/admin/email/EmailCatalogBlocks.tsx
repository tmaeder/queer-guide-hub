import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export interface PublicReference {
  kind: 'event' | 'venue' | 'news' | 'organization';
  id: string;
}
interface Preview {
  evaluated_at: string;
  referenceKey: string;
  blocks: { kind: string; id: string; available: boolean; title?: string; url?: string }[];
}
export function EmailCatalogBlocks({
  value,
  onChange,
}: {
  value: PublicReference[];
  onChange: (value: PublicReference[]) => void;
}) {
  const [kind, setKind] = useState<PublicReference['kind']>('event'),
    [id, setId] = useState(''),
    [preview, setPreview] = useState<Preview | null>(null),
    [notice, setNotice] = useState<{ referenceKey: string; text: string } | null>(null),
    [pendingKey, setPendingKey] = useState<string | null>(null);
  const referenceKey = JSON.stringify(value),
    busy = pendingKey === referenceKey;
  const request = useRef(0);
  function update(next: PublicReference[]) {
    ++request.current;
    setPendingKey(null);
    setPreview(null);
    setNotice(null);
    onChange(next);
  }
  async function inspect() {
    const sequence = ++request.current;
    setPendingKey(referenceKey);
    setNotice(null);
    try {
      const r = await supabase.functions.invoke('email-admin', {
        body: { action: 'catalog-preview', references: value },
      });
      if (sequence !== request.current) return;
      if (r.error || !Array.isArray(r.data?.blocks)) throw new Error('catalog');
      setPreview({ ...r.data, referenceKey });
    } catch {
      if (sequence === request.current)
        setNotice({
          referenceKey,
          text: 'Public content could not load. Saved references and your draft are preserved.',
        });
    } finally {
      if (sequence === request.current) setPendingKey(null);
    }
  }
  const valid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id.trim());
  return (
    <section className="space-y-4 border-t border-border pt-4" aria-label="Public catalog blocks">
      <h3 className="font-semibold">Public catalog blocks (optional)</h3>
      <p className="text-sm text-muted-foreground">
        Keep up to twelve references to current public events, venues, articles or organizations.
        Drafts retain the reference IDs; previews resolve the public record again and omit
        unavailable content. This does not enable campaign delivery.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="campaign-catalog-kind">Public content type</Label>
          <select
            id="campaign-catalog-kind"
            className="min-h-10 w-full border border-input bg-background px-4 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as PublicReference['kind'])}
          >
            <option value="event">Event</option>
            <option value="venue">Venue</option>
            <option value="news">News article</option>
            <option value="organization">Organization</option>
          </select>
        </div>
        <div>
          <Label htmlFor="campaign-catalog-id">Public record ID</Label>
          <Input
            id="campaign-catalog-id"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="UUID from the content record"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={
            !valid ||
            value.length >= 12 ||
            value.some((r) => r.kind === kind && r.id === id.trim().toLowerCase())
          }
          onClick={() => {
            update([...value, { kind, id: id.trim().toLowerCase() }]);
            setId('');
          }}
        >
          Add public reference
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!value.length || busy}
          onClick={() => void inspect()}
        >
          {busy ? 'Checking public content…' : 'Preview public blocks'}
        </Button>
      </div>
      {value.length > 0 && (
        <ol className="divide-y divide-border">
          {value.map((r, i) => (
            <li
              key={`${r.kind}:${r.id}`}
              className="flex flex-wrap items-center justify-between gap-4 py-4"
            >
              <div className="min-w-0 text-sm">
                <p>
                  {i + 1}. {r.kind}
                </p>
                <p className="break-all">{r.id}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => update(value.filter((_, index) => index !== i))}
              >
                Remove {r.kind} block {i + 1}
              </Button>
            </li>
          ))}
        </ol>
      )}
      {notice?.referenceKey === referenceKey && (
        <p role="status" className="text-sm">
          {notice.text}
        </p>
      )}
      {preview?.referenceKey === referenceKey && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Public content checked {new Date(preview.evaluated_at).toLocaleString()}. A later change
            can make a reference unavailable.
          </p>
          {preview.blocks.map((b) => (
            <div key={`${b.kind}:${b.id}`} className="border-b border-border pb-4">
              <p className="break-words text-sm">
                {b.available
                  ? b.title
                  : `${b.kind} unavailable; remove this reference before saving.`}
              </p>
              {b.available && b.url && (
                <a
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm underline underline-offset-4"
                >
                  View public record
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
