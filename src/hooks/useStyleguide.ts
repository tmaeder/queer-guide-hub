/**
 * Data access for the Styleguide & Tone-of-Voice system.
 *
 * Two audiences, one set of rows:
 *   `useStyleguide()`       public read for /styleguide (active rows only — RLS
 *                           enforces that, this is not a client-side choice)
 *   `useStyleguideAdmin()`  CRUD + publish for /admin/styleguide
 *
 * Tables are outside the generated Database type, so reads go through
 * `untypedFrom`. Writes go through PostgREST too rather than an RPC per field:
 * the tables carry BEFORE triggers that validate every string and AFTER
 * triggers that audit every change, so an editor's write is attributed and
 * bounded wherever it comes from. Publishing is the one privileged action and
 * is an RPC, because it has to compile and version atomically.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';

export type RuleSection =
  'persona' | 'vernacular' | 'inclusivity' | 'non_pathologizing' | 'accuracy' | 'formatting';

export type RuleSeverity = 'must' | 'should' | 'never';
export type TermSeverity = 'never' | 'avoid' | 'context';
export type VoiceProfile = 'full' | 'core' | 'compact';

export type TermCategory =
  | 'identity'
  | 'gender'
  | 'health'
  | 'race_ethnicity'
  | 'disability'
  | 'sex_kink'
  | 'legal_safety'
  | 'accessibility'
  | 'general';

export type ExampleScenario =
  | 'venue_nightlife'
  | 'community_health'
  | 'safety_advisory'
  | 'news'
  | 'city'
  | 'marketplace'
  | 'generic';

export interface StyleguideRule {
  id: string;
  slug: string;
  section: RuleSection;
  title: string;
  body: string;
  severity: RuleSeverity;
  applies_to: string[];
  rationale: string | null;
  sort_order: number;
  is_active: boolean;
  updated_at?: string;
}

export interface StyleguideTerm {
  id: string;
  slug: string;
  preferred: string | null;
  avoid: string[];
  category: TermCategory;
  severity: TermSeverity;
  rationale: string | null;
  context_note: string | null;
  sort_order: number;
  is_active: boolean;
  updated_at?: string;
}

export interface StyleguideExample {
  id: string;
  slug: string;
  scenario: ExampleScenario;
  title: string;
  before_text: string;
  after_text: string;
  note: string | null;
  sort_order: number;
  is_active: boolean;
  updated_at?: string;
}

export interface StyleguideVersion {
  version: string;
  note: string | null;
  is_active: boolean;
  published_at: string;
  doc?: { counts?: Record<string, number>; prompts?: Record<string, string> } | null;
  compiled_prompt?: string;
}

export interface StyleguideData {
  rules: StyleguideRule[];
  terms: StyleguideTerm[];
  examples: StyleguideExample[];
  version: StyleguideVersion | null;
}

/** Display labels. Kept here so the public page and the admin share one vocabulary. */
export const SECTION_LABELS: Record<RuleSection, string> = {
  persona: 'Persona and tone',
  vernacular: 'Queer vernacular',
  inclusivity: 'Inclusivity, intersectionality and anti-racism',
  non_pathologizing: 'Non-pathologizing language',
  accuracy: 'Accuracy, safety and honesty',
  formatting: 'Form and mechanics',
};

export const SECTION_ORDER: RuleSection[] = [
  'persona',
  'vernacular',
  'inclusivity',
  'non_pathologizing',
  'accuracy',
  'formatting',
];

export const CATEGORY_LABELS: Record<TermCategory, string> = {
  identity: 'Identity',
  gender: 'Gender',
  health: 'Health',
  race_ethnicity: 'Race and ethnicity',
  disability: 'Disability',
  accessibility: 'Access',
  sex_kink: 'Sex and kink',
  legal_safety: 'Law and safety',
  general: 'General house style',
};

export const SCENARIO_LABELS: Record<ExampleScenario, string> = {
  venue_nightlife: 'Venue / nightlife',
  community_health: 'Community health',
  safety_advisory: 'Safety advisory',
  news: 'News',
  city: 'City',
  marketplace: 'Marketplace',
  generic: 'General',
};

