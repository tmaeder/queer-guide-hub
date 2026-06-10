import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tags } from 'lucide-react';
import { useMarketplaceTagQuality } from '@/hooks/useMarketplaceTagQuality';
import { departmentLabel } from '@/lib/marketplaceTaxonomy';

/** Live counts for the marketplace tag engine: departments, attributes, open gate. */
export function MarketplaceTagQualityPanel() {
  const { data, isLoading } = useMarketplaceTagQuality();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-title">
          <Tags size={16} />
          Tag engine health
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
        {data && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-element border p-4">
                <p className="text-13 text-muted-foreground">Active products</p>
                <p className="text-headline tabular-nums">{data.totalActive.toLocaleString()}</p>
              </div>
              <div className="rounded-element border p-4">
                <p className="text-13 text-muted-foreground">Attribute assignments</p>
                <p className="text-headline tabular-nums">{data.attributeAssignments.toLocaleString()}</p>
              </div>
              <div className="rounded-element border p-4">
                <p className="text-13 text-muted-foreground">Open reviews</p>
                <p className="text-headline tabular-nums">{data.openReviews.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-13 font-medium">Departments</p>
              <div className="flex flex-wrap gap-2">
                {data.departments.map((d) => (
                  <span key={d.slug} className="rounded-badge border px-2 py-1 text-xs">
                    {departmentLabel(d.slug)}
                    <span className="ml-1.5 text-muted-foreground tabular-nums">{d.count.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
