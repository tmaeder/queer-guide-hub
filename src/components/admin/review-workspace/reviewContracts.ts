import type { ReviewItem } from '@/hooks/useAdminReview';
import { getTriageDecisionGuidance } from '@/components/admin/triage/triageDecisionGuidance';

export const reviewKey = (item: Pick<ReviewItem, 'queue_type' | 'id'>) =>
  `${item.queue_type}:${item.id}`;
export const TAG_REVIEW_SOURCES = [
  'tags',
  'sensitive-tags',
  'tag-enrichment',
  'tag-merges',
  'tag-restoration',
  'tag-editorial',
  'quality-tag',
];
export const MERGE_REVIEW_SOURCES = [
  'dedup-review',
  'duplicates',
  'tag-merges',
  'milestone-duplicates',
];
export const SPECIAL_REVIEW_SOURCES = new Set([
  'editorial',
  'org-link-review',
  'sensitive-tags',
  'ai-suggestions',
  'tag-enrichment',
  'tag-merges',
  'venue-category',
  'venue-kind',
  'event-quality',
  'liveness',
  'group-requests',
  'brand-ownership',
  'personality-publication',
  'tag-restoration',
  'tag-editorial',
  'quality-tag',
  'quality-other',
  'milestone-review',
  'milestone-links',
  'milestone-duplicates',
  'business-quality',
  'geography',
  'trip-geography',
  'general-review',
  'cms-issues',
  'feedback',
]);
export interface ReviewContract {
  approve: string;
  reject: string;
  consequence: string;
  rejectConsequence?: string;
  noteRequired?: boolean;
  rejectNeedsNote?: boolean;
  rejectDisabled?: boolean;
  approveDisabled?: boolean;
}
export function reviewContract(item: ReviewItem): ReviewContract {
  switch (item.queue_type) {
    case 'editorial':
      return {
        approve: 'Save & publish draft',
        reject: 'Reject draft',
        consequence:
          'Save the reviewed hook and prose, then publish through the validated editorial workflow. Country drafts still require canonical prose and citations.',
      };
    case 'sensitive-tags':
      return {
        approve: 'Approve & index',
        reject: 'Reviewed, keep hidden',
        consequence:
          'Mark this tag reviewed and allow indexing. Check its wording, classification, and exposure.',
        rejectConsequence: 'Mark reviewed while keeping the tag out of the search index.',
      };
    case 'org-link-review':
      return {
        approve: 'Link business',
        reject: 'Reject link',
        consequence:
          'Attach this entity to the selected business, or create the new business you explicitly choose.',
      };
    case 'tags': {
      if (item.risk_flags?.approve_unsupported)
        return {
          approve: 'Merge tag pair',
          reject: 'Keep separate',
          consequence: `Merge ${String(item.meta.flagged_tag ?? 'the flagged tag')} into ${String(item.meta.match_tag ?? 'the proposed canonical tag')}. Check both identities first; references move to the canonical tag.`,
        };
      const guidance = getTriageDecisionGuidance(item);
      return {
        approve: guidance.approveLabel,
        reject: guidance.rejectLabel,
        consequence: guidance.approve,
      };
    }
    case 'tag-merges':
      return {
        approve: 'Merge tags',
        reject: 'Keep separate',
        consequence:
          'Merge the duplicate into the proposed canonical tag. Check both identities and their usage.',
      };
    case 'venue-category':
      return {
        approve: 'Apply category',
        reject: 'Reject suggestion',
        consequence: 'Apply the category you choose to this venue.',
      };
    case 'venue-kind':
      return {
        approve: 'Confirm non-venue',
        reject: 'Keep as venue',
        consequence:
          'Confirm the engine’s non-venue classification through its existing review workflow.',
      };
    case 'event-quality':
      return {
        approve: 'Mark repaired',
        reject: 'Accept exception',
        consequence:
          'Record that you have repaired this issue. Edit the event first if a correction is needed.',
        rejectConsequence:
          'Accept the remaining issue with an audit note. Critical issues must be repaired.',
        rejectNeedsNote: true,
        rejectDisabled: item.meta.severity === 'critical',
      };
    case 'liveness':
      return {
        approve: 'Archive record',
        reject: 'Keep active',
        consequence:
          'Archive this record based on the closure evidence. Do not treat an event’s past date as closure evidence.',
      };
    case 'group-requests':
      return {
        approve: 'Approve membership',
        reject: 'Reject request',
        consequence: 'Add the applicant as a member of this group.',
      };
    case 'brand-ownership':
      return {
        approve: 'Verify & publish',
        reject: 'Reject claims',
        consequence:
          'Publish the selected ownership claims to brand pages and product badges. Claims need source evidence; sensitive claims require confirmation.',
      };
    case 'personality-publication':
      return {
        approve: 'Publish personality',
        reject: 'Reject publication',
        consequence:
          'Make this personality public through the existing consent and publication gates.',
      };
    case 'tag-restoration':
      return {
        approve: 'Approve restoration',
        reject: 'Retire tag',
        consequence:
          'Restore this tag as the article or utility vocabulary you choose. Article publication still requires reviewed prose, category, and sources.',
      };
    case 'tag-editorial': {
      const issue = String(item.meta.issue_code ?? '');
      return {
        approve: issue.includes('indexable') ? 'Remove from index' : 'Save reviewed content',
        reject: 'Keep as utility',
        consequence:
          'Save a reviewed description, ontology disposition, or translation. Category and source gaps must be corrected in the editor.',
        approveDisabled: ['article_missing_primary_category', 'high_risk_missing_source'].includes(
          issue,
        ),
        rejectNeedsNote: true,
      };
    }
    case 'tag-enrichment':
    case 'ai-suggestions':
      return {
        approve: 'Approve & apply',
        reject: 'Reject suggestion',
        consequence:
          'Apply this proposal through the enrichment service. A failed application stays in the queue for retry.',
      };
    case 'milestone-links':
      return {
        approve: 'Approve link',
        reject: 'Reject link',
        consequence: 'Create the proposed milestone relationship with the selected role.',
      };
    case 'milestone-duplicates':
      return {
        approve: 'Confirm duplicate',
        reject: 'Keep separate',
        consequence:
          'Record a duplicate finding for these milestones. This decision does not merge records.',
      };
    case 'business-quality':
      return {
        approve: 'Recheck repair',
        reject: 'Waive finding',
        consequence:
          'Recheck the quality finding after correcting the record. It stays pending if the problem remains.',
        rejectNeedsNote: true,
      };
    case 'trip-geography':
      return {
        approve: 'Resolve destination',
        reject: '',
        rejectDisabled: true,
        consequence:
          'Set the trip’s city or country to the destination you select. This changes the trip’s location; check the proposed matches first.',
      };
    case 'geography':
      return {
        approve: 'Recheck geography',
        reject: '',
        consequence:
          'Re-run geographic verification after correcting the record. Conflicts remain in the queue until the check passes.',
        rejectDisabled: true,
      };
    case 'feedback':
      return {
        approve: 'Add to planned work',
        reject: 'Close without action',
        consequence:
          'Move reviewed feedback to planned work. This does not send a message or publish a change.',
        rejectNeedsNote: true,
      };
    case 'general-review':
      return {
        approve: 'Resolve finding',
        reject: 'Dismiss finding',
        consequence: item.risk_flags?.requires_confirm
          ? 'Clears this publication review blocker. Save any corrections first; publication or indexing may resume when the remaining checks pass.'
          : 'Record the reviewed outcome. Save any corrections to the record first.',
        noteRequired: true,
      };
    case 'cms-issues':
      return {
        approve: 'Resolve review',
        reject: 'Reject review',
        consequence:
          'Record your review outcome and audit note. Any content corrections must be saved first.',
        noteRequired: true,
      };
    default: {
      const guidance = getTriageDecisionGuidance(item);
      return {
        approve: guidance.approveLabel,
        reject: guidance.rejectLabel,
        consequence: guidance.approve,
        rejectConsequence: guidance.reject,
      };
    }
  }
}

export function hasSpecialReview(item: ReviewItem) {
  return (
    SPECIAL_REVIEW_SOURCES.has(item.queue_type) ||
    (item.queue_type === 'tags' && Boolean(item.risk_flags?.approve_unsupported))
  );
}
