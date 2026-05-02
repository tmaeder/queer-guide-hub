import { Button } from '@/components/ui/button';
import { StoriesKanban } from '@/components/admin/feedback/StoriesKanban';
import { StorySuggestionsPanel } from '@/components/admin/feedback/StorySuggestionsPanel';
import { ArchivedStoriesPanel } from '@/components/admin/feedback/ArchivedStoriesPanel';
import type {
  AdminProfile,
  StoryStatus,
  StorySuggestion,
  StoryWithCounts,
} from '@/components/admin/feedback/types';
import type { useFeedbackUrlState } from '@/hooks/useFeedbackUrlState';

type UrlState = ReturnType<typeof useFeedbackUrlState>;

interface StoriesTabProps {
  state: UrlState['state'];
  update: UrlState['update'];
  storySuggestions: StorySuggestion[];
  groupedStories: Record<StoryStatus, StoryWithCounts[]>;
  adminMap: Record<string, AdminProfile>;
  onAcceptSuggestion: (id: string, overrideTitle?: string) => void;
  onDismissSuggestion: (id: string) => void;
}

export function StoriesTab({
  state,
  update,
  storySuggestions,
  groupedStories,
  adminMap,
  onAcceptSuggestion,
  onDismissSuggestion,
}: StoriesTabProps) {
  const activeCount =
    groupedStories.open.length +
    groupedStories.planned.length +
    groupedStories.in_progress.length +
    groupedStories.resolved.length;

  return (
    <>
      <StorySuggestionsPanel
        suggestions={storySuggestions}
        onAccept={onAcceptSuggestion}
        onDismiss={onDismissSuggestion}
      />
      <div className="flex gap-2 mb-2">
        <Button
          size="sm"
          variant={state.archived ? 'outline' : 'default'}
          onClick={() => update({ archived: false })}
          data-testid="stories-active-toggle"
        >
          Active ({activeCount})
        </Button>
        <Button
          size="sm"
          variant={state.archived ? 'default' : 'outline'}
          onClick={() => update({ archived: true })}
          data-testid="stories-archived-toggle"
        >
          Archived ({groupedStories.archived.length})
        </Button>
      </div>
      {state.archived ? (
        <ArchivedStoriesPanel
          archived={groupedStories.archived}
          adminById={adminMap}
          onOpen={(storyId) => update({ story: storyId })}
        />
      ) : (
        <StoriesKanban
          grouped={groupedStories}
          adminById={adminMap}
          onStoryClick={(s) => update({ story: s.id })}
        />
      )}
    </>
  );
}
