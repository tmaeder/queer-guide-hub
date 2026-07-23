import { useSearchParams } from 'react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { useDesignSettings } from '@/components/admin/design/useDesignSettings';
import { DraftStatusBar } from '@/components/admin/design/DraftStatusBar';
import { TokensTab } from '@/components/admin/design/TokensTab';
import { BrandAssetsTab } from '@/components/admin/design/BrandAssetsTab';
import { SeoMetaTab } from '@/components/admin/design/SeoMetaTab';
import { EmailBrandingTab } from '@/components/admin/design/EmailBrandingTab';
import { DesignAuditTab } from '@/components/admin/design/DesignAuditTab';
import { Skeleton } from '@/components/ui/skeleton';

const TABS = ['tokens', 'assets', 'seo', 'email', 'audit'] as const;

export default function DesignSystem() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab = (TABS as readonly string[]).includes(tabParam ?? '') ? tabParam! : 'tokens';
  const controller = useDesignSettings();

  return (
    <div className="container mx-auto max-w-screen-xl px-4 py-8">
      <AdminPageHeader
        title="Design & Branding"
        subtitle="Design tokens, brand assets, SEO identity and email branding — published changes go live without a deploy."
      />
      {controller.query.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : controller.query.isError ? (
        <p className="text-13 text-destructive">
          Failed to load branding settings: {(controller.query.error as Error).message}
        </p>
      ) : (
        <>
          <DraftStatusBar controller={controller} />
          <Tabs
            value={tab}
            onValueChange={(next) => setSearchParams({ tab: next }, { replace: true })}
          >
            <TabsList>
              <TabsTrigger value="tokens">Tokens</TabsTrigger>
              <TabsTrigger value="assets">Brand assets</TabsTrigger>
              <TabsTrigger value="seo">SEO & meta</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
            </TabsList>
            <div className="mt-6">
              <TabsContent value="tokens">
                <TokensTab controller={controller} />
              </TabsContent>
              <TabsContent value="assets">
                <BrandAssetsTab controller={controller} />
              </TabsContent>
              <TabsContent value="seo">
                <SeoMetaTab controller={controller} />
              </TabsContent>
              <TabsContent value="email">
                <EmailBrandingTab controller={controller} />
              </TabsContent>
              <TabsContent value="audit">
                <DesignAuditTab controller={controller} />
              </TabsContent>
            </div>
          </Tabs>
        </>
      )}
    </div>
  );
}
