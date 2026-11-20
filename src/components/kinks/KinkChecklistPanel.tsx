import { useState } from 'react';
import { ClipboardList, Eye, Link2, Wand2 } from '@/components/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KinkGridEditor } from '@/components/kinks/KinkGridEditor';
import { KinkWizard } from '@/components/kinks/KinkWizard';
import { KinkVisibilityStep } from '@/components/kinks/KinkVisibilityStep';
import { KinkShareManager } from '@/components/kinks/KinkShareManager';

/** The checklist itself: guided, full list, visibility, share. Callers own the opt-in gate. */
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
        <TabsTrigger value="visibility" className="gap-1.5">
          <Eye className="h-4 w-4" />
          Visibility
        </TabsTrigger>
        <TabsTrigger value="share" className="gap-1.5">
          <Link2 className="h-4 w-4" />
          Share
        </TabsTrigger>
      </TabsList>
      <TabsContent value="guided">
        <KinkWizard onFinished={() => setTab('share')} />
      </TabsContent>
      <TabsContent value="grid">
        <KinkGridEditor />
      </TabsContent>
      <TabsContent value="visibility">
        <KinkVisibilityStep />
      </TabsContent>
      <TabsContent value="share">
        <KinkShareManager />
      </TabsContent>
    </Tabs>
  );
}
