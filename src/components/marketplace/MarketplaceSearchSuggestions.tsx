import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { fetchAutocomplete, type SearchHit } from '@/lib/searchClient';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useBrandVocab } from '@/hooks/useMarketplaceBrands';
import { DEPARTMENT_LABELS } from '@/lib/marketplaceTaxonomy';
import { resolveImageUrl } from '@/utils/resolveImageUrl';

interface Suggestion {
  kind: 'listing' | 'brand' | 'department';
  label: string;
  /** brand/department (and listings with a slug) navigate; the rest fill the query. */
  href?: string;
  query?: string;
  imageUrl?: string | null;
  price?: string;
}

function buildLocalSuggestions(
  q: string,
  brands: Array<{ display_name: string; slug: string }>,
): Suggestion[] {
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
  return out.slice(0, 4);
}

function hitToSuggestion(h: SearchHit): Suggestion {
  const slug = typeof h.slug === 'string' && h.slug ? h.slug : undefined;
  const priceMin = typeof h.price_min === 'number' ? h.price_min : undefined;
  return {
    kind: 'listing',
    label: h.title ?? '',
    href: slug ? `/marketplace/${slug}` : undefined,
    query: h.title ?? '',
    imageUrl: resolveImageUrl({
      imageUrl: (h.image_url as string | null) ?? null,
      optimizedUrl: h.optimized_url ?? null,
      thumbnailUrl: h.thumbnail_url ?? null,
    }),
    price: priceMin != null && priceMin > 0 ? `$${Math.round(priceMin)}` : undefined,
  };
}

const GROUP_LABELS: Record<Suggestion['kind'], string> = {
  listing: 'Products',
  brand: 'Brands',
  department: 'Departments',
};

/**
 * Grouped typeahead under the marketplace search input: products (with
 * thumbnails, straight to the detail page when a slug is available),
 * brand and department prefix matches. Full keyboard support — the host
 * input is wired via `inputRef` (ArrowUp/Down/Enter/Escape +
 * aria-activedescendant).
 */
export function MarketplaceSearchSuggestions({
  query,
  onPick,
  inputRef,
}: {
  query: string;
  onPick: (q: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const navigate = useLocalizedNavigate();
  const { data: brands = [] } = useBrandVocab();
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setActiveIndex(-1);
    if (query.trim().length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetchAutocomplete(query.trim(), ['marketplace'], 6);
        setHits(res);
        setOpen(true);
      } catch {
        setHits([]);
      }
    }, 250);
    return () => clearTimeout(debounce.current);
  }, [query]);

  const visible = open && query.trim().length >= 2;
  const suggestions = useMemo(() => {
    if (!visible) return [];
    const local = buildLocalSuggestions(query.trim(), brands);
    const listings = hits.filter((h) => h.title).map(hitToSuggestion);
    // Flat, grouped-by-kind order: products first (most specific intent).
    return [...listings, ...local];
  }, [visible, query, brands, hits]);

  const select = (s: Suggestion) => {
    setOpen(false);
    if (s.href) navigate(s.href);
    else onPick(s.query ?? s.label);
  };

  // Keyboard wiring on the host input: arrows move, Enter picks, Escape closes.
  const stateRef = useRef({ suggestions, activeIndex, visible });
  useEffect(() => {
    stateRef.current = { suggestions, activeIndex, visible };
  }, [suggestions, activeIndex, visible]);
  useEffect(() => {
    const el = inputRef?.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const { suggestions: items, activeIndex: idx, visible: isOpen } = stateRef.current;
      if (!isOpen || items.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((idx + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(idx <= 0 ? items.length - 1 : idx - 1);
      } else if (e.key === 'Enter' && idx >= 0 && items[idx]) {
        e.preventDefault();
        select(items[idx]);
      } else if (e.key === 'Escape') {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputRef]);

  useEffect(() => {
    const el = inputRef?.current;
    if (!el) return;
    if (visible && activeIndex >= 0 && suggestions[activeIndex]) {
      el.setAttribute('aria-activedescendant', `mkt-suggestion-${activeIndex}`);
    } else {
      el.removeAttribute('aria-activedescendant');
    }
    el.setAttribute('aria-expanded', visible && suggestions.length > 0 ? 'true' : 'false');
  }, [inputRef, visible, activeIndex, suggestions]);

  if (!visible || suggestions.length === 0) return null;

  let lastKind: Suggestion['kind'] | null = null;

  return (
    <ul
      className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-element border border-border bg-background"
      role="listbox"
      aria-label="Search suggestions"
    >
      {suggestions.map((s, i) => {
        const showGroup = s.kind !== lastKind;
        lastKind = s.kind;
        const active = i === activeIndex;
        return (
          <li key={`${s.kind}:${s.label}:${i}`}>
            {showGroup && (
              <p className="border-t border-border px-4 pb-1 pt-2 text-2xs uppercase tracking-wider text-muted-foreground first:border-t-0">
                {GROUP_LABELS[s.kind]}
              </p>
            )}
            <button
              id={`mkt-suggestion-${i}`}
              type="button"
              role="option"
              aria-selected={active}
              className={`flex w-full items-center gap-4 px-4 py-2 text-left text-sm ${
                active ? 'bg-muted' : 'hover:bg-muted'
              }`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => select(s)}
            >
              {s.kind === 'listing' && (
                <span className="h-8 w-8 shrink-0 overflow-hidden rounded-badge bg-muted">
                  {s.imageUrl && (
                    <img src={s.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                </span>
              )}
              {s.kind === 'brand' && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-badge border border-border text-13 font-medium">
                  {s.label.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {s.label}
              </span>
              {s.price && (
                <span className="shrink-0 text-13 tabular-nums text-muted-foreground">{s.price}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
