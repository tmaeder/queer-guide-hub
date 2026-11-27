-- Operational vocabulary update after visually reviewing the exact stored bytes.
insert into public.logo_denied_marks(sha256,label,note) values ('89f081200f5606760811d2b59b91e1eac261023e9d7f8f954c9a41f12b0491d8','Wikipedia','Visually confirmed Wikipedia globe used as the logo of unrelated Pride events.') on conflict do nothing;
update public.events set logo_url=logo_url where public.logo_mark_denied(logo_url);
update public.venues set logo_url=logo_url where public.logo_mark_denied(logo_url);
update public.organizations set logo_url=logo_url where public.logo_mark_denied(logo_url);
update public.marketplace_brands set logo_url=logo_url where public.logo_mark_denied(logo_url);
