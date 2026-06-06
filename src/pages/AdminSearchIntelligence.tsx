import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AnalyticsTab } from '@/components/admin/search-intelligence/AnalyticsTab';
import { SynonymsTab } from '@/components/admin/search-intelligence/SynonymsTab';
import { AuditTab } from '@/components/admin/search-intelligence/AuditTab';
import { IngestionQualityTab } from '@/components/admin/search-intelligence/IngestionQualityTab';
import { SuggestionsTab } from '@/components/admin/search-intelligence/SuggestionsTab';
import { TopicsTab } from '@/components/admin/search-intelligence/TopicsTab';
import { SetupTab } from '@/components/admin/search-intelligence/SetupTab';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

export default function AdminSearchIntelligence() {
  // The Meili Search-Debugger / Settings / Reindexing / Consistency tabs were
  // removed in the Meili → Postgres decommission; the Synonyms editor returns
  // here driving the Postgres search_synonyms table the search-proxy reads.
  const [tab, setTab] = useState('analytics');
  // Term carried from an Analytics zero-result row into the Synonyms add dialog.
  const [synonymPrefill, setSynonymPrefill] = useState<string | null>(null);

  const addSynonymFor = (term: string) => {
    setSynonymPrefill(term);
    setTab('synonyms');
  };

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
          <TabsTrigger value="synonyms">Synonyms</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
          <TabsTrigger value="quality">Ingestion Quality</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="analytics">
            <AnalyticsTab onAddSynonym={addSynonymFor} />
          </TabsContent>
          <TabsContent value="synonyms">
            <SynonymsTab prefillTerm={synonymPrefill} />
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
