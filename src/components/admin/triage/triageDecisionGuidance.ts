import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';

export interface TriageDecisionGuidance {
  approveLabel: string;
  rejectLabel: string;
  approve: string;
  reject: string;
  defer: string;
  unsavedWarning?: string;
}

interface DecisionContext {
  changedFields?: string[];
  proposedFieldCount?: number;
  unsavedCount?: number;
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function contentName(item: TriageItem) {
  return humanize(item.content_type.replace(/s$/, '')).toLowerCase();
}

function changeSummary(item: TriageItem, context: DecisionContext) {
  if (context.changedFields?.length) {
    const fields = context.changedFields.map(humanize).join(', ');
    return ` Includes your saved corrections to ${fields}.`;
  }
  if (typeof item.meta?.field === 'string') {
    return ` Applies the proposed ${humanize(item.meta.field).toLowerCase()} shown above.`;
  }
  if ((context.proposedFieldCount ?? 0) > 0) {
    const count = context.proposedFieldCount ?? 0;
    return ` Applies the ${count} proposed field change${count === 1 ? '' : 's'} listed above.`;
  }
  return ' Uses the proposed values shown above.';
}

export function getTriageDecisionGuidance(
  item: TriageItem,
  context: DecisionContext = {},
): TriageDecisionGuidance {
  const changes = changeSummary(item, context);
  const unsavedWarning = context.unsavedCount
    ? `${context.unsavedCount} unsaved correction${context.unsavedCount === 1 ? '' : 's'} will not be included. Save or undo them before approving.`
    : undefined;
  const common = {
    rejectLabel: 'Reject',
    defer:
      'Skip leaves this item pending and opens the next item. No content or review status changes.',
    unsavedWarning,
  };

  switch (item.queue_type) {
    case 'staging':
      return {
        ...common,
        approveLabel: 'Approve & queue',
        approve: `Marks this staging ${contentName(item)} approved and hands it to the commit pipeline. Nothing becomes public until that pipeline succeeds.${changes}`,
        reject:
          'Marks this source record rejected. It will not enter the commit pipeline, and no live content is changed.',
      };
    case 'moderation':
      return {
        ...common,
        approveLabel: 'Resolve report',
        rejectLabel: 'Reject report',
        approve:
          'Marks the report resolved. This action does not edit or remove the reported content.',
        reject: 'Marks the report rejected. The reported content remains unchanged.',
      };
    case 'submissions':
      return {
        ...common,
        approveLabel: 'Approve submission',
        approve: `Marks the community submission approved. It does not publish a live record by itself.${changes}`,
        reject: 'Marks the submission rejected. No live content is created or changed.',
      };
    case 'automation':
      return {
        ...common,
        approveLabel: 'Approve flag',
        approve:
          'Marks the automation flag approved. The referenced content is not edited by this action.',
        reject: 'Marks the automation flag rejected. The referenced content remains unchanged.',
      };
    case 'tags':
      return {
        ...common,
        approveLabel: 'Apply tags',
        approve: `Accepts and applies the suggested tags to the target content.${changes}`,
        reject: 'Marks the tag suggestions rejected. Existing tags remain unchanged.',
      };
    case 'duplicates':
      return {
        ...common,
        approveLabel: 'Record merge decision',
        approve:
          'Records this pair as a merge decision for the scraper deduplication workflow. This click does not directly rewrite the live records.',
        reject: 'Records the pair as not duplicates. Both records remain separate.',
      };
    case 'news-quality':
      return {
        ...common,
        approveLabel: 'Pass quality review',
        approve:
          'Sets the article quality status to passed. Its existing publication state and content remain unchanged.',
        reject: 'Sets the article quality status to rejected. This does not delete the article.',
      };
    case 'entity-links':
      return {
        ...common,
        approveLabel: 'Approve link',
        approve: `Approves the proposed entity relationship for the link applier.${changes}`,
        reject: 'Rejects the proposed relationship. Existing entity links remain unchanged.',
      };
    case 'content':
      return {
        ...common,
        approveLabel: 'Publish',
        approve: `Publishes this reviewed CMS content immediately and records you as the publisher.${changes}`,
        reject:
          'Returns the content to draft and keeps it unpublished. Any review note is saved for the editor.',
      };
    case 'editorial':
      return {
        ...common,
        approveLabel: 'Approve draft',
        approve: `Accepts the editorial draft through its configured approval workflow.${changes}`,
        reject: 'Rejects the draft and keeps the current live content unchanged.',
      };
    case 'dedup-review':
      return {
        ...common,
        approveLabel: 'Approve merge',
        approve:
          'Merges the duplicate pair using the canonical record selected above. References move to that record; this cannot be fully undone.',
        reject: 'Marks the pair as distinct. Both records and their relationships remain separate.',
      };
    default:
      if (item.queue_type.startsWith('quality-')) {
        return {
          ...common,
          approveLabel: 'Apply changes',
          approve: `Applies the reviewed proposal to the live ${contentName(item)}.${changes}`,
          reject: 'Rejects the proposal. The current live record remains unchanged.',
        };
      }
      return {
        ...common,
        approveLabel: 'Approve',
        approve: `Marks this review item approved through its queue workflow.${changes}`,
        reject:
          'Marks this review item rejected. Existing live content remains unchanged unless the queue states otherwise above.',
      };
  }
}
