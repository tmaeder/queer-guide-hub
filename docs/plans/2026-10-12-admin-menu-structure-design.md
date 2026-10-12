# Admin Console menu structure

Approved by the user on 12 October 2026 after a source audit.

## Direction

Keep four primary sections: Workspace, Content, Data & automation, System.
Workspace prioritizes Overview, Review inbox, Group requests, Content quality,
Duplicates & merge, Feedback, Staff messages. Content starts with All content,
then Places & events, People & community, Editorial, Commerce, Tags, vocabularies
& media, and ends with Trash. Data tools are grouped into Ingestion, Automation,
and Intelligence & graphs. System starts with Users & roles, then Operations
and Configuration.

Retain stable item and section IDs, existing routes, pin preferences, count keys,
role restrictions, and the incumbent visual design. The Group requests shortcut
uses the current canonical community_groups/requests route. Workspace starts
open; other sections open when they contain the current destination.

## Interaction improvements

Use distinct labels for review queues and internal staff messages. Search page,
section, group, route and familiar aliases in the sidebar and command palette.
Render entries in declaration order, including ungrouped destinations after
content groups. Match active destinations and breadcrumbs by complete path
segments, selecting the most specific destination for nested pages.

## Access and verification

Match Event Quality route access to its moderator-only queue. Keep moved Group
requests moderator-only. Verify navigation and queue access agreement, breadcrumb
specificity, search vocabulary, declared rendering order, and active navigation.
Run focused Vitest suites, lint, TypeScript checking, and the UI detector.
