# Governance approval consequences

## Problem

The review workspace exposes generic Approve, Reject, Skip, and Flag actions even though those actions have materially different effects by queue. A reviewer can currently act without knowing whether the click publishes content immediately, queues work for a downstream pipeline, applies a merge, changes only a review status, or leaves the live record untouched.

## Approved direction

Keep routine decisions fast and one-click. Do not add a confirmation dialog to every approval. Instead, place an always-visible, queue-specific “What happens next” summary directly above the actions.

## Decision summary

For the selected item, the summary states:

- what approving changes;
- whether the change is immediate or handed to a downstream process;
- whether a live/public record changes;
- what rejecting changes and what it leaves untouched;
- that skipping leaves the item pending and advances to the next item;
- that flagging keeps the item unresolved and marks it for follow-up.

Where the reviewer has saved inline corrections, the approval description names the number of corrected fields included in the decision. Unsaved corrections block approval and tell the reviewer to save or discard them first.

## Contextual controls

Use specific labels where the outcome is materially clearer than “Approve,” such as “Approve & queue,” “Approve merge,” “Publish,” or “Apply changes.” Reject remains available when it is the safe path. Keyboard shortcuts continue to trigger the same actions and do not bypass any existing safety or unsaved-change gate.

## Safety

- Preserve the explicit namesake and outing-safety confirmations.
- Preserve the bulk namesake exclusion.
- Preserve the existing high-confidence bulk confirmation, but clarify both the continue and cancel outcomes.
- Do not claim that content publishes immediately when the database action only changes review state or queues downstream work.
- Derive messaging from the same queue type used for dispatch so the explanation and mutation cannot silently disagree.

## Verification

- Unit tests for the consequence text and contextual action labels for every supported queue family.
- Tests that unsaved corrections disable approval while reject, skip, and flag remain available.
- Tests that saved correction counts appear in the approval consequence.
- Existing action dispatch, safety-confirmation, keyboard, and bulk-review suites remain green.
