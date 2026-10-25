# Email designer production repair

The production audit found unnamed property fields and icon-only mode controls in the pinned React Email inspector, plus a test-send form that offers arbitrary recipients even though its endpoint permits only the signed-in operator mailbox.

Preserve the existing operational layout and editor behavior. Add a scoped accessibility adapter to the inspector: derive names from its visible section/property labels and tooltip text, distinguish color and individual spacing fields, preserve explicit labels, and expose disclosure state. Observe selection-driven panel changes without watching the adapter's own attribute writes. No document content or exported email changes.

Use the authenticated account email directly as the read-only test recipient, explain the server restriction, and describe successful submission as accepted for delivery rather than delivered. Keep all existing preview, variable, draft, and save safeguards. The user authorized diagnosing and fixing production issues autonomously.

Validate real editor labels, dynamic panel naming, recipient behavior, and existing save protections with focused tests. Release through the normal protected PR/deployment flow, then confirm the repaired production UI on desktop and mobile.
