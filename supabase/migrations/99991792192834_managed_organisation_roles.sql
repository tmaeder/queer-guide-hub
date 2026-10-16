begin;
insert into public.taxonomy_terms(taxonomy,value,name,sort_order) values
('organization_role','venue','Venue',0),
('organization_role','hotel','Hotel',1),
('organization_role','seller','Merchant',2),
('organization_role','affiliate_partner','Partner',3),
('organization_role','brand','Brand',4),
('organization_role','publisher','Publisher',5),
('organization_role','support','Support',6),
('organization_role','advocacy','Advocacy',7),
('organization_role','organizer','Organizer',8),
('organization_role','community','Community',9);

insert into public.taxonomy_terms(taxonomy,value,name,is_active)
select 'organization_role',role,initcap(replace(role,'_',' ')),false
from public.organizations cross join lateral unnest(roles) role where btrim(role)<>'' group by role on conflict do nothing;
alter table public.organizations drop constraint if exists organizations_roles_known;
create function public.validate_managed_organisation_roles() returns trigger
language plpgsql set search_path='' as $$
declare previous_roles text[] := '{}'; current_role_value text;
begin
  if TG_OP='UPDATE' then previous_roles:=coalesce(old.roles,'{}'); end if;
  foreach current_role_value in array coalesce(new.roles,'{}') loop
    if current_role_value=any(previous_roles) then continue; end if;
    if not exists(select 1 from public.taxonomy_terms where taxonomy='organization_role' and value=current_role_value and is_active) then
      raise exception 'Choose an active organisation role.' using errcode='23514';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.validate_managed_organisation_roles() from public;
create trigger validate_managed_organisation_roles before insert or update of roles on public.organizations for each row execute function public.validate_managed_organisation_roles();
notify pgrst,'reload schema';
commit;