const SELECT_RULES =
  'id,slug,section,title,body,severity,applies_to,rationale,sort_order,is_active,updated_at';
const SELECT_TERMS =
  'id,slug,preferred,avoid,category,severity,rationale,context_note,sort_order,is_active,updated_at';
const SELECT_EXAMPLES =
  'id,slug,scenario,title,before_text,after_text,note,sort_order,is_active,updated_at';

async function fetchStyleguide(includeInactive: boolean): Promise<StyleguideData> {
  const [rules, terms, examples, versions] = await Promise.all([
    untypedFrom('styleguide_rules').select(SELECT_RULES).order('sort_order'),
    untypedFrom('styleguide_terms').select(SELECT_TERMS).order('sort_order'),
    untypedFrom('styleguide_examples').select(SELECT_EXAMPLES).order('sort_order'),
    untypedFrom('styleguide_versions')
      .select('version,note,is_active,published_at,doc')
      .eq('is_active', true)
      .maybeSingle(),
  ]);

  // Anon and non-admin callers never see inactive rows (RLS). An admin sees
  // them all and filters here, so the public page renders identically whoever
  // is signed in.
  const keep = <T extends { is_active: boolean }>(rows: T[] | null): T[] =>
    (rows ?? []).filter((r) => includeInactive || r.is_active);

  return {
    rules: keep(rules.data as unknown as StyleguideRule[]),
    terms: keep(terms.data as unknown as StyleguideTerm[]),
    examples: keep(examples.data as unknown as StyleguideExample[]),
    version: (versions.data as unknown as StyleguideVersion) ?? null,
  };
}

/** Public read. `includeInactive` only has an effect for admins (RLS). */
export function useStyleguide(includeInactive = false) {
  return useQuery({
    queryKey: ['styleguide', includeInactive],
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchStyleguide(includeInactive),
  });
}

/** Published version history, newest first. Admin surface. */
export function useStyleguideVersions() {
  return useQuery({
    queryKey: ['styleguide-versions'],
    queryFn: async (): Promise<StyleguideVersion[]> => {
      const { data } = await untypedFrom('styleguide_versions')
        .select('version,note,is_active,published_at,doc')
        .order('published_at', { ascending: false })
        .limit(50);
      return (data ?? []) as unknown as StyleguideVersion[];
    },
  });
}

type TableName = 'styleguide_rules' | 'styleguide_terms' | 'styleguide_examples';

/**
 * Admin mutations. Every one invalidates both the editable rows and the preview,
 * because the preview is the compiled result of those rows and a stale preview
 * is how somebody publishes a version they did not read.
 */
export function useStyleguideAdmin() {
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['styleguide'] });
    void qc.invalidateQueries({ queryKey: ['styleguide-preview'] });
  };

  const upsert = useMutation({
    mutationFn: async ({ table, row }: { table: TableName; row: Record<string, unknown> }) => {
      const query = row.id
        ? untypedFrom(table)
            .update(row)
            .eq('id', row.id as string)
        : untypedFrom(table).insert(row);
      const { error } = await query;
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async ({ table, id }: { table: TableName; id: string }) => {
      const { error } = await untypedFrom(table).delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const publish = useMutation({
    mutationFn: async ({ bump, note }: { bump: 'major' | 'minor' | 'patch'; note: string }) => {
      const { data, error } = await untypedRpc<string>('styleguide_publish', {
        p_bump: bump,
        p_note: note || null,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ['styleguide-versions'] });
    },
  });

  const activate = useMutation({
    mutationFn: async (version: string) => {
      const { error } = await untypedRpc<string>('styleguide_activate_version', {
        p_version: version,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ['styleguide-versions'] });
    },
  });

  return { upsert, remove, publish, activate };
}

/** What WOULD be published right now, compiled server-side by the same function. */
export function useStyleguidePreview(profile: VoiceProfile = 'full') {
  return useQuery({
    queryKey: ['styleguide-preview', profile],
    staleTime: 0,
    queryFn: async (): Promise<string> => {
      const { data, error } = await untypedRpc<{ prompt?: string }>('styleguide_preview', {
        p_scope: 'all',
        p_profile: profile,
      });
      if (error) throw new Error(error.message);
      return data?.prompt ?? '';
    },
  });
}
