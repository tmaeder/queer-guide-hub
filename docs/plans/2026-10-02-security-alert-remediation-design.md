# Security alert remediation design

## Scope

Resolve the six open Dependabot alerts for vulnerable transitive `brace-expansion`
1.x and 2.x releases, plus the four open code-scanning warnings produced by
`react-refresh/only-export-components` in
`src/components/admin/triage/GovernanceFieldControls.tsx`.

## Dependency remediation

Keep the existing targeted npm override strategy and raise only the affected
version families:

- `brace-expansion@<1.1.21` to `^1.1.21`
- `brace-expansion@>=2.0.0 <2.1.7` to `^2.1.7`

Regenerate `package-lock.json` with npm and verify that every installed 1.x and
2.x copy is at or above the first patched version. This avoids broad parent
dependency upgrades while preserving the direct 5.x dependency.

## Code-scanning remediation

Make `GovernanceFieldControls.tsx` a component-only export module. Move the
non-component exports (`fieldControlKind`, `coordinatesFromLocation`,
`withLocationCoordinates`, and `GOVERNANCE_SELECT_OPTIONS`) into a sibling
utility module, then update component, consumer, and test imports. Preserve all
runtime behavior and existing public names.

## Verification

- Run the focused structured-data tests.
- Run ESLint on the affected modules and confirm the Fast Refresh rule is clean.
- Run the repository type check.
- Run `npm audit` and inspect the lockfile's installed `brace-expansion` versions.
- Review the final diff to ensure it contains only the design and remediation.

## Delivery

Implement on `fix/security-alerts-2026-10-02`, based on the current
`origin/main`, and commit the remediation independently from unrelated working
tree changes.
