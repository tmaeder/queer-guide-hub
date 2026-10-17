# Complete backend taxonomy management

Approved by the user on 2026-10-16: extend the existing CMS to manage every application content taxonomy, including classifications currently defined in code. Reuse the CMS editor and list rather than create a configurable taxonomy engine.

The Taxonomies area provides access to tags, categories, amenities, services, accessibility attributes, target groups, professions and the intimate-profile taxonomy. Lists support creation, editing, ordering and deactivation. Hierarchical vocabularies expose parent selection. Used terms keep stable identifiers and cannot be deleted or renamed in a way that breaks references. Existing selections remain visible when a term is inactive; new selections use active terms.

Content forms and filters must consume the managed vocabularies. Move code-defined content classifications into seeded database vocabularies and replace restrictive enumerated checks with vocabulary validation where appropriate. Operational enums (workflow states, permissions, protocol values and safety enforcement) remain application contracts rather than editorial taxonomies.

Preserve moderator access floors, enforce permissions in database policies, retain existing public URLs and data, and verify both CRUD and downstream selection behavior. Inventory consumers and record any remaining gaps before claiming completion.

Alternatives: exposing only existing taxonomy tables leaves hardcoded classifications unmanaged; a general configurable taxonomy engine introduces unnecessary scope.
