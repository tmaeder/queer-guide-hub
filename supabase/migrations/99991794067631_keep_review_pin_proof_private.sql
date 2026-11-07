-- Store detailed linked-location proofs in the restricted admin_review_repairs log.
-- Public city provenance may cite the official boundary and record aggregate counts.
-- Enforce this on new writes without holding an exclusive lock for a table scan.
alter table public.cities
  add constraint cities_no_linked_pin_evidence_in_public_audit
  check (
    not jsonb_path_exists(
      coalesce(field_provenance, '{}'::jsonb),
      'lax $.city_place_audit.** ? (@.type() == "object").keyvalue() ? (
        @.key == "venue_pin_proof" || @.key == "organization_pin_proof" ||
        @.key == "event_pin_proof" || @.key == "venue_boundary_proof" ||
        @.key == "organization_boundary_proof"
      )'::jsonpath
    )
  ) not valid;
