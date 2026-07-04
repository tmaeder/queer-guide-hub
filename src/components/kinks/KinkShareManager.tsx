import { useState } from 'react';
import { Copy, Link2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  useCreateKinkShareLink,
  useMyKinkShareLinks,
  useRevokeKinkShareLink,
} from '@/hooks/useKinkShare';

const TTL_OPTIONS = [
  { value: 'none', label: 'Never expires', ttl: null },
  { value: '7d', label: '7 days', ttl: '7 days' },
  { value: '30d', label: '30 days', ttl: '30 days' },
] as const;

function shareUrl(code: string) {
  return `${window.location.origin}/tools/checklist/s/${code}`;
}

/**
 * Create / copy / revoke share links. Every link is revocable, optionally
 * expiring, and only ever shows categories flagged "Share link" — to signed-in
 * 18+ members, never anonymously.
 */
export function KinkShareManager() {
  const { toast } = useToast();
  const { data: links } = useMyKinkShareLinks();
  const create = useCreateKinkShareLink();
  const revoke = useRevokeKinkShareLink();
  const [ttl, setTtl] = useState<(typeof TTL_OPTIONS)[number]['value']>('none');

  const active = (links ?? []).filter(
    (l) => !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date()),
  );

  const handleCreate = async () => {
    const opt = TTL_OPTIONS.find((o) => o.value === ttl);
    const code = await create.mutateAsync({ ttl: opt?.ttl ?? null });
    await navigator.clipboard.writeText(shareUrl(code)).catch(() => undefined);
    toast({ title: 'Share link created and copied.' });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Link2 className="h-4 w-4" />
          Share links
        </h3>
        <p className="mt-1 text-13 text-muted-foreground">
          A link shows only categories you flagged for sharing, only to signed-in 18+
          members. You can revoke any link at any time.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={ttl} onValueChange={(v) => setTtl(v as typeof ttl)}>
          <SelectTrigger className="w-40 rounded-element">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TTL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={handleCreate}
          disabled={create.isPending}
          className="rounded-element"
        >
          Create link
        </Button>
      </div>

      {active.length > 0 && (
        <ul className="divide-y divide-border">
          {active.map((link) => (
            <li key={link.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <code className="text-13">{shareUrl(link.code)}</code>
                <p className="text-xs2 text-muted-foreground">
                  {link.view_count} views
                  {link.expires_at
                    ? ` · expires ${new Date(link.expires_at).toLocaleDateString()}`
                    : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-element"
                  aria-label="Copy link"
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareUrl(link.code)).catch(() => undefined);
                    toast({ title: 'Copied.' });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-element"
                  aria-label="Revoke link"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(link.id)}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
