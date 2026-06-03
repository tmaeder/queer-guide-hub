/**
 * DuplicateWarning — non-blocking "this may already exist" card for submission forms.
 * Lists close matches from `useDuplicateCheck` with links to the existing entries.
 * Purely advisory: it never prevents submission.
 */

import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { hrefForEntity } from '@/lib/searchRoutes';
import { duplicateEntityType, type DuplicateMatch } from '@/hooks/submission/useDuplicateCheck';

interface DuplicateWarningProps {
  submissionTypeId: string;
  typeLabel: string;
  matches: DuplicateMatch[];
}

export function DuplicateWarning({ submissionTypeId, typeLabel, matches }: DuplicateWarningProps) {
  if (matches.length === 0) return null;
  const entityType = duplicateEntityType(submissionTypeId);

  return (
    <Card role="status" aria-live="polite" className="mb-6">
      <CardContent>
        <div className="flex items-start gap-2 mb-2">
          <AlertCircle size={18} className="shrink-0 mt-0.5 text-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Already in Queer Guide?</p>
            <p className="text-xs text-muted-foreground">
              We found {matches.length === 1 ? 'a' : 'some'} similar {typeLabel.toLowerCase()}
              {matches.length === 1 ? '' : 's'}. If yours is already listed, open it instead of
              submitting a duplicate. Otherwise, carry on.
            </p>
          </div>
        </div>
        <ul className="m-0 mt-2 flex flex-col gap-2 pl-0 list-none">
          {matches.map((m) => {
            const href = hrefForEntity({ type: entityType ?? '', slug: m.slug, title: m.title });
            const place = [m.city, m.country].filter(Boolean).join(', ');
            return (
              <li key={m.id}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <ExternalLink size={14} className="shrink-0" aria-hidden="true" />
                  <span className="font-medium">{m.title}</span>
                  {place && <span className="text-xs text-muted-foreground">· {place}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
