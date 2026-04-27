import { useEffect } from "react";
import { useParams } from "react-router";
import { useTags } from "@/hooks/useTags";

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
  }, [slug]);

  if (!slug) return <div className="p-8">Missing tag.</div>;
  if (loading) return <div className="p-8">Loading…</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!tagDetails) return <div className="p-8">Tag not found.</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">#{tagDetails.name}</h1>
      <p className="text-muted-foreground mb-6">
        {tagDetails.total_count} item{tagDetails.total_count === 1 ? "" : "s"}
      </p>
      {tagDetails.usage_by_category.length > 0 && (
        <ul className="space-y-1">
          {tagDetails.usage_by_category.map((u) => (
            <li key={u.category} className="flex justify-between border-b py-1">
              <span className="capitalize">{u.category}</span>
              <span className="font-mono">{u.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
