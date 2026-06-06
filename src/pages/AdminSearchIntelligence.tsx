import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AnalyticsTab } from '@/components/admin/search-intelligence/AnalyticsTab';
import { AuditTab } from '@/components/admin/search-intelligence/AuditTab';
import { IngestionQualityTab } from '@/components/admin/search-intelligence/IngestionQualityTab';
import { SuggestionsTab } from '@/components/admin/search-intelligence/SuggestionsTab';
import { TopicsTab } from '@/components/admin/search-intelligence/TopicsTab';
import { SetupTab } from '@/components/admin/search-intelligence/SetupTab';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

export default function AdminSearchIntelligence() {
  // Meilisearch tabs (Overview / Search Debugger / Synonyms / Settings /
  // Reindexing / Consistency) were removed in the Meili → Postgres decommission;
  // search is served from the Postgres search_documents engine.
  const [tab, setTab] = useState('analytics');

  return (
    <div className="container mx-auto max-w-screen-xl px-4 py-8">
      <AdminPageHeader
        eyebrow="Import & Review"
        title="Search Intelligence"
        subtitle="Admin surface for tags, topics, suggestions, ingestion quality, and audit."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
          <TabsTrigger value="quality">Ingestion Quality</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="analytics">
            <AnalyticsTab />
          </TabsContent>
          <TabsContent value="setup">
            <SetupTab />
          </TabsContent>
          <TabsContent value="topics">
            <TopicsTab />
          </TabsContent>
          <TabsContent value="quality">
            <IngestionQualityTab />
          </TabsContent>
          <TabsContent value="suggestions">
            <SuggestionsTab />
          </TabsContent>
          <TabsContent value="audit">
            <AuditTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
