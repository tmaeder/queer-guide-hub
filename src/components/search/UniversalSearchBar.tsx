import React, { useState, useRef, useEffect, useCallback, useMemo, Suspense } from 'react';
import { lazyOptional } from '@/utils/lazyRetry';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { Search, X, Mic } from 'lucide-react';
// The primitive directly, not ui/dialog's DialogContent: that one is a
// vertically-centred, radiused, padded card with its own X close button, and
// the command plate is a top-pinned squared plate whose close affordance is
// the `esc` chip in its own input row. Overriding all of that leaves nothing
// of the wrapper behind.
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { useTrackClick } from '@/hooks/useSearchActions';
import { trackSearchUx } from '@/lib/searchClient';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useSearchSuggestions, type SearchSuggestion } from '@/hooks/useSearchSuggestions';
import { useTrendingSuggestions } from '@/hooks/useTrendingSuggestions';
import { useSearchRecommendations } from '@/hooks/useSearchRecommendations';
import { useVoiceSearch } from '@/hooks/useVoiceSearch';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSearchHotkey } from '@/hooks/useSearchHotkey';
import { useUserMode } from '@/hooks/useUserMode';
import { useAuth } from '@/hooks/useAuth';
import { useAssistant } from '@/hooks/useAssistant';
import { MODE_SCOPE_BIAS, INTENT_SCOPE_BIAS, findActiveIntent } from '@/config/navigation';
import { stripLocale } from '@/lib/locale';
import type { SearchFilters } from '@/hooks/useSearch';
import type { AssistantCard } from '@/lib/assistantClient';
import { detailHref } from '@/lib/searchRoutes';
import { getSubmitCta } from '@/lib/submitCta';
// The three popover bodies only ever render inside <PopoverContent>, which
// Radix mounts on open — so nothing here is needed for first paint. Eagerly
// importing them put the whole results subtree, including dompurify (~58 KB),
// in the entry graph via Header on EVERY route. Lazy keeps the input (which is
// above the fold) eager and defers the dropdown to first focus.
// lazyOptional, not lazyRetry: a permanently failed chunk should leave an empty
// dropdown, never throw into the boundary that wraps the site header.
const SearchPopoverDesktop = lazyOptional(() =>
  import('./SearchPopoverDesktop').then((m) => ({ default: m.SearchPopoverDesktop })),
);
const SearchPopoverMobile = lazyOptional(() =>
  import('./SearchPopoverMobile').then((m) => ({ default: m.SearchPopoverMobile })),
);
const SearchAskPanel = lazyOptional(() =>
  import('./SearchAskPanel').then((m) => ({ default: m.SearchAskPanel })),
);

// Order for Alt+1-9 scope shortcuts (mirrors SearchScopeChips).
const SCOPE_IDS = ['venue', 'event', 'marketplace', 'news', 'personality', 'city', 'queer_village'];

function prefetchRoute(suggestion: SearchSuggestion) {
  // Only prefetch a canonical detail route — `detailHref` returns null for
  // slug-less / UUID-only hits so we never warm a /type/<uuid> dead link.
  const href = detailHref({
    type: suggestion.type,
    slug: suggestion.slug,
    id: suggestion.id,
    title: suggestion.name || suggestion.title,
  });
  if (!href) return;
  try {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'document';
    link.href = href;
    document.head.appendChild(link);
    setTimeout(() => link.remove(), 30_000);
  } catch {
    /* ignore */
  }
}

function getPlaceholder(pathname: string, t: (k: string, d?: string) => string, isMobile: boolean) {
  if (pathname.startsWith('/admin')) return t('search.placeholders.generic', 'Search...');
  if (pathname.startsWith('/hotels')) return t('search.placeholders.hotels', 'Search hotels...');
  if (pathname.startsWith('/events')) return t('search.placeholders.events', 'Find events...');
  if (pathname.startsWith('/marketplace'))
    return t('search.placeholders.marketplace', 'Browse marketplace...');
  if (pathname.startsWith('/news')) return t('search.placeholders.news', 'Read news...');
  if (pathname.startsWith('/personalities'))
    return t('search.placeholders.personalities', 'Meet personalities...');
  // The full universal placeholder overflows the narrow mobile header input
  // (it clipped to "Sear"). Use a short label on mobile.
  if (isMobile) return t('search.placeholders.universalShort', 'Search…');
  return t('search.placeholders.universal', 'Search venues, events, people, places…');
}

