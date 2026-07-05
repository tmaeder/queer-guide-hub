import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Newspaper, Globe, BookOpen } from 'lucide-react';
import { useUserNewsReadsList } from '@/hooks/useUserNewsReadsList';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';

interface ReadingHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function groupByDate(reads: Array<{ read_at: string; [key: string]: unknown }>) {
  const groups: Record<string, typeof reads> = {};
  for (const r of reads) {
    const day = r.read_at.slice(0, 10);
    if (!groups[day]) groups[day] = [];
    groups[day].push(r);
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

export function ReadingHistoryPanel({ open, onOpenChange }: ReadingHistoryPanelProps) {
  const { user } = useAuth();
  const { reads, totalReads, countriesCovered, loading } = useUserNewsReadsList({ limit: 50 });

  if (!user) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent style={{ maxWidth: 480 }}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <BookOpen size={18} /> Reading History
            </SheetTitle>
          </SheetHeader>
          <div className="mt-8 text-center text-muted-foreground text-sm">
            Sign in to see your reading history.
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const groups = groupByDate(reads as Array<{ read_at: string; [key: string]: unknown }>);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent style={{ maxWidth: 480 }} className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen size={18} /> Reading History
          </SheetTitle>
        </SheetHeader>

        {totalReads > 0 && (
          <div className="flex gap-4 mt-4 mb-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Newspaper size={14} /> {totalReads} articles read
            </span>
            <span className="flex items-center gap-1">
              <Globe size={14} /> {countriesCovered} countries covered
            </span>
          </div>
        )}

        {loading && (
          <p className="text-sm text-muted-foreground mt-8 text-center">Loading…</p>
        )}

        {!loading && reads.length === 0 && (
          <p className="text-sm text-muted-foreground mt-8 text-center">No reading history yet.</p>
        )}

        <div className="flex flex-col gap-6 mt-2">
          {groups.map(([day, dayReads]) => (
            <div key={day}>
              <p className="text-xs text-muted-foreground font-medium mb-2">
                {new Date(day).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
              <div className="flex flex-col gap-2">
                {dayReads.map((r) => {
                  const a = r as {
                    read_at: string;
                    id: string;
                    slug?: string;
                    title?: string;
                    publisher_name?: string;
                    category?: string;
                  };
                  return (
                    <LocalizedLink
                      key={a.read_at + String(a.id)}
                      to={`/news/${a.slug || a.id}`}
                      onClick={() => onOpenChange(false)}
                      className="flex items-start gap-2 p-2 rounded-element hover:bg-muted transition-colors"
                    >
                      <Newspaper size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug truncate">{a.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {a.publisher_name && (
                            <span className="text-xs text-muted-foreground truncate">
                              {a.publisher_name}
                            </span>
                          )}
                          {a.category && (
                            <Badge variant="outline" style={{ fontSize: '0.65rem', padding: '0 4px' }}>
                              {a.category}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </LocalizedLink>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
