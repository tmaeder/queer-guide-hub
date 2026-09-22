# Open PR remediation design

## Goal

Review every open pull request in `tmaeder/queer-guide-hub`, repair failures that belong to the pull request, and merge each safe, non-redundant change into `main` without disturbing existing local work.

## Strategy

1. Work only from an isolated Git worktree based on the current remote `main`.
2. Resolve migration drift first because missing migration files make unrelated pull requests fail shared CI gates.
3. Compare overlapping migration-recovery pull requests by file name, content, provenance, and CI evidence. Merge the newest complete valid recovery and close only pull requests whose entire diff is already present or superseded.
4. Process dependency pull requests from the narrowest package scopes to the root dependency group. Rebase each branch on the moving `main`, inspect package and lockfile changes, run package-specific tests, then run the repository gates relevant to the changed files.
5. Push fixes to the original pull-request branch where permissions allow. Merge only after the branch is current, required checks pass, and the final diff contains no unrelated changes.
6. Preserve a failed pull request when a substantive defect cannot be safely repaired; report the blocker instead of bypassing protections.

## Verification

For each pull request, inspect the final diff and run the smallest package-specific test set that exercises the update. Before the final merge sequence, run the repository build, typecheck, lint, tests, migration-version check, and applicable security/data-quality gates. Confirm the remote pull-request state after every merge because each merge changes the base of the remaining branches.

## Merge semantics

Use the repository's allowed merge method. A zero-diff or fully superseded pull request is closed with an explanation rather than manufacturing an empty merge commit. This is treated as the safe completion of that pull request's intended change.
