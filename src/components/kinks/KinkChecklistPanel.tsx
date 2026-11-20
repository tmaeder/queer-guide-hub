import { useState } from 'react';
import { ClipboardList, Wand2 } from '@/components/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KinkGridEditor } from '@/components/kinks/KinkGridEditor';
import { KinkWizard } from '@/components/kinks/KinkWizard';

/** The checklist itself: guided or full list. Who sees it lives under Privacy & visibility. */
export default function KinkChecklistPanel() {
  const [tab, setTab] = useState('guided');
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="mb-6">
        <TabsTrigger value="guided" className="gap-1.5">
          <Wand2 className="h-4 w-4" />
          Guided
        </TabsTrigger>
        <TabsTrigger value="grid" className="gap-1.5">
          <ClipboardList className="h-4 w-4" />
          Full list
        </TabsTrigger>
      </TabsList>
      <TabsContent value="guided">
        <KinkWizard onFinished={() => setTab('grid')} />
      </TabsContent>
      <TabsContent value="grid">
        <KinkGridEditor />
      </TabsContent>
    </Tabs>
  );
}
