-- Cover listing cascades and reverse lookups; the primary key begins with
-- run_id, so it cannot efficiently serve listing_id-only foreign-key work.
create index if not exists marketplace_governance_resolutions_listing_idx
  on public.marketplace_governance_resolutions(listing_id);
