import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import KinkChecklistPanel from '@/components/kinks/KinkChecklistPanel';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

/**
 * The interests & boundaries checklist tool. 18+ — sits entirely behind the
 * intimate opt-in (consent + verified email + moderation approval).
 */
export default function KinkChecklist() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { data: me, isLoading } = useMyIntimateProfile();

  if (loading || isLoading) {
    return (
      <PageContainer size="form">
        <PageLoadingState count={2} variant="list" label="Loading your checklist" />
      </PageContainer>
    );
  }

  if (!user) {
    return (
      <PageContainer size="form" className="text-center">
        <h1 className="text-headline font-display">Interests & boundaries checklist</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          A private checklist for consenting adults. Sign in to use it.
        </p>
        <Button className="mt-6 rounded-element" onClick={() => navigate('/auth')}>
          Sign in
        </Button>
      </PageContainer>
    );
  }

  if (!me?.opted_in_at) {
    return (
      <PageContainer size="form" className="text-center">
        <h1 className="text-headline font-display">Interests & boundaries checklist</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          This tool is part of the intimate layer — 18+, opt-in, verified email. Everything you
          enter is private by default; you choose per category who can see it.
        </p>
        <Button
          className="mt-6 rounded-element"
          onClick={() => navigate('/meet/dating/onboarding')}
        >
          Enable intimate profile
        </Button>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="reading">
      <header className="mb-6">
        <h1 className="text-display font-display">Interests & boundaries</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Rate what you're into, mark limits, flag things to discuss first. Private by default. Your
          No's and hard limits are never shown to anyone — they only remove items from comparisons,
          silently.
        </p>
      </header>

      <KinkChecklistPanel />
    </PageContainer>
  );
}
