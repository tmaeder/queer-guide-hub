import { Copy, ArrowRightLeft, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FeedbackSubmission, SubmissionStoryRef } from './types';

interface Suggestion {
  partnerId: string;
  suggestionId: string;
  similarity: number;
}

interface Props {
  current: FeedbackSubmission;
  suggestions: Suggestion[];
  itemsById: Record<string, FeedbackSubmission>;
  parentStory?: SubmissionStoryRef | null;
  onOpenPartner: (partnerId: string) => void;
  onOpenStory?: (storyId: string) => void;
  onMerge: (args: { duplicateId: string; canonicalId: string; suggestionId: string }) => void;
  onDismiss: (suggestionId: string) => void;
}

export function DuplicateBanner({
  current,
  suggestions,
  itemsById,
  parentStory,
  onOpenPartner,
  onOpenStory,
  onMerge,
  onDismiss,
}: Props) {
  if (suggestions.length === 0 && !parentStory) return null;

  return (
    <div
      className="mb-4 p-3"
      style={{
        borderLeft: '3px solid hsl(var(--foreground) / 0.55)',
        backgroundColor: 'hsl(var(--foreground) / 0.08)',
      }}
    >
      {parentStory && (
        <button
          type="button"
          onClick={() => onOpenStory?.(parentStory.story_id)}
          disabled={!onOpenStory}
          className={`flex items-center gap-1 bg-transparent border-0 p-0 text-left ${suggestions.length > 0 ? 'mb-2' : ''}`}
          style={{
            cursor: onOpenStory ? 'pointer' : 'default',
          }}
        >
          <Layers size={11} />
          <span className="text-xs font-semibold">
            Part of story: {parentStory.title}
            {parentStory.status === 'resolved' && ' (resolved)'}
          </span>
        </button>
      )}

      {suggestions.length > 0 && (
        <span className="text-xs font-bold block mb-1.5">
          <Copy size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
          {suggestions.length === 1
            ? 'Possible duplicate'
            : `${suggestions.length} possible duplicates`}
        </span>
      )}

      <div className="flex flex-col gap-2">
        {suggestions.map((s) => {
          const partner = itemsById[s.partnerId];
          const pct = Math.round(s.similarity * 100);
          return (
            <div key={s.suggestionId} className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenPartner(s.partnerId)}
                  className="cursor-pointer bg-transparent border-0 p-0 text-left w-full"
                  style={{
                    textDecoration: 'underline dotted',
                    textDecorationColor: 'var(--muted-foreground)',
                  }}
                >
                  <p className="text-sm truncate">
                    {partner?.data?.title ?? `#${s.partnerId.slice(0, 8)}`}
                  </p>
                </button>
                <span className="text-xs text-muted-foreground">{pct}% match</span>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onMerge({
                    duplicateId: current.id,
                    canonicalId: s.partnerId,
                    suggestionId: s.suggestionId,
                  })
                }
                style={{ textTransform: 'none', fontSize: '0.7rem' }}
              >
                This is a dup of that
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  onMerge({
                    duplicateId: s.partnerId,
                    canonicalId: current.id,
                    suggestionId: s.suggestionId,
                  })
                }
                style={{ textTransform: 'none', fontSize: '0.7rem', backgroundColor: 'hsl(var(--foreground) / 0.55)' }}
              >
                <ArrowRightLeft size={12} className="mr-1" />
                That's a dup of this
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDismiss(s.suggestionId)}
                style={{ textTransform: 'none', fontSize: '0.7rem' }}
              >
                Not a dup
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
