#!/usr/bin/env python3
"""Exercise the actual event normalizer and managed validator together."""
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get('PG_BINDIR', '/opt/homebrew/opt/postgresql@17/bin'))
source = (ROOT/'supabase/migrations/20260810120000_event_taxonomy_write_gate.sql').read_text()
normalizer = re.search(r'CREATE OR REPLACE FUNCTION public.normalize_event_taxonomy\(\)[\s\S]*?\$\$;', source).group()
source = (ROOT/'supabase/migrations/99991792192817_complete_backend_taxonomies.sql').read_text()
validator = re.search(r'create or replace function public.validate_managed_classification\(\)[\s\S]*?\$\$;', source).group()
paths = list((ROOT/'supabase/migrations').glob('*_preserve_managed_event_categories.sql'))
assert len(paths) == 1
patch = paths[0].read_text()
schema = r"""
create role anon;create role authenticated;create role service_role;
create table event_types(slug text primary key,is_active boolean);
insert into event_types values('other',true),('networking',true),('business',true),('cultural',true),('social',true),('theater',true),('old-term',true);
create table events(id integer primary key,event_type text,title text,target_groups text[],accessibility_attributes text[],age_restriction text);
create function normalize_event_target_groups(text[])returns text[]language sql as $$select array['group-normalized']::text[]$$;
create function normalize_event_accessibility(text[])returns text[]language sql as $$select array['access-normalized']::text[]$$;
create function normalize_age_restriction(text)returns text language sql as $$select 'age-normalized'::text$$;
"""
before = r"""
create trigger trg_events_taxonomy before insert or update on events for each row execute function normalize_event_taxonomy();
create trigger validate_managed_event_type before insert or update on events for each row execute function validate_managed_classification('event_type','event_type');
insert into events values(1,'other','Keep title',array['raw'],array['raw'],'raw');
create temp table function_before as select oid,proowner,proacl,proconfig,prosecdef from pg_proc where oid='normalize_event_taxonomy()'::regprocedure;
begin;
update events set event_type='networking'where id=1;
do $$begin if(select event_type from events where id=1)<>'other'then raise exception 'Original silent downgrade not reproduced';end if;end$$;
rollback;
"""
checks = r"""
do $$declare term text;begin
 foreach term in array array['networking','business','cultural','social','theater']loop
  update events set event_type=term where id=1;
  if(select event_type from events where id=1)is distinct from term then raise exception 'Managed term silently changed: %',term;end if;
 end loop;
 insert into event_types values('new-managed-term',true);
 update events set event_type='new-managed-term'where id=1;
 if(select event_type from events where id=1)<>'new-managed-term'then raise exception 'New managed term lost';end if;
 update events set event_type=' NETWORKING 'where id=1;
 if(select event_type from events where id=1)<>'networking'then raise exception 'Case/space normalization failed';end if;
 update events set event_type='old-term'where id=1;
 update event_types set is_active=false where slug='old-term';
 update events set title='Edited title'where id=1;
 if(select event_type from events where id=1)<>'old-term'then raise exception 'Unchanged inactive history overwritten';end if;
 update events set event_type='social'where id=1;
 begin update events set event_type='old-term'where id=1;raise exception 'Inactive assignment allowed';exception when check_violation then null;end;
 foreach term in array array['unregistered input','',null::text]loop
  update events set event_type=term where id=1;
  if(select event_type from events where id=1)<>'other'then raise exception 'Unknown input escaped';end if;
 end loop;
 if not exists(select 1 from events where id=1 and title='Edited title'and target_groups=array['group-normalized']and accessibility_attributes=array['access-normalized']and age_restriction='age-normalized')then raise exception 'Other vocabulary routing changed';end if;
 if exists(select 1 from function_before b join pg_proc p on p.oid=b.oid where row(p.proowner,p.proacl,p.proconfig,p.prosecdef)is distinct from row(b.proowner,b.proacl,b.proconfig,b.prosecdef))then raise exception 'Normalizer security changed';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix='qg-managed-event-types-') as tmp:
    data = str(Path(tmp)/'data')
    subprocess.run([str(PG/'initdb'),'-D',data,'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(PG/'pg_ctl'),'-D',data,'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55492 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
    try:
        result = subprocess.run([str(PG/'psql'),'-X','-h',tmp,'-p','55492','-d','postgres','-v','ON_ERROR_STOP=1'],input=schema+normalizer+validator+before+patch+patch+checks,text=True,capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr)
    finally:
        subprocess.run([str(PG/'pg_ctl'),'-D',data,'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: original downgrade reproduced; active/new terms persist; inactive history preserved; inactive assignments refused; unknown fallback, vocabulary routing, security and idempotence retained')
