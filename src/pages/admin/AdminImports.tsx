/**
 * AdminImports — "Import data" hub. A single discoverable home for the manual,
 * operator-run import tools that previously lived only on the (now unlinked)
 * legacy entity pages. Pure composition: each tab mounts existing, tested
 * import components; no new import logic lives here.
 */

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VenueProviderImport } from '@/components/admin/venues/VenueProviderImport';
import { VenuesCsvImport } from '@/components/venues/VenuesCsvImport';
import { EventbriteImport } from '@/components/events/EventbriteImport';
import { TicketmasterImport } from '@/components/events/TicketmasterImport';
import { EventsCsvImport } from '@/components/events/EventsCsvImport';
import { PersonalitiesCsvImport } from '@/components/personalities/PersonalitiesCsvImport';
import { AdultModelsCsvImport } from '@/components/personalities/AdultModelsCsvImport';
import { BulkCreatePersonalities } from '@/components/personalities/BulkCreatePersonalities';
import { AwinImportDialog } from '@/components/marketplace/AwinImportDialog';
import { UrlImportCard } from '@/components/admin/UrlImportCard';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-title">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function AdminImports() {
  return (
    <div className="flex flex-col gap-6">
      {/* mb-0: the parent already spaces children with gap-6. */}
      <AdminPageHeader
        className="mb-0"
        title="Import data"
        subtitle="Manual, operator-run imports. Each one stages records into the normal review pipeline."
      />

      <UrlImportCard />

      <Tabs defaultValue="venues">
        <TabsList>
          <TabsTrigger value="venues">Venues</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="personalities">Personalities</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
        </TabsList>

        <TabsContent value="venues" className="flex flex-col gap-6 pt-4">
          <Section title="Provider import">
            <VenueProviderImport />
          </Section>
          <Section title="CSV import">
            <VenuesCsvImport />
          </Section>
        </TabsContent>

        <TabsContent value="events" className="flex flex-col gap-6 pt-4">
          <Section title="Eventbrite">
            <EventbriteImport />
          </Section>
          <Section title="Ticketmaster">
            <TicketmasterImport />
          </Section>
          <Section title="CSV import">
            <EventsCsvImport />
          </Section>
        </TabsContent>

        <TabsContent value="personalities" className="flex flex-col gap-6 pt-4">
          <Section title="CSV import">
            <PersonalitiesCsvImport />
          </Section>
          <Section title="Adult models CSV">
            <AdultModelsCsvImport />
          </Section>
          <Section title="Bulk create">
            <BulkCreatePersonalities />
          </Section>
        </TabsContent>

        <TabsContent value="marketplace" className="flex flex-col gap-6 pt-4">
          <Section title="Awin product feed">
            <AwinImportDialog />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
