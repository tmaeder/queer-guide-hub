# Group join request consolidation

The standalone group requests page handles approval and rejection of community-group membership requests. It duplicates a navigation destination for a workflow already linked from the Groups list.

Consolidate it under Groups at `/admin/content/community_groups/requests`, reached through the shared Join requests tab. Remove its separate sidebar entry and redundant Edit groups action. Keep the operational cockpit queue and point it to the nested destination. Redirect the legacy URL so bookmarks continue to work.

The general inbox is an alternative, but its content-review workflows would mix distinct membership decisions into editorial work. Keeping the standalone page would preserve the redundant sidebar entry. The Groups workspace provides the closest operational context.

Preserve moderator access for both the nested destination and legacy redirect while the group list remains available to editors. Retain the existing membership panel and backend approval/rejection behavior.
