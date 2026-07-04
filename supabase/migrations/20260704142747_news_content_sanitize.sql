
CREATE OR REPLACE FUNCTION public.news_strip_junk(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT nullif(btrim(regexp_replace(coalesce(p, ''),
    '(?i)(only available in paid plans|this (article|content) is for subscribers only|'
    || 'subscribe to (read|continue)[^.\n]*|nur für abonnenten|réservé aux abonnés|'
    || 'solo para suscriptores|solo per abbonati|\(opens? in (a )?new (window|tab)\))',
    ' ', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.news_is_corrupted_markup(p text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $$
  SELECT p IS NOT NULL AND (
       p ~ 'class="' OR p ~ 'wp-block' OR p ~ 'decoding=' OR p ~ 'srcset='
    OR p ~ 'fetchpriority' OR p ~ 'sizes="' OR p ~ 'loading="lazy"' OR p ~ '="https?://'
    OR p ~ '!\[CDATA\[' OR p ~ '\?xml'
    OR p ~ '/(p|figure|figcaption|div|em|strong|span|li|ul|ol|blockquote|table|tr|td|img|h[1-6])\M'
    OR p ~ '\m(figure|figcaption|iframe|img)\M'
    OR p ~ '\m(?:p|em|strong|span|div|figure|li|h[1-6])(?=[A-Z])'
  );
$$;

CREATE OR REPLACE FUNCTION public.decode_news_entities_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.title IS NOT NULL THEN
    NEW.title := public.news_decode_entities(NEW.title);
  END IF;
  IF NEW.excerpt IS NOT NULL THEN
    NEW.excerpt := public.news_strip_junk(public.news_decode_entities(NEW.excerpt));
  END IF;
  IF NEW.content IS NOT NULL THEN
    NEW.content := public.news_strip_junk(public.news_decode_entities(NEW.content));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS news_articles_decode_entities ON public.news_articles;
CREATE TRIGGER news_articles_decode_entities
  BEFORE INSERT OR UPDATE OF title, excerpt, content
  ON public.news_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.decode_news_entities_trigger();
