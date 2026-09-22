import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AdminStat } from '@/components/admin/primitives/AdminStat';
import {
  useBusinessBrandQualityFindings,
  useBusinessBrandQualityStats,
  useResolveBusinessBrandQualityFindings,
  type BusinessBrandEntityType,
  type QualityFindingState,
} from '@/hooks/useBusinessSpine';

const DIMENSIONS = [
  'identity',
  'editorial',
  'contact',
  'location',
  'media',
  'categorization',
  'linkage',
  'provenance',
  'freshness',
  'ownership',
  'product_linkage',
] as const;

const label = (value: string) =>
  value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());

export function BusinessBrandQualityPanel() {
  const [entityType, setEntityType] = useState<BusinessBrandEntityType | 'all'>('all');
  const [state, setState] = useState<Extract<QualityFindingState, 'fail' | 'pending'> | 'all'>(
    'all',
  );
  const [dimension, setDimension] = useState<string>('all');
  const [resolution, setResolution] = useState<'open' | 'waived'>('open');
  const [selected, setSelected] = useState<number[]>([]);
  const [waiverNote, setWaiverNote] = useState('');
  const { data: summary } = useBusinessBrandQualityStats();
  const { data: findings = [], isLoading } = useBusinessBrandQualityFindings({
    entityType: entityType === 'all' ? undefined : entityType,
    state: state === 'all' ? undefined : state,
    dimension: dimension === 'all' ? undefined : dimension,
    resolution,
  });
  const resolve = useResolveBusinessBrandQualityFindings();
  const stats = summary?.latest?.stats;
  const visibleIds = useMemo(() => findings.map((finding) => finding.id), [findings]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  const toggle = (id: number, checked: boolean) =>
    setSelected((current) =>
      checked ? [...new Set([...current, id])] : current.filter((value) => value !== id),
    );

  const waive = async () => {
    if (!waiverNote.trim()) {
      toast.error('A waiver note is required.');
      return;
    }
    try {
      const result = await resolve.mutateAsync({
        ids: selected,
        action: 'waive',
        note: waiverNote.trim(),
      });
      toast.success(`${result?.changed ?? selected.length} finding(s) waived`);
      setSelected([]);
      setWaiverNote('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not waive findings');
    }
  };

  const reopen = async () => {
    try {
      const result = await resolve.mutateAsync({ ids: selected, action: 'reopen' });
      toast.success(`${result?.changed ?? selected.length} finding(s) reopened`);
      setSelected([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reopen findings');
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-element bg-muted p-4">
      <div>
        <h3 className="text-15 font-semibold">Business & brand quality</h3>
        <p className="text-13 text-muted-foreground">
          Role-aware completeness and explicit unresolved, unavailable, or waived outcomes.
        </p>
      </div>

      {stats && (
        <div className="flex flex-wrap gap-2">
          <AdminStat label="businesses" value={stats.organizations_total ?? 0} />
          <AdminStat label="business findings" value={stats.organizations_open ?? 0} hardFail />
          <AdminStat label="product-bearing brands" value={stats.brands_total ?? 0} />
          <AdminStat label="brand findings" value={stats.brands_open ?? 0} hardFail />
          <AdminStat
            label="ownership claims needing evidence"
            value={stats.ownership_needs_review ?? 0}
            hardFail
          />
          <AdminStat
            label="brand count drift"
            value={stats.brand_product_count_drift ?? 0}
            hardFail
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Select
          value={entityType}
          onValueChange={(value) => {
            setEntityType(value as typeof entityType);
            setSelected([]);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            <SelectItem value="organization">Businesses</SelectItem>
            <SelectItem value="marketplace_brand">Brands</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={state}
          onValueChange={(value) => {
            setState(value as typeof state);
            setSelected([]);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            <SelectItem value="fail">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={dimension}
          onValueChange={(value) => {
            setDimension(value);
            setSelected([]);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dimensions</SelectItem>
            {DIMENSIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {label(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={resolution}
          onValueChange={(value) => {
            setResolution(value as typeof resolution);
            setSelected([]);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open findings</SelectItem>
            <SelectItem value="waived">Waived findings</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-element border border-border bg-background p-4">
          {resolution === 'open' ? (
            <>
              <Input
                value={waiverNote}
                onChange={(event) => setWaiverNote(event.target.value)}
                placeholder="Why is this not applicable or intentionally accepted?"
                className="min-w-64 flex-1"
              />
              <Button type="button" variant="outline" disabled={resolve.isPending} onClick={waive}>
                Waive {selected.length}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" disabled={resolve.isPending} onClick={reopen}>
              Reopen {selected.length}
            </Button>
          )}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select visible findings"
                checked={allSelected}
                onCheckedChange={(checked) =>
                  setSelected(checked ? [...new Set([...selected, ...visibleIds])] : [])
                }
              />
            </TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Dimension</TableHead>
            <TableHead>Finding</TableHead>
            <TableHead>Evidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {findings.map((finding) => (
            <TableRow key={finding.id}>
              <TableCell>
                <Checkbox
                  aria-label={`Select ${finding.entity_name}`}
                  checked={selected.includes(finding.id)}
                  onCheckedChange={(checked) => toggle(finding.id, checked === true)}
                />
              </TableCell>
              <TableCell>
                <div className="font-medium">{finding.entity_name}</div>
                <div className="text-2xs text-muted-foreground">
                  {finding.entity_type === 'organization' ? 'Business' : 'Brand'}
                </div>
              </TableCell>
              <TableCell>{label(finding.dimension)}</TableCell>
              <TableCell>
                <Badge variant={finding.state === 'fail' ? 'destructive' : 'secondary'}>
                  {label(finding.state)}
                </Badge>
                <div className="mt-1 text-12 text-muted-foreground">
                  {label(finding.reason_code)}
                </div>
              </TableCell>
              <TableCell
                className="max-w-sm truncate text-12 text-muted-foreground"
                title={JSON.stringify(finding.evidence)}
              >
                {JSON.stringify(finding.evidence)}
              </TableCell>
            </TableRow>
          ))}
          {!isLoading && findings.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No unresolved findings.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}
