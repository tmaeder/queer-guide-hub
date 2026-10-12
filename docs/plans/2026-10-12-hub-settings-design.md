# Hub settings integration

Approved by the user on October 12, 2026.

- Make `/hub/settings` the canonical signed-in settings workspace, with Settings in the shared desktop and mobile navigation.
- Reuse the current profile, avatar, status, identity and dating, privacy, travel, account, preferences, and documents editors. Preserve existing autosave, error recovery, and account controls.
- Use the incumbent hub header and content geometry. Keep save feedback within the settings workspace so it does not cover global mobile navigation.
- Redirect `/settings`, `/settings/privacy`, `/profile/settings`, and `/me/settings` to the new workspace, preserving supported language prefixes, query parameters, and anchors. Privacy aliases open the privacy section.
- Update current product links to the canonical destination. Preserve the public community feed and authentication boundaries.
- Validate registry/navigation, authenticated and signed-out module rendering, actual route redirects, settings behavior, types, and desktop/mobile layout.

The hub overview remains the action stream; settings are a dedicated section rather than editors embedded in that stream. No database or settings persistence changes are required.

Release adaptation: production now uses grouped HubNav navigation across community, connection, and personal modules. Preserve that shared navigation and add Settings to Personal; do not restore the older local sidebar or remove existing hub destinations.
