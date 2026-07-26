/**
 * "Link existing…" picker: search unlinked entities of one type and link
 * them to the organization via link_organization_entity.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  useLinkOrgEntity,
  useOrgLinkCandidates,
  type OrgEntityType,
} from '@/hooks/useBusinessSpine';
import { toast } from 'sonner';

interface Props {
  orgId: string;
  entityType: OrgEntityType;
  typeLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrgEntityPickerDialog({ orgId, entityType, typeLabel, open, onOpenChange }: Props) {
  const [q, setQ] = useState('');
  const { data: candidates, isFetching } = useOrgLinkCandidates(entityType, q, open);
  const link = useLinkOrgEntity(orgId);

  const onLink = async (entityId: string, name: string) => {
    try {
      await link.mutateAsync({ entityType, entityId });
      toast.success(`Linked ${name}`);
      onOpenChange(false);
      setQ('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Link failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link existing {typeLabel.toLowerCase()}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search unlinked ${typeLabel.toLowerCase()}s…`}
        />
        <div className="flex min-h-24 flex-col gap-1">
          {isFetching ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin" aria-label="Searching" />
            </div>
          ) : q.trim().length < 2 ? (
            <p className="py-4 text-13 text-muted-foreground">Type at least two characters.</p>
          ) : (candidates ?? []).length === 0 ? (
            <p className="py-4 text-13 text-muted-foreground">No unlinked matches.</p>
          ) : (
            (candidates ?? []).map((c) => (
              <Button
                key={c.id}
                variant="ghost"
                className="justify-start"
                disabled={link.isPending}
                onClick={() => onLink(c.id, c.name)}
              >
                <span className="truncate">{c.name}</span>
                {c.detail && (
                  <span className="ml-2 truncate text-13 text-muted-foreground">{c.detail}</span>
                )}
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
