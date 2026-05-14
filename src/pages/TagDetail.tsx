import { useEffect } from "react";
import { useParams } from "react-router";
import { useTags } from "@/hooks/useTags";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";

/**
 * Public tag detail page at /tags/:slug. Resolves the slug to a unified-tag
 * name via useTags.getTagDetails and renders a minimal overview (count +
 * usage by entity type). Linked from PR #79's App.tsx route addition.
 */
export default function TagDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { tagDetails, getTagDetails, loading, error } = useTags();

  useEffect(() => {
    if (slug) void getTagDetails(decodeURIComponent(slug));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getTagDetails identity changes every render in useTags; re-running on slug only is intentional
  }, [slug]);

  if (!slug) return <div className="p-8">Missing tag.</div>;
  if (loading) return <div className="p-8">Loading…</div>;
  if (error) return <div className="p-8 text-destructive">{error}</div>;
  if (!tagDetails) return <div className="p-8">Tag not found.</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <PageHeader
        eyebrow="Tag"
        title={`#${tagDetails.name}`}
        subtitle={`${tagDetails.total_count} item${tagDetails.total_count === 1 ? "" : "s"} across the guide`}
      />
      {tagDetails.usage_by_category.length > 0 && (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {tagDetails.usage_by_category.map((u) => (
              <li key={u.category} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/50">
                <span className="capitalize text-sm font-medium">{u.category}</span>
                <span className="font-mono text-sm text-muted-foreground">{u.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
