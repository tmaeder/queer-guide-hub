-- Keep legacy profile preference terms editable without relaxing privacy enums.
begin;
do $$
declare field_name text; definition text; current_value text;
begin
  foreach field_name in array array['bdsm_role','communication_about_sex','disability_status','family_acceptance_level','financial_situation','housing_situation','immigration_status','jealousy_comfort_level','kink_experience_level','mental_health_openness','neurodivergent_status','physical_affection_preference','romance_style','sexual_exploration_openness','sexual_frequency_preference','sexual_health_status','workplace_safety'] loop
    select pg_get_constraintdef(oid) into definition from pg_constraint
      where conrelid='public.profiles'::regclass and conname='profiles_'||field_name||'_check';
    if definition is null then continue; end if;
    for current_value in select (regexp_matches(definition,$rx$'([^']*)'::text$rx$,'g'))[1] loop
      insert into public.taxonomy_terms(taxonomy,value,name) values
        ('profile_'||field_name,current_value,initcap(replace(current_value,'_',' '))) on conflict do nothing;
    end loop;
    execute format('alter table public.profiles drop constraint %I','profiles_'||field_name||'_check');
    execute format('create trigger %I before insert or update of %I on public.profiles for each row execute function public.validate_managed_classification(%L,%L)',
      'validate_managed_profile_'||field_name,field_name,field_name,'profile_'||field_name);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
