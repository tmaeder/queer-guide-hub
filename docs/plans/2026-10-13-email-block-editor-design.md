# Email block editor

Approved by the user on 2026-10-13 after the deployed email designer review.

Use React Email Editor to add WYSIWYG blocks for headings, text, images, buttons, dividers and columns, inline formatting, contextual properties, undo/redo and block ordering. Inherit the existing operational admin identity.

Keep legacy template HTML intact until explicit conversion. Show the converted draft before saving. Export email HTML and plain text into the existing template delivery contract. Protect variable tokens and validate required placeholders. Provide desktop/mobile draft previews, visible unsaved state, discard protection and reachable save/test actions. Tests send the saved version and clearly explain when a draft must first be saved.

Use a compact template registry and a larger composition workspace. On narrow screens, allow template selection and wrap controls; do not clip actions. Preview sample values must not be persisted as template content. Keep existing sender/branding ownership in Design & branding.

Verify conversion, token handling, save failures, unsaved-switch protection, preview, block insert/reorder and responsive operation. No production templates are changed during implementation or verification.

Implementation stores versioned block JSON in an inert comment alongside the rendered HTML in the existing `html_content` column. The shared sender strips that comment before delivery. No schema or provider change is needed. React Email's generated document is exported as a body fragment because the existing sender owns the brand wrapper. HTML-to-text heading capitalization must preserve case-sensitive template tokens.

The content tab stays mounted to preserve pending exports and undo history. Saving disables the entire editor, including property inputs. Browser recovery is cleared when changes are reverted. Block arrangement replaces container content in a separate history event so undo retains the library's container structure.

Verification uses local demonstration templates with simulated saves/sends, fifteen targeted tests, lint, the existing typecheck ratchet, production build and bundle-shape checks. Floating UI lives in a shared chunk to prevent Radix popovers from eagerly loading Tiptap. The editor itself remains a large lazy admin-only chunk; email-client screenshots and real delivery are outside local verification.
