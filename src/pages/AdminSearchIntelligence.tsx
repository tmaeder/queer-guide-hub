import { useState } from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OverviewTab } from '@/components/admin/search-intelligence/OverviewTab';
import { SearchDebuggerTab } from '@/components/admin/search-intelligence/SearchDebuggerTab';
import { SynonymsTab } from '@/components/admin/search-intelligence/SynonymsTab';
import { AuditTab } from '@/components/admin/search-intelligence/AuditTab';
import { IngestionQualityTab } from '@/components/admin/search-intelligence/IngestionQualityTab';
import { ReindexTab } from '@/components/admin/search-intelligence/ReindexTab';
import { SuggestionsTab } from '@/components/admin/search-intelligence/SuggestionsTab';
import { SettingsTab } from '@/components/admin/search-intelligence/SettingsTab';
import { TopicsTab } from '@/components/admin/search-intelligence/TopicsTab';
import { PlaceholderTab } from '@/components/admin/search-intelligence/PlaceholderTab';

const FEATURE_FLAG_ENABLED = import.meta.env.VITE_FEATURE_SEARCH_INTELLIGENCE === '1';

export default function AdminSearchIntelligence() {
  const [tab, setTab] = useState('overview');

  if (!FEATURE_FLAG_ENABLED) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>
          Search Intelligence
        </Typography>
        <Typography color="text.secondary">
          This admin surface is behind the <code>VITE_FEATURE_SEARCH_INTELLIGENCE</code> feature
          flag. Set it to <code>1</code> at build time to enable. Backend (database + edge function)
          is already deployable independently.
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4">Search Intelligence</Typography>
        <Typography variant="body2" color="text.secondary">
          Unified admin surface for tags, synonyms, geo, images, dates, and Meilisearch backend.
        </Typography>
      </Box>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="debug">Search Debugger</TabsTrigger>
          <TabsTrigger value="synonyms">Synonyms</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="reindex">Reindexing</TabsTrigger>
          <TabsTrigger value="quality">Ingestion Quality</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          <TabsTrigger value="consistency">Consistency</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        <Box sx={{ mt: 3 }}>
          <TabsContent value="overview">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="debug">
            <SearchDebuggerTab />
          </TabsContent>
          <TabsContent value="synonyms">
            <SynonymsTab />
          </TabsContent>
          <TabsContent value="topics">
            <TopicsTab />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
          <TabsContent value="reindex">
            <ReindexTab />
          </TabsContent>
          <TabsContent value="quality">
            <IngestionQualityTab />
          </TabsContent>
          <TabsContent value="suggestions">
            <SuggestionsTab />
          </TabsContent>
          <TabsContent value="consistency">
            <PlaceholderTab
              title="Consistency Check"
              description="Compare Postgres rows against Meilisearch documents per index. Detects missing-in-meili (re-index needed) and orphans-in-meili (tombstone sweep needed)."
              bullets={[
                'POST /consistency-check — wired (paginates Meili docs)',
                'UI to drive a check + show diff: minimal in Phase 0',
                'One-click "fix" buttons (sync missing, delete orphans): Phase 1 follow-up',
              ]}
            />
          </TabsContent>
          <TabsContent value="audit">
            <AuditTab />
          </TabsContent>
        </Box>
      </Tabs>
    </Container>
  );
}
