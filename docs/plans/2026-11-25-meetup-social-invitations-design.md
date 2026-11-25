# Meetups: playful composition using existing site patterns

Approved by the user on 2026-11-25: a warmer, more playful social invitation experience. The revised composition was explicitly approved for implementation, with the binding refinement “dont use new design patterns”.

Use the Going Out page as the composition reference. Pair the existing PageIntro component with the practical activity/city/date form on desktop, and stack them on mobile. Keep the surrounding Meet navigation and other Meet pages unchanged.

- Reuse the existing Button component, small size (44px target), for all activity choices. The established accent variant marks the selected activity; outline and ghost variants handle the remaining choices and reset. Keep the existing icons and translated labels. No custom activity tiles, icon discs, control styling or motion.
- Group city, dates and search on the existing white paper surface, using the existing accent action. Preserve explicit trip/event context, date editing, validation and authentication continuity. Selection is a filter and never publishes an invitation.
- Use the existing display and title scales for a stronger hierarchy. Preserve the shared Card, Badge and Avatar invitation treatment and its real host information. Never manufacture hosts, invitations, attendance or imagery.
- Keep invitations above public event/group alternatives and retain their honest loading, signed-out, empty and error states. Preserve consent, destination safety, moderation, lifecycle and Messages flows.
- No new palette, fonts, assets, stylesheet, routes, data model or permissions.

Validate activity selection through search/composition and consent using the existing regression suite. Inspect desktop and mobile, including no-city, selected-city and expanded-date states; preserve one h1 and prevent horizontal document overflow.
