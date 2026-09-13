import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { useTabParam } from '@/components/admin/primitives/useTabParam';
import { EditorMicroGuide } from '@/components/admin/styleguide/EditorMicroGuide';
import { RulesTab, TermsTab, ExamplesTab } from '@/components/admin/styleguide/StyleguideTabs';
import { PublishTab } from '@/components/admin/styleguide/PublishTab';
import { useStyleguide } from '@/hooks/useStyleguide';

/**
 * `/admin/styleguide` — where the editorial voice is maintained.
 *
 * The audience is community editors, not prompt engineers, which is why the
 * micro-guide sits above the tabs rather than in a docs page nobody opens, and
 * why every form field asks for something an editor already knows how to answer
 * ("what should we write instead", "why") rather than anything about models.
 *
 * `includeInactive` is passed so retired rows stay visible to an admin. RLS
 * decides whether they actually come back, so a non-admin who reaches this page
 * sees the public set and can change nothing.
 */

const TABS = ['rules', 'terms', 'examples', 'publish'] as const;

export default function AdminStyleguide() {
  const [tab, setTab] = useTabParam(TABS);

  const { data, isLoading, error } = useStyleguide(true);

  return (
    <div>
      <AdminPageHeader
        title="Styleguide & Tone of Voice"
        subtitle="The editorial standard. Published here, rendered at /styleguide, and compiled into the system prompt every automated writing job runs on."
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <p className="text-13 text-destructive">
          Failed to load the styleguide: {(error as Error).message}
        </p>
      ) : (
        <>
          <EditorMicroGuide />
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="rules">Rules ({data?.rules.length ?? 0})</TabsTrigger>
              <TabsTrigger value="terms">Terminology ({data?.terms.length ?? 0})</TabsTrigger>
              <TabsTrigger value="examples">Examples ({data?.examples.length ?? 0})</TabsTrigger>
              <TabsTrigger value="publish">Publish</TabsTrigger>
            </TabsList>
            <div className="mt-6">
              <TabsContent value="rules">
                <RulesTab rules={data?.rules ?? []} />
              </TabsContent>
              <TabsContent value="terms">
                <TermsTab terms={data?.terms ?? []} />
              </TabsContent>
              <TabsContent value="examples">
                <ExamplesTab examples={data?.examples ?? []} />
              </TabsContent>
              <TabsContent value="publish">
                <PublishTab activeVersion={data?.version?.version ?? null} />
              </TabsContent>
            </div>
          </Tabs>
        </>
      )}
    </div>
  );
}
