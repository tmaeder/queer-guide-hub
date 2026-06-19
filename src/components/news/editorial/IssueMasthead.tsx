import { format } from 'date-fns';
import { timeAgo } from '@/lib/relativeTime';

interface IssueMastheadProps {
  totalArticles?: number;
  sourceCount?: number;
  /** Newest article timestamp — drives the "Updated X ago" freshness cue. */
  lastUpdatedAt?: string | null;
}

const EPOCH = new Date('2020-01-06T00:00:00Z').getTime();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function IssueMasthead({ totalArticles, sourceCount, lastUpdatedAt }: IssueMastheadProps) {
  const now = new Date();
  const issueNumber = Math.floor((now.getTime() - EPOCH) / WEEK_MS);
  const updated = lastUpdatedAt ? timeAgo(lastUpdatedAt) : '';

  return (
    <header className="border-b border-border pb-8 mb-8">
      <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">
        {format(now, 'EEEE · MMMM d, yyyy')} · Issue #{issueNumber}
      </p>
      <h1 className="m-0 mt-4 text-display md:text-hero font-bold leading-[0.95] tracking-tight">
        News.
      </h1>
      {(totalArticles !== undefined || sourceCount !== undefined || updated) && (
        <p className="mt-4 text-13 text-muted-foreground uppercase tracking-wider">
          {totalArticles !== undefined && <>{totalArticles} stories</>}
          {totalArticles !== undefined && sourceCount !== undefined && <> · </>}
          {sourceCount !== undefined && <>{sourceCount} sources worldwide</>}
          {updated && (
            <>
              {(totalArticles !== undefined || sourceCount !== undefined) && <> · </>}
              Updated {updated}
            </>
          )}
        </p>
      )}
    </header>
  );
}
