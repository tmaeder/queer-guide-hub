import { useEffect, useRef, useState } from 'react';
import { fetchAutocomplete, type SearchHit } from '@/lib/searchClient';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useBrandVocab } from '@/hooks/useMarketplaceBrands';
import { DEPARTMENT_LABELS } from '@/lib/marketplaceTaxonomy';

interface Suggestion {
  kind: 'listing' | 'brand' | 'department';
  label: string;
  /** listing suggestions fill the query; brand/department navigate. */
  href?: string;
  query?: string;
}

function buildLocalSuggestions(q: string, brands: Array<{ display_name: string; slug: string }>): Suggestion[] {
  const needle = q.toLowerCase();
  const out: Suggestion[] = [];
  for (const [slug, label] of Object.entries(DEPARTMENT_LABELS)) {
    if (slug === 'other') continue;
    if (label.toLowerCase().startsWith(needle)) {
      out.push({ kind: 'department', label, href: `/marketplace/category/${slug}` });
    }
  }
  for (const b of brands) {
    if (b.display_name.toLowerCase().startsWith(needle)) {
      out.push({ kind: 'brand', label: b.display_name, href: `/marketplace/brands/${b.slug}` });
      if (out.length >= 5) break;
    }
  }
  return out.slice(0, 3);
}

/**
 * Typeahead under the marketplace search input: department + brand prefix
 * matches (navigate) and listing-title suggestions from search_autocomplete
 * (fill the query).
 */
export function MarketplaceSearchSuggestions({
  query,
  onPick,
}: {
  query: string;
  onPick: (q: string) => void;
}) {
  const navigate = useLocalizedNavigate();
  const { data: brands = [] } = useBrandVocab();
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setHits([]);
      setOpen(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetchAutocomplete(query.trim(), ['marketplace'], 5);
        setHits(res);
        setOpen(true);
      } catch {
        setHits([]);
      }
    }, 250);
    return () => clearTimeout(debounce.current);
  }, [query]);

  if (!open || query.trim().length < 2) return null;

  const local = buildLocalSuggestions(query.trim(), brands);
  if (local.length === 0 && hits.length === 0) return null;

  return (
    <ul
      className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-element border border-border bg-background"
      role="listbox"
      aria-label="Search suggestions"
    >
      {local.map((s) => (
        <li key={`${s.kind}:${s.label}`}>
          <button
            type="button"
            className="flex w-full items-baseline gap-2 px-4 py-2 text-left text-sm hover:bg-muted"
            onClick={() => {
              setOpen(false);
              if (s.href) navigate(s.href);
            }}
          >
            <span className="font-medium">{s.label}</span>
            <span className="text-2xs uppercase tracking-wider text-muted-foreground">
              {s.kind === 'brand' ? 'Brand' : 'Department'}
            </span>
          </button>
        </li>
      ))}
      {hits.map((h) => (
        <li key={h.id}>
          <button
            type="button"
            className="w-full px-4 py-2 text-left text-sm hover:bg-muted"
            onClick={() => {
              setOpen(false);
              onPick(h.title ?? '');
            }}
          >
            {h.title}
          </button>
        </li>
      ))}
    </ul>
  );
}
