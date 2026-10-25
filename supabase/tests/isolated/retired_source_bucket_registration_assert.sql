
do $test$
begin
 assert exists(select 1 from event_quality_issues where id=(select i from fixture_bucket where n=26)and status='accepted');
 assert not exists(select 1 from event_quality_issues issue join fixture_bucket pick on pick.i=issue.id where pick.n>=27 and issue.status<>'open');
 assert(select count(*)from event_image_quality_observations observation join fixture_bucket pick on pick.e=observation.event_id where pick.n>=26)=1;
end $test$;
