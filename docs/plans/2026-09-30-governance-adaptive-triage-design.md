# Governance adaptive triage workspace

## Goal

Make `/admin/governance?mode=triage` the fastest, clearest, and safest place to process human review work without changing queue semantics, decision gates, or keyboard shortcuts.

## Observed problems

- The page header, automation summary, review toolbar, filters, and queue all compete at nearly the same visual weight.
- The automation summary explains important system state but occupies a large card and reads like passive reporting rather than workflow context.
- Queue filters are a long row of small chips. The active scope and the relationship between quick scopes and queue types are difficult to scan.
- The desktop list consumes only 40% of the available area while an unselected detail pane is mostly blank.
- Rows depend on tiny badges and muted text; selected, hovered, overdue, safety-sensitive, and public-impact states need stronger separation.
- Search, sorting, bulk approval, and focus mode are split across separate horizontal bands.
- The empty detail state does not help an operator begin work or understand the keyboard workflow.

## Approved direction

Use an adaptive, workflow-first master/detail workspace.

### 1. Information hierarchy

- Keep one page title and concise explanatory copy.
- Convert automation state into a compact two-part status strip: work handled automatically and work awaiting people.
- Present the review count, active scope, search, sort, high-confidence approval, and focus mode as one coherent workspace toolbar.
- Retain all existing safety copy and irreversible-action confirmations.

### 2. Queue navigation

- Separate intent-based quick scopes (Safety, Overdue, Public impact) from queue categories.
- Give each active filter a clear selected state with text, border, and background changes that work in both themes.
- Preserve multi-queue selection and current URL-driven initial queue behavior.
- Keep controls keyboard accessible with visible focus treatment and useful accessible names.

### 3. Master/detail behavior

- Use a stable desktop grid rather than a percentage split: a readable queue column and a flexible detail column.
- Make the queue header and pagination persistent while rows scroll independently.
- On initial load, use the detail pane as a composed onboarding state with a primary "review first item" action and compact shortcut guidance.
- Preserve the existing mobile sheet and focus mode behaviors.

### 4. Queue rows

- Strengthen the item title, selected state, hover state, and focus-visible state.
- Group identity metadata separately from urgency and confidence signals.
- Keep safety, overdue, and public-impact flags explicit and textual; never rely on color alone.
- Maintain the existing checkbox overlay-button interaction contract and keyboard navigation.

### 5. States and responsive behavior

- Use a structured skeleton/loading presence where layout would otherwise collapse.
- Give empty queues a positive, explanatory state rather than a bare sentence.
- Keep error messages explicit and avoid displaying missing data as a clean zero.
- At narrow widths, allow toolbar groups to wrap without squeezing search or truncating actions.

## Non-goals

- No queue, permission, RPC, merge, approval, or automation behavior changes.
- No framework, icon library, or design-token migration.
- No changes to the Governance mode wrapper beyond compatibility with its existing Triage mount.

## Verification

- Focused component tests cover the initial detail action, filter pressed states, row selection semantics, empty state, and responsive-safe structure.
- Typecheck and lint run against every changed source file.
- A local browser pass checks desktop and mobile widths, light and dark themes where available, keyboard focus, scrolling, empty/selected detail states, and action visibility.

