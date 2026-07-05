import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useUserSubmissions } from '@/hooks/useUserSubmissions';

/** The signed-in user's community submissions with review status. Own profile only. */
export function UserSubmissionsList() {
  const { user } = useAuth();
  const { data: submissions = [], isLoading } = useUserSubmissions(user?.id, true);

  if (isLoading) {
    return <div className="h-20 rounded-container border border-border bg-card animate-pulse" />;
  }
  if (submissions.length === 0) {
    return <p className="text-sm text-muted-foreground">No submissions yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {submissions.map((s) => (
        <li
          key={s.id}
          className="flex flex-col gap-1 rounded-element border border-border bg-card px-4 py-2"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{s.name ?? s.content_type}</p>
              <p className="text-2xs uppercase tracking-wider text-muted-foreground">
                {s.content_type} · {new Date(s.submitted_at).toLocaleDateString()}
              </p>
            </div>
            <Badge variant={s.promoted ? 'default' : 'outline'} className="rounded-badge shrink-0">
              {s.promoted ? 'published' : s.status}
            </Badge>
          </div>
          {!s.promoted && s.reviewer_notes && ['rejected', 'duplicate', 'needs_info'].includes(s.status) && (
            <p className="text-sm text-muted-foreground">{s.reviewer_notes}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
