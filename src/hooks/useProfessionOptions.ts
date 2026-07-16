import { useState, useEffect } from 'react';
import { untypedFrom } from '@/integrations/supabase/untyped';

export interface ProfessionOption {
  slug: string;
  name: string;
  category: string | null;
}

/**
 * Slug-aware variant of useProfessions: returns the shared professions vocabulary
 * as {slug, name, category}. Used by the roles (Tätigkeit) multi-select, which
 * stores SLUGS — distinct from useProfessions (names only, for the single
 * free-text profession field). The vocabulary is deliberately shared and
 * un-gated: any term may be used as a role, the bucket is decided per person.
 */
export function useProfessionOptions() {
  const [options, setOptions] = useState<ProfessionOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const { data, error } = await untypedFrom('professions')
          .select('slug, name, category' as never)
          .eq('is_active' as never, true as never)
          .order('sort_order' as never, { ascending: true });
        if (error) throw error;
        setOptions(
          (data as { slug: string; name: string; category: string | null }[]).map((r) => ({
            slug: r.slug,
            name: r.name,
            category: r.category,
          })),
        );
      } catch (err) {
        console.error('Error fetching profession options:', err);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  return { options, loading };
}

/** Free text → slug (lowercase, spaces→hyphen, strip non a-z0-9-). */
export function toRoleSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Slug → display label (prefer vocab name, else prettified slug). */
export function roleLabel(slug: string, options: ProfessionOption[]): string {
  const hit = options.find((o) => o.slug === slug);
  if (hit) return hit.name;
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
