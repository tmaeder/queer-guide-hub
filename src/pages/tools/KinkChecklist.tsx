import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardList, Eye, Link2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import { KinkGridEditor } from '@/components/kinks/KinkGridEditor';
import { KinkWizard } from '@/components/kinks/KinkWizard';
import { KinkVisibilityStep } from '@/components/kinks/KinkVisibilityStep';
import { KinkShareManager } from '@/components/kinks/KinkShareManager';

/**
 * The interests & boundaries checklist tool. 18+ — sits entirely behind the
 * intimate opt-in (consent + verified email + moderation approval).
 */
export default function KinkChecklist() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { data: me, isLoading } = useMyIntimateProfile();
  const [tab, setTab] = useState('guided');

  if (loading || isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-headline font-display">Interests & boundaries checklist</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          A private checklist for consenting adults. Sign in to use it.
        </p>
        <Button className="mt-6 rounded-element" onClick={() => navigate('/auth')}>
          Sign in
        </Button>
      </div>
    );
  }

  if (!me?.opted_in_at) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-headline font-display">Interests & boundaries checklist</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          This tool is part of the intimate layer — 18+, opt-in, verified email. Everything
          you enter is private by default; you choose per category who can see it.
        </p>
        <Button className="mt-6 rounded-element" onClick={() => navigate('/intimate/onboard')}>
          Enable intimate profile
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-headline-lg font-display">Interests & boundaries</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Rate what you're into, mark limits, flag things to discuss first. Private by
          default. Your No's and hard limits are never shown to anyone — they only remove
          items from comparisons, silently.
        </p>
      </header>

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
    </div>
  );
}
