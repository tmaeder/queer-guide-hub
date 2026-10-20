import { useEffect, useRef, useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useBlueskyIdentity } from '@/hooks/useBlueskyIdentity';
import { useMeta } from '@/hooks/useMeta';
import { completeBlueskyCallback } from '@/lib/atprotoClient';

/** OAuth redirect target for "Connect Bluesky" (registered in client-metadata.json). */
export default function BlueskyCallback() {
  useMeta({ title: 'Connecting Bluesky', noIndex: true });
  const navigate = useLocalizedNavigate();
  const { save } = useBlueskyIdentity();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    completeBlueskyCallback()
      .then(async ({ did, handle, returnTo }) => {
        await save.mutateAsync({ did, handle });
        navigate(
          returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/hub',
          {
            replace: true,
          },
        );
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Could not connect Bluesky'),
      );
  }, [navigate, save]);

  return (
    <PageContainer size="form">
      {error ? (
        <div role="alert" className="flex flex-col gap-2">
          <h1 className="text-headline font-display">Bluesky was not connected</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      ) : (
        <PageLoadingState count={1} variant="list" />
      )}
    </PageContainer>
  );
}