export const UniversalSearchBar = () => {
  const trackClickFromSearch = useTrackClick();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'search' | 'ask'>('search');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({ types: [] });
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [resultsFocused, setResultsFocused] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const justSelectedRef = useRef(false);
  // When the popover closes it refocuses the input; suppress the focus handler
  // from immediately re-opening it (otherwise Cancel/Escape can't close it).
  const suppressReopenRef = useRef(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const navigate = useLocalizedNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const assistant = useAssistant();

  const activeScope = filters.types && filters.types.length === 1 ? filters.types[0] : null;
  const scopeArray = useMemo(() => (activeScope ? [activeScope] : undefined), [activeScope]);

  // Close the popover on route change; clear query when leaving /search.
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = location.pathname;
    if (prevPath !== location.pathname) {
      setIsOpen(false);
      setShowFilters(false);
      setMode('search');
      if (prevPath.startsWith('/search') && !location.pathname.startsWith('/search')) {
        setQuery('');
      }
    }
  }, [location.pathname]);

  const {
    suggestions,
    countsByType,
    loading: suggestionsLoading,
    error: suggestionsError,
  } = useSearchSuggestions(query, scopeArray);
  const { mode: userMode } = useUserMode();
  // The page someone is standing on is the strongest signal about what they
  // want, and it used to be the one signal this panel ignored: trending tiles
  // were biased by user_mode alone, so /going-out and /rights showed the same
  // six. Intent wins where there is one; user_mode stays the fallback for
  // every route that is not an intent page.
  const trendingTypes = useMemo(() => {
    const intent = findActiveIntent(stripLocale(location.pathname));
    const intentBias = intent ? (INTENT_SCOPE_BIAS[intent.id] ?? []) : [];
    const modeBias = MODE_SCOPE_BIAS[userMode] ?? ['venue', 'event'];
    // Intent types lead, mode types top up — NOT replace. Replacing empties the
    // panel wherever the intent's own types have no trending rows: measured on
    // /shop, where ['marketplace','guide'] returned nothing and the tiles
    // disappeared entirely, which is worse than the generic ones they replaced.
    // A union biases toward the current job while keeping the panel populated.
    return [...new Set([...intentBias, ...modeBias])].slice(0, 3);
  }, [userMode, location.pathname]);
  const { trending } = useTrendingSuggestions(isOpen && !query, 6, trendingTypes);
  // §9.1 zero-query panel: prefer the personalized/popularity-aware recommendations
  // feed when available; fall back to trending. Gated behind a build flag so the
  // panel fires no /recommendations request until the worker endpoint is deployed.
  const recsEnabled = import.meta.env.VITE_RECOMMENDATIONS_ENABLED === 'true';
  const { user } = useAuth();
  const { recommendations } = useSearchRecommendations(recsEnabled && isOpen && !query, {
    limit: 6,
    types: trendingTypes,
    userId: user?.id ?? null,
  });
  const discoveryHits = recommendations.length > 0 ? recommendations : trending;
  const discoverySource: 'recommended' | 'trending' =
    recommendations.length > 0 ? 'recommended' : 'trending';
  const voice = useVoiceSearch();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    if (voice.transcript) setQuery(voice.transcript);
  }, [voice.transcript]);

  useEffect(() => {
    const saved = localStorage.getItem('recent-searches');
    if (!saved) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setRecentSearches(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  // Reset virtual focus when results change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setResultsFocused(null);
  }, [suggestions.length, activeScope]);

  const saveRecentSearch = useCallback((searchTerm: string) => {
    if (!searchTerm.trim()) return;
    setRecentSearches((prev) => {
      const updated = [searchTerm, ...prev.filter((s) => s !== searchTerm)].slice(0, 10);
      localStorage.setItem('recent-searches', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const focusInput = useCallback(() => {
    // Microtask defer covers the focus-after-Radix-opens-popover races.
    queueMicrotask(() => inputRef.current?.focus());
  }, []);

  const handleSearch = useCallback(
    (searchQuery?: string) => {
      const searchTerm = searchQuery ?? query;
      if (!searchTerm.trim()) return;
      saveRecentSearch(searchTerm);
      const params = new URLSearchParams({
        q: searchTerm,
        ...(filters.types && filters.types.length > 0 && { types: filters.types.join(',') }),
        ...(filters.location && { location: filters.location }),
        ...(filters.categories &&
          filters.categories.length > 0 && { categories: filters.categories.join(',') }),
        ...(filters.cluster_ids &&
          filters.cluster_ids.length > 0 && { clusters: filters.cluster_ids.join(',') }),
      });
      void trackSearchUx('search_submit', {
        query: searchTerm,
        scope: activeScope || 'all',
        filters_count:
          (filters.types?.length || 0) +
          (filters.location ? 1 : 0) +
          (filters.categories?.length || 0) +
          (filters.cluster_ids?.length || 0),
        source: 'universal_searchbar',
      });
      navigate(`/search?${params}`);
      setIsOpen(false);
    },
    [query, filters, activeScope, navigate, saveRecentSearch],
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: SearchSuggestion) => {
      justSelectedRef.current = true;
      const displayName = suggestion.name || suggestion.title || '';
      setQuery(displayName);
      if (suggestion.id && suggestion.type) {
        trackClickFromSearch({ type: suggestion.type, id: suggestion.id }, 'autocomplete', {
          query: displayName,
        });
      }
      // `detailHref` handles tags (by name), group/user (by id) and slug-keyed
      // types (canonical slug only). A slug-less / UUID-only hit returns null,
      // so we route to a fresh search on the label instead of a dead link.
      const href = detailHref({
        type: suggestion.type,
        slug: suggestion.slug,
        id: suggestion.id,
        title: suggestion.name || suggestion.title,
      });
      navigate(
        href ?? `/search?q=${encodeURIComponent(displayName)}&types=${suggestion.type}&direct=true`,
      );
      setIsOpen(false);
    },
    [navigate, trackClickFromSearch],
  );

  const setScope = useCallback(
    (scope: string | null) => {
      setFilters((f) => ({ ...f, types: scope ? [scope] : [] }));
      focusInput();
    },
    [focusInput],
  );

  // Enter the inline Ask-the-guide chat, seeding it with the current query.
  const enterAsk = useCallback(() => {
    setMode('ask');
    const q = query.trim();
    if (q && assistant.messages.length === 0 && !assistant.pending) {
      void assistant.send(q);
    }
  }, [query, assistant]);

  const navigateToCard = useCallback(
    (card: AssistantCard) => {
      setIsOpen(false);
      const href = detailHref({
        type: card.type,
        slug: card.slug as string,
        id: card.objectID,
        title: card.title,
      });
      navigate(href ?? `/search?q=${encodeURIComponent(card.title ?? '')}`);
    },
    [navigate],
  );

  /**
   * Put focus back on the search field after the overlay closes.
   *
   * Deferred by one tick, and that is load-bearing on desktop: the field lives
   * INSIDE the closing plate, so at call time `inputRef` still points at the
   * node React is tearing down and focusing it silently does nothing. One tick
   * later the field has been committed back into the header bar and the ref
   * points at the live node. Measured: without the defer,
   * `document.activeElement` is <body> after Escape.
   *
   * `suppressReopenRef` is what stops the restored focus from immediately
   * reopening the overlay via the field's own onFocus handler.
   */
  const restoreFocusToField = useCallback(() => {
    // Arm only. The focus itself happens in the close effect below, which is
    // the only point where the field is guaranteed to be mounted in the bar.
    suppressReopenRef.current = true;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Alt+1..9 → scope shortcut
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const target = idx === 0 ? null : (SCOPE_IDS[idx - 1] ?? null);
        setScope(target);
        e.preventDefault();
        return;
      }

      if (e.key === 'Escape') {
        if (mode === 'ask') {
          setMode('search');
          focusInput();
        } else {
          // Close only. The blur that used to live here is gone: on desktop
          // the field is inside the closing plate and has to come back to the
          // bar WITH focus, and an explicit blur races the restore and wins,
          // dropping the keyboard user on <body>. Focus restoration is owned
          // by one place — `restoreFocusToField` below — for both shells.
          setIsOpen(false);
          restoreFocusToField();
        }
        return;
      }

      // Tab → inline completion against top suggestion's prefix.
      if (e.key === 'Tab' && !e.shiftKey && query && suggestions[0]) {
        const top = suggestions[0];
        const candidate = (top.name || top.title || '').toString();
        if (
          candidate &&
          candidate.toLowerCase().startsWith(query.toLowerCase()) &&
          candidate !== query
        ) {
          e.preventDefault();
          setQuery(candidate);
          return;
        }
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setResultsFocused((i) => {
          if (suggestions.length === 0) return null;
          if (i === null) return 0;
          return Math.min(i + 1, suggestions.length - 1);
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setResultsFocused((i) => (i === null || i === 0 ? null : i - 1));
        return;
      }

      if (e.key === 'Enter') {
        if (resultsFocused !== null && suggestions[resultsFocused]) {
          e.preventDefault();
          handleSelectSuggestion(suggestions[resultsFocused]);
          return;
        }
        handleSearch();
      }
    },
    [
      mode,
      query,
      suggestions,
      resultsFocused,
      setScope,
      focusInput,
      handleSelectSuggestion,
      handleSearch,
    ],
  );

  // ⌘K / Ctrl+K hotkey.
  useSearchHotkey(() => {
    setIsOpen(true);
    focusInput();
  });

  // Auto-focus when popover opens (search mode only — Ask owns its own input).
  useEffect(() => {
    if (isOpen && mode === 'search') focusInput();
  }, [isOpen, mode, focusInput]);

  /**
   * Return focus to the field when the overlay closes, so Escape does not drop
   * a keyboard user on <body> with no idea where the search went.
   *
   * This is an EFFECT, not Radix's `onCloseAutoFocus` callback and not a
   * timer. On desktop the field lives inside the closing plate, so at callback
   * time `inputRef` still points at the node React is tearing down and
   * focusing it does nothing. An effect keyed on `isOpen` runs after the
   * commit that puts the field back in the bar, so the ref is live.
   *
   * Deliberately not rAF: `requestAnimationFrame` does not run in a hidden or
   * backgrounded tab, which would leave focus stranded exactly when a restore
   * is queued and the reader tabs away and back.
   */
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !isOpen && suppressReopenRef.current) {
      inputRef.current?.focus();
      suppressReopenRef.current = false;
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform);

  const activeFiltersCount =
    (filters.types?.length || 0) +
    (filters.location ? 1 : 0) +
    (filters.categories?.length || 0) +
    (filters.priceRange ? 1 : 0) +
    (filters.rating ? 1 : 0);

  const clearRecents = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem('recent-searches');
  }, []);

  // "Add it to the map" from the no-results state. Reuses the header's own
  // contextual contribute target rather than hardcoding /submit, so the two
  // contribute affordances on the page cannot point at different places.
  const handleAddToMap = useCallback(() => {
    setIsOpen(false);
    navigate(getSubmitCta(location.pathname, t).route);
  }, [navigate, location.pathname, t]);

  const placeholder = useMemo(
    () => getPlaceholder(location.pathname, t, isMobile),
    [location.pathname, t, isMobile],
  );

  const inputHeight = isMobile ? 48 : 40;
  const iconSize = isMobile ? 20 : 16;

  // Desktop opens the command modal; mobile keeps the anchored full-screen
  // sheet. The mock's centered 680px plate is a desktop shape — at 390px it
  // would be a full-bleed sheet with a wasted 4px border, which is what the
  // mobile branch already is.
  const asModal = isOpen && !isMobile;

  /**
   * The one search box. It renders EITHER in the header bar or inside the
   * modal — never both, because two `role="combobox"` inputs claiming the same
   * listbox is an ambiguity for a screen reader and for `e2e/search-ux.spec.ts`,
   * which resolves `input[role=combobox]` and then asserts aria-expanded flips
   * on that same element.
   *
   * Moving it between parents remounts the DOM node. That is fine and load-
   * bearing knowledge: `query` lives on this component, so the text survives,
   * and the open effect re-runs `focusInput()`, so the caret follows.
   */
  const searchField = (panel: boolean) => {
    const h = panel ? 56 : inputHeight;
    const icon = panel ? 22 : iconSize;
    return (
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- search landmark also acts as a click target to focus the inner input; keyboard handling provided.
      <div
        ref={searchBoxRef}
        role="search"
        aria-label="Site search"
        className={cn(
          'flex cursor-text items-center bg-background transition-colors',
          panel
            ? // Inside the plate the box has no border of its own: the panel's
              // own 4px edge is the box, and the 3px rule is what separates the
              // query from its results.
              'border-b-[3px] border-foreground px-6'
            : 'rounded-container border-2 border-foreground focus-within:shadow-hard-sm',
        )}
        onClick={() => {
          setIsOpen(true);
          focusInput();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            setIsOpen(true);
            focusInput();
          }
        }}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none inline-flex shrink-0 items-center justify-center',
            panel ? 'pe-4 text-foreground' : 'text-muted-foreground',
          )}
          style={{ height: h, paddingInline: panel ? undefined : isMobile ? 16 : 12 }}
        >
          {panel ? (
            <TransitIcon name="search" size={icon} />
          ) : (
            <Search style={{ height: icon, width: icon }} />
          )}
        </span>
        <Input
          ref={inputRef}
          type="text"
          aria-label={t('search.ariaLabel', 'Search Queer Guide')}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="qg-search-listbox"
          aria-haspopup="listbox"
          aria-activedescendant={resultsFocused !== null ? `result-${resultsFocused}` : undefined}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (mode === 'ask') setMode('search');
            if (!isOpen && !justSelectedRef.current) setIsOpen(true);
            justSelectedRef.current = false;
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suppressReopenRef.current) {
              suppressReopenRef.current = false;
              return;
            }
            setIsOpen(true);
          }}
          autoComplete="off"
          // The field sits INSIDE this component's own bordered shell, so
          // it drops the primitive's border and fill — and therefore must
          // restate its foreground + placeholder (see inputPlateOverride
          // test: repainting the fill without the type is the failure
          // mode that once shipped white-on-#f5f5f5 at 1.09:1).
          className={cn(
            'min-w-0 flex-1 border-0 bg-transparent text-foreground placeholder:text-muted-foreground shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
            // The auto-focused field draws the global pink focus ring
            // (index.css `*:focus-visible`, `!important`). The mock shows
            // no ring, but that rule is the site's WCAG 2.4.7 guarantee
            // and no utility can beat `!important` anyway — a
            // `focus-visible:outline-none` here is a silent no-op that
            // reads as if it did something. Left alone on purpose.
            panel ? 'font-bold' : 'text-sm md:text-sm',
          )}
          style={{
            // The mock sets the query at 19/700 — it is the loudest thing
            // on the plate because it is the only thing the reader wrote.
            fontSize: panel ? '1.1875rem' : isMobile ? '1rem' : '0.875rem',
            height: h,
          }}
        />
        {/* Trailing controls sit in a flex sibling cell (not absolutely
                positioned over the input) so their tap targets don't overlap
                the input — WCAG 2.5.8 target-size was failing the voice/clear
                buttons on every page (safe clickable space ~15px). */}
        <span className={cn('flex shrink-0 items-center gap-1.5', panel ? 'ps-2' : 'pe-2')}>
          {!query && voice.supported && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={
                voice.listening
                  ? t('search.stopVoice', 'Stop voice search')
                  : t('search.voice', 'Voice search')
              }
              aria-pressed={voice.listening}
              onClick={(e) => {
                e.stopPropagation();
                if (voice.listening) voice.stop();
                else voice.start();
              }}
              className={cn('p-0', voice.listening ? 'text-destructive' : 'text-muted-foreground')}
              style={{
                height: isMobile ? 32 : 28,
                width: isMobile ? 32 : 28,
              }}
            >
              <Mic style={{ height: isMobile ? 16 : 14, width: isMobile ? 16 : 14 }} />
            </Button>
          )}
          {/* The hint belongs to the CLOSED bar — inside the modal the
                    shortcut has already been spent, and the mock puts an `esc`
                    chip there instead. e2e/search-ux.spec.ts asserts this kbd
                    renders on an empty field, which is the closed state. */}
          {!query && !isMobile && !panel && (
            <kbd
              aria-hidden="true"
              className="pointer-events-none rounded-badge border border-foreground px-1.5 py-0.5 text-xs2 leading-none text-muted-foreground font-[inherit]"
            >
              {isMac ? '⌘K' : 'Ctrl+K'}
            </kbd>
          )}
          {query && suggestionsLoading && <TrackLoader size={isMobile ? 14 : 12} />}
          {query && (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Clear search"
              className="p-0 text-muted-foreground hover:text-foreground"
              style={{ height: isMobile ? 32 : 28, width: isMobile ? 32 : 28 }}
              onClick={() => {
                setQuery('');
                focusInput();
              }}
            >
              <X style={{ height: isMobile ? 16 : 12, width: isMobile ? 16 : 12 }} />
            </Button>
          )}
          {panel && (
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="border-2 border-foreground px-2 py-1 text-xs2 font-bold uppercase leading-none text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              {t('search.escape', 'esc')}
            </button>
          )}
        </span>
      </div>
    );
  };

  // Escape / dismissal, shared by both shells. In Ask mode Escape steps BACK
  // to search rather than closing outright — losing a conversation to a
  // reflexive Escape is worse than one extra keypress.
  const handleDismissKey = useCallback(
    (e: { preventDefault: () => void }) => {
      if (mode === 'ask') {
        e.preventDefault();
        setMode('search');
        focusInput();
      } else {
        setIsOpen(false);
      }
    },
    [mode, focusInput],
  );

  // The results body is identical in both shells — only the frame differs.
  const popoverBody = (
    <Suspense
      fallback={
        <div className="p-4" role="status" aria-live="polite">
          <span className="sr-only">Loading search</span>
          <div className="h-4 w-2/3 animate-pulse rounded-badge bg-muted" />
          <div className="mt-2 h-4 w-1/2 animate-pulse rounded-badge bg-muted" />
        </div>
      }
    >
      {mode === 'ask' ? (
        <>
          {assistant.turnstile}
          <SearchAskPanel
            messages={assistant.messages}
            pending={assistant.pending}
            error={assistant.error}
            onSend={(m) => void assistant.send(m)}
            onBack={() => {
              setMode('search');
              focusInput();
            }}
            onSelectCard={navigateToCard}
          />
        </>
      ) : isMobile ? (
        <SearchPopoverMobile
          query={query}
          activeScope={activeScope}
          suggestions={suggestions}
          countsByType={countsByType}
          loading={suggestionsLoading}
          error={suggestionsError}
          trending={discoveryHits}
          discoverySource={discoverySource}
          showFilters={showFilters}
          filters={filters}
          setFilters={setFilters}
          setScope={setScope}
          onSelect={handleSelectSuggestion}
          onSearchAll={() => handleSearch()}
          onToggleFilters={() => setShowFilters(!showFilters)}
          activeFiltersCount={activeFiltersCount}
          onClose={() => setIsOpen(false)}
          onClear={() => {
            setQuery('');
            focusInput();
          }}
          onPrefetch={prefetchRoute}
          navigate={navigate}
          onAsk={enterAsk}
          onAddToMap={handleAddToMap}
          recentSearches={recentSearches}
          onSelectRecent={(term) => {
            setQuery(term);
            handleSearch(term);
          }}
          clearRecents={clearRecents}
        />
      ) : (
        <SearchPopoverDesktop
          query={query}
          activeScope={activeScope}
          suggestions={suggestions}
          countsByType={countsByType}
          loading={suggestionsLoading}
          error={suggestionsError}
          trending={discoveryHits}
          discoverySource={discoverySource}
          recentSearches={recentSearches}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          filters={filters}
          setFilters={setFilters}
          setScope={setScope}
          onSelectIndex={(s, i) => {
            setResultsFocused(i);
            handleSelectSuggestion(s);
          }}
          resultsFocused={resultsFocused}
          setResultsFocused={setResultsFocused}
          activeFiltersCount={activeFiltersCount}
          onSearchAll={() => handleSearch()}
          clearRecents={clearRecents}
          onSelectRecent={(term) => {
            setQuery(term);
            handleSearch(term);
          }}
          onSelectTrending={(hit) =>
            handleSelectSuggestion({
              id: hit.id,
              name: (hit.title || hit.name || '') as string,
              type: hit.type,
              icon: () => null,
              title: (hit.title || hit.name || '') as string,
              subtitle: hit.city as string | undefined,
              slug: hit.slug as string | undefined,
            })
          }
          onBrowse={(path) => {
            setIsOpen(false);
            navigate(path);
          }}
          onPrefetch={prefetchRoute}
          onAsk={enterAsk}
          onAddToMap={handleAddToMap}
        />
      )}
    </Suspense>
  );

  // ── Mobile: the field stays in the bar and the sheet fills the viewport ──
  if (isMobile) {
    return (
      <div className="min-w-0 flex-1">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverAnchor asChild>
            <div className="relative">{searchField(false)}</div>
          </PopoverAnchor>
          <PopoverContent
            // qg-mobile-search-overlay: a CSS hook (src/index.css) that
            // neutralizes Radix's translated popper wrapper so the fixed
            // full-screen sheet anchors to the viewport, not the wrapper.
            className="qg-mobile-search-overlay w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-none p-0"
            style={{
              position: 'fixed',
              inset: 0,
              width: '100vw',
              height: '100dvh',
              maxHeight: '100dvh',
              zIndex: 50,
            }}
            align="start"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              focusInput();
            }}
            onCloseAutoFocus={(e) => {
              // Same one-tick defer as the modal. On mobile the field never
              // leaves the bar, but the flag dance is identical: without the
              // deferred clear a stale flag swallows the NEXT genuine focus and
              // the sheet refuses to reopen until the user retypes.
              e.preventDefault();
              restoreFocusToField();
            }}
            onEscapeKeyDown={handleDismissKey}
            onPointerDownOutside={(e) => {
              // Clicking the search box itself is the anchor, not "outside" —
              // don't let Radix dismiss the popover we just opened.
              if (searchBoxRef.current?.contains(e.target as Node)) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (searchBoxRef.current?.contains(e.target as Node)) e.preventDefault();
            }}
          >
            {popoverBody}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // ── Desktop: the field lifts out of the bar into a centered plate ────────
  return (
    <div className="min-w-0 flex-1">
      {asModal ? (
        // A spacer, not the field: the field has moved into the plate, and
        // leaving a second combobox behind would give the listbox two owners.
        // Reserving its height keeps the header row from collapsing under the
        // modal, which reads as the page jumping as the scrim comes up.
        <div aria-hidden style={{ height: inputHeight + 4 }} />
      ) : (
        searchField(false)
      )}

      <DialogPrimitive.Root open={asModal} onOpenChange={setIsOpen}>
        <DialogPrimitive.Portal>
          {/* The mock's scrim is #111111cc — ink, not black, and unblurred:
              a blur behind a hard-edged plate reads as a soft shadow, which
              is the one depth cue this system does not use. */}
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/80 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className="fixed inset-x-0 top-[8vh] z-50 mx-auto flex max-h-[84vh] w-[calc(100%-3rem)] max-w-[680px] flex-col overflow-hidden border-4 border-foreground bg-background shadow-hard-lg duration-fast data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              focusInput();
            }}
            onCloseAutoFocus={(e) => {
              // Send focus back to the field the plate came out of, not to
              // document.body — otherwise Escape drops the reader at the top
              // of the page with no idea where the search went.
              //
              // The focus MUST be deferred. This fires while the field is still
              // mounted inside the closing plate, so `inputRef` points at the
              // node being torn down; focusing it is a no-op and focus lands on
              // <body>. One tick later React has committed the field back into
              // the bar and the ref points at the live node. Measured: without
              // the defer, `document.activeElement === inputRef.current` is
              // false after Escape.
              e.preventDefault();
              restoreFocusToField();
            }}
            onEscapeKeyDown={handleDismissKey}
          >
            <DialogPrimitive.Title className="sr-only">
              {t('search.ariaLabel', 'Search Queer Guide')}
            </DialogPrimitive.Title>
            {searchField(true)}
            <div className="min-h-0 flex-1 overflow-y-auto">{popoverBody}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
};
