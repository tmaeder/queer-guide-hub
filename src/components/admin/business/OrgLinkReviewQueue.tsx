/**
 * Open org_link_suggestions from the nightly backfill: ambiguous
 * entity→organization matches (and queer-brand mint proposals) an admin
 * approves or rejects via decide_org_adoption.
 */
import { Check, Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ORG_ROLE_LABELS,
  useDecideOrgAdoption,
  useOrgLinkSuggestions,
} from '@/hooks/useBusinessSpine';
import { toast } from 'sonner';

const TYPE_LABEL: Record<string, string> = {
  venue: 'Venue',
  hotel: 'Hotel',
  merchant: 'Merchant',
  affiliate_partner: 'Partner',
  brand: 'Brand',
};

export function OrgLinkReviewQueue() {
  const { data: suggestions, isLoading } = useOrgLinkSuggestions();
  const decide = useDecideOrgAdoption();

  const onDecide = async (id: string, approve: boolean) => {
    try {
      await decide.mutateAsync({ id, approve });
      toast.success(approve ? 'Linked' : 'Rejected');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Decision failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if ((suggestions ?? []).length === 0) {
    return <p className="py-8 text-13 text-muted-foreground">No open link suggestions.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Entity</TableHead>
          <TableHead>Suggested business</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead className="text-right">Confidence</TableHead>
          <TableHead className="text-right">Decision</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(suggestions ?? []).map((s) => (
          <TableRow key={s.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-normal">
                  {TYPE_LABEL[s.entity_type] ?? ORG_ROLE_LABELS[s.entity_type] ?? s.entity_type}
                </Badge>
                <span className="font-medium">{s.payload.entity?.name ?? s.entity_id}</span>
              </div>
            </TableCell>
            <TableCell>
              {s.payload.org?.name ?? (
                <span className="text-muted-foreground">Create new business</span>
              )}
            </TableCell>
            <TableCell className="text-13 text-muted-foreground">{s.reason}</TableCell>
            <TableCell className="text-right text-13 text-muted-foreground">
              {Math.round(Number(s.confidence) * 100)}%
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() => onDecide(s.id, true)}
                >
                  <Check size={14} className="mr-1" />
                  {s.payload.org ? 'Link' : 'Create'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={decide.isPending}
                  onClick={() => onDecide(s.id, false)}
                >
                  <X size={14} className="mr-1" />
                  Reject
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
