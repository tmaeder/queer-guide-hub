# Admin inline select Escape behaviour

## Context

Production verification of the unified admin content table found that inline
select editors exposed a `Cancel (Esc)` action, but Escape only closed the
Radix select menu and left the cell in edit mode.

## Design

Handle Escape at both boundaries owned by `SelectEditor`:

- `SelectContent.onEscapeKeyDown` cancels while the portalled menu is open.
- `SelectTrigger.onKeyDown` cancels after a choice has closed the menu.

Both paths prevent the select primitive from consuming the key and preserve
the existing rule that an in-flight save cannot be cancelled. Option selection,
Save, and the explicit Cancel button remain unchanged.

## Verification

Component tests cover Escape with the menu open and with the trigger closed.
The production E2E repeats the Event Type and Status checks after deployment
and confirms that neither path writes data.
