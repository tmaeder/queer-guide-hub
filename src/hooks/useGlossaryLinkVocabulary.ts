import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { GlossaryLinkTerm, GlossaryMatchMode } from '@/lib/glossaryLinks';

/**
 * The human-reviewed vocabulary of surface forms that may become inline links
 * in body text.
 *
 * Reads `glossary_link_terms_public`, never the base table: every gate — active
 * tag, not merged, indexable, not adult, not anon-gated, has a definition —
 * lives in that view so the SPA, the Cloudflare edge builder and the sentinel
 * cannot drift apart. Do not add a `.eq()` here that restates one of them.
 *
 * WHY A CONTEXT AND NOT `useQuery` IN THE CONSUMER. `GlossaryLinkedText` is
 * rendered from ~13 prose sites. Calling `useQuery` inside it made every one of
 * those components — and every test that mounts one — require a
 * `QueryClientProvider` in its tree, and React Query THROWS when there is none.
 * That turned a decorative text renderer into something that can take down a
 * page, which is the opposite of the fail-open contract this feature has
 * everywhere else; it broke four existing test files on the first full run. A
 * context with an empty default degrades to plain prose instead, and the fetch
 * happens once for the app rather than once per prose block.
 */

/**
 * PostgREST caps an unbounded select at 1,000 rows. A silently truncated
 * vocabulary is the worst failure here: links would stop appearing partway
 * through the alphabet with nothing reporting it, which reads exactly like
 * "those terms are not in the glossary".
 */
const VOCABULARY_HARD_CAP = 5000;

/**
 * The vocabulary changes only when an admin reviews a term. One fetch per
 * session is plenty, and a stable cached array is also what lets the matcher
 * memoise its compiled regex (it keys on array identity).
 */
const STALE_TIME = 24 * 60 * 60_000;

/**
 * The SPA vocabulary fetch, off until the view exists on prod.
 *
 * WHY THIS SHIPS OFF, AND WHY IT COSTS NOTHING.
 *
 * `glossary_link_terms` ships EMPTY — every row starts as a `candidate` and
 * links nothing until a human activates it — so this fetch currently returns
 * `[]` and produces zero links either way. Turning it off loses no behaviour
 * that exists today.
 *
 * What it avoids is a real defect. `Critical paths` builds this branch and
 * points it at the LIVE backend, where `glossary_link_terms_public` does not
 * exist until the migration in this PR is applied — so PostgREST answers 404 and
 * Chrome logs `Failed to load resource: … 404` on EVERY page. That failed
 * `e2e/trip-creation.spec.ts`'s `no console errors` assertion, which excludes
 * only `net::ERR_*` infrastructure errors and correctly treats an HTTP 404 as an
 * application fault. It is not a CI artefact either: between merge and the
 * migration applying, real visitors would get the same 404 on every page load.
 *
 * An `/api/` Pages Function would NOT fix it — that job serves the build through
 * `vite preview`, which runs no Functions, so the endpoint 404s there too.
 *
 * TO ENABLE: once migration 20600101100000 is applied to prod (check
 * `to_regclass('public.glossary_link_terms_public')`), flip this to `true`. The
 * crawler side needs no flag and works immediately — its fetch is server-side
 * and already fails open to plain prose, so a 404 there is invisible to anyone.
 */
export const GLOSSARY_LINK_FETCH_ENABLED = false;

type VocabularyRow = {
  surface_form: string | null;
  match_mode: string | null;
  slug: string | null;
};

/**
 * `glossary_link_terms_public` arrives with migration 20600101100000, so it is
 * not yet in the generated `src/integrations/supabase/types.ts`. Rather than a
 * blanket `any` — which would also silence a genuine column rename — the three
 * columns this hook reads are declared here. Drop the cast once types are
 * regenerated against the applied migration.
 */
type VocabularyReader = {
  from: (table: string) => {
    select: (columns: string) => {
      limit: (count: number) => PromiseLike<{
        data: VocabularyRow[] | null;
        error: { message: string } | null;
      }>;
    };
  };
};

export async function fetchGlossaryLinkVocabulary(): Promise<GlossaryLinkTerm[]> {
  const { data, error } = await (supabase as unknown as VocabularyReader)
    .from('glossary_link_terms_public')
    .select('surface_form,match_mode,slug')
    .limit(VOCABULARY_HARD_CAP);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (rows.length >= VOCABULARY_HARD_CAP) {
    console.warn(
      `[glossary-links] vocabulary hit the ${VOCABULARY_HARD_CAP}-row cap — terms beyond it will never link. Raise VOCABULARY_HARD_CAP and page the fetch.`,
    );
  }

  const terms: GlossaryLinkTerm[] = [];
  for (const row of rows) {
    if (!row?.surface_form || !row?.slug) continue;
    terms.push({
      surfaceForm: row.surface_form,
      slug: row.slug,
      matchMode: (row.match_mode as GlossaryMatchMode | null) ?? 'exact',
    });
  }
  return terms;
}

/**
 * Module-level so the no-provider case is also a STABLE reference — the matcher
 * memoises its compiled regex on the array identity, and a fresh `[]` per render
 * would defeat that (and re-run every `useMemo` downstream).
 */
const EMPTY_VOCABULARY: GlossaryLinkTerm[] = [];

const GlossaryVocabularyContext = createContext<GlossaryLinkTerm[]>(EMPTY_VOCABULARY);

/**
 * Fetches the vocabulary once and publishes it to every prose renderer below.
 * Mounted near the app root. Absent — in a unit test, or in any subtree
 * rendered outside it — consumers see an empty vocabulary and render plain
 * prose, which is the intended degradation rather than an error.
 */
export function GlossaryVocabularyProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ['glossary-link-vocabulary'],
    queryFn: fetchGlossaryLinkVocabulary,
    // See GLOSSARY_LINK_FETCH_ENABLED: off until the view exists on prod, so no
    // request is made and no 404 is logged. A test seeded via setQueryData still
    // resolves, which is what keeps the render path covered while this is off.
    enabled: GLOSSARY_LINK_FETCH_ENABLED,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME,
    retry: 1,
  });
  return createElement(
    GlossaryVocabularyContext.Provider,
    { value: data ?? EMPTY_VOCABULARY },
    children,
  );
}

/**
 * The vocabulary for the current tree, or an empty one. Never throws and never
 * fetches: a failed or absent provider means prose renders without links.
 */
export function useGlossaryLinkVocabulary(): GlossaryLinkTerm[] {
  return useContext(GlossaryVocabularyContext);
}
