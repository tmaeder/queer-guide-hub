import { Tabs, TabsList, TabsTrigger, TabsContent, Badge } from 'queer-guide';

// Capture harness freezes the clock — kill the tabs enter animation so the
// active panel lands at its settled state instead of mid fade/slide.
const TabsStatic = () => (
  <style>{`[data-state="active"][role="tabpanel"]{animation:none!important;opacity:1!important;transform:none!important}`}</style>
);

export const CityGuideTabs = () => (
  <div style={{ width: 560 }}>
    <TabsStatic />
    <Tabs defaultValue="venues">
      <TabsList>
        <TabsTrigger value="venues">Venues</TabsTrigger>
        <TabsTrigger value="events">Events</TabsTrigger>
        <TabsTrigger value="safety">Safety</TabsTrigger>
      </TabsList>
      <TabsContent value="venues">
        <ul className="divide-y divide-border">
          <li className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">SchwuZ</p>
              <p className="text-13 text-muted-foreground">Queer club · Neukölln</p>
            </div>
            <Badge variant="soft">Club</Badge>
          </li>
          <li className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Silver Future</p>
              <p className="text-13 text-muted-foreground">Queer bar · Neukölln</p>
            </div>
            <Badge variant="soft">Bar</Badge>
          </li>
          <li className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">Südblock</p>
              <p className="text-13 text-muted-foreground">Café &amp; venue · Kreuzberg</p>
            </div>
            <Badge variant="soft">Café</Badge>
          </li>
        </ul>
      </TabsContent>
      <TabsContent value="events">
        <p className="text-sm text-muted-foreground">42 events this month.</p>
      </TabsContent>
      <TabsContent value="safety">
        <p className="text-sm text-muted-foreground">
          Berlin scores 87/100 on the Equality Index.
        </p>
      </TabsContent>
    </Tabs>
  </div>
);
