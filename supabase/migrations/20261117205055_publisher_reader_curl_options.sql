-- Restricted transport for publisher RSS feeds rejected by edge egress.
-- Public documents only; no arbitrary URL, credentials or elevated execution.
create or replace function public.fetch_publisher_rss(p_url text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  response extensions.http_response;
begin
  if p_url not in (
    'https://lavendermagazine.com/feed/',
    'https://www.losangelesblade.com/feed/',
    'https://qvoicenews.com/feed/',
    'https://www.starobserver.com.au/feed/'
  ) or p_url is null then
    raise exception 'Unsupported publisher feed';
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '12000');
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '3000');
  response := extensions.http((
    'GET', 'https://r.jina.ai/' || p_url,
    array[extensions.http_header('X-Return-Format', 'html')],
    null, null
  )::extensions.http_request);
  perform extensions.http_reset_curlopt();
  if response.status <> 200 then
    raise exception 'Publisher reader HTTP %', response.status;
  end if;
  if octet_length(response.content) > 1000000 or response.content !~* '^\s*(<\?xml[^>]*>\s*)?(<\?xml-stylesheet[^>]*>\s*)?<(rss|feed)(\s|>)' then
    raise exception 'Publisher reader returned an invalid or oversized RSS document';
  end if;
  return response.content;
exception when others then
  perform extensions.http_reset_curlopt();
  raise;
end;
$$;
revoke all on function public.fetch_publisher_rss(text) from public, anon, authenticated;
grant execute on function public.fetch_publisher_rss(text) to service_role;
comment on function public.fetch_publisher_rss(text) is 'Service-only, exact-allowlist public RSS transport; original publisher XML, 12 second timeout, 1 MB result limit.';
