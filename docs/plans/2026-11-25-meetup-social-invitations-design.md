# Meetups: playful social invitations in the shared system

Approved by the user on 2026-11-25: “Colourful social invitations — warm, playful and easy to use”, with the explicit refinement “stay with design patterns other pages have”.

Keep the consolidated Meet structure and the existing invitation, consent, authentication, safety and Messages flows. Limit this amplification to Meetups; People, Groups and Dating retain their existing frames.

- Reuse the compact Meet header and normal paper-and-ink page. Introduce no separate hero treatment, typography scale, palette or custom stylesheet.
- Replace the activity dropdown with the same ToggleChip control already used on Groups. Give each choice an existing activity icon, visible translated label and pressed state. Wrap on phones so every activity remains discoverable.
- Present actual invitations through shared Card, Badge and Avatar primitives: activity, title, date/place, real host and the joining action. Use the existing pink ink badge as the accent. Never manufacture hosts, invitations, attendance or imagery to fill a quiet community.
- Show the existing public group alternatives through NestedEntityCard, matching other cross-type discovery links around the site. Keep the worldwide scope clear and do not repeat them when invitation results are populated.
- Preserve initial, loading, empty, signed-out and error states, locale expansion, focus feedback and document overflow boundaries. Motion and shapes come from existing shared components.

No new social data model, routes, permissions or consent flows. Validate direct activity selection and application, invitation consent and authentication continuity, and desktop/mobile composition. The latest user refinement governs over the earlier broad visual exploration.
