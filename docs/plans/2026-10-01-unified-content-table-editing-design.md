# Unified Content Table Editing

## Goal

Give every admin content table one predictable editing model, regardless of content type or whether the editor starts from **All Content** or a type-specific list.

## Interaction model

- Rows are passive containers. Clicking arbitrary row space does not navigate or edit.
- Writable cells open their inline editor with one click.
- The Title cell resolves the content type's configured `titleField` and is inline-editable when that field is writable.
- The Status cell resolves the actual backing status field (`workflow_state`, `status`, `visibility`, or `verification_status`) and is inline-editable when that field is registered and writable.
- Configured property columns use the same inline-editing behavior.
- Read-only, virtual, unsupported, or unregistered values render as ordinary text without a false editing affordance.
- The explicit Edit action is the single path to the complete editor.

## Affordance and accessibility

- Editable cells use a quiet hover/focus treatment and reveal a small pencil icon; persistent dashed outlines are removed.
- Editable wrappers are keyboard focusable and expose button semantics.
- Enter or Space opens the editor. Escape and save/cancel behavior remain owned by each field editor.
- The cell tooltip and accessible label name the field being edited.
- Touch targets remain large enough for mobile use.

## Scope and safeguards

- The same table component supplies the behavior for all registered content types.
- Existing field editors, save validation, permissions, version history, and refresh behavior are reused.
- Computed/joined fields remain non-editable.
- Lifecycle actions, public preview, selection, sorting, pagination, and the full editor remain available.
- No database schema or content-type-specific save path is introduced.

## Verification

- Component tests cover passive rows, title editing, status editing, property editing, and read-only fallbacks.
- Browser verification covers All Content plus representative types with writable and read-only default columns.
- The mechanical design detector runs once over the changed UI files.
