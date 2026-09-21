-- Production-corpus correction for marketplace taxonomy v4. The 82-row frozen
-- gate exposed ten garment false positives caused by adult material/component
-- words (notably sleeve, latex, and leather) winning inside the v3 fallback.

CREATE OR REPLACE FUNCTION public.marketplace_subcategory_group(p_subcategory text, p_title text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT CASE
    WHEN lower(coalesce(p_title, '')) ~ '\m(cleaner|cleaning spray|toy cleaner)\M' THEN 'safer_sex'
    WHEN lower(coalesce(p_title, '')) ~ '\m(cycling kit|cycle kit)\M' THEN 'apparel'
    WHEN lower(coalesce(p_title, '')) ~ '\m(t-?shirts?|tees?|tank tops?|crop tops?|camis?|camisoles?|polos?|jerseys?|blouses?)\M' THEN 'tops'
    WHEN lower(coalesce(p_title, '')) ~ '\m(hoodies?|sweatshirts?|jackets?|coats?|bombers?)\M' THEN 'outerwear'
    WHEN lower(coalesce(p_title, '')) ~ '\m(leggings?|shorts?|trousers?|pants?|jeans?|skirts?)\M' THEN 'bottoms'
    WHEN lower(coalesce(p_title, '')) ~ '\m(dresses?|robes?)\M' THEN 'apparel'
    WHEN lower(coalesce(p_title, '')) ~ '\m(dildo|vibrator|masturbator|stroker|butt plug|anal plug|cock ring|chastity cage|wand massager)\M'
      THEN public.marketplace_subcategory_group_v3(p_title, p_title)
    WHEN lower(coalesce(p_title, '')) ~ '\m(lubricants?|lubes?|gleitgel|douches?|enemas?|condoms?)\M'
      THEN public.marketplace_subcategory_group(p_title)
    WHEN lower(coalesce(p_title, '')) ~ '\m(restraints?|cuffs?|manacles?|shackles?)\M' THEN 'bondage'
    WHEN lower(coalesce(p_title, '')) ~ '\m(harness|harnesses)\M' THEN 'harnesses'
    WHEN lower(coalesce(p_title, '')) ~ '\m(menstrual cup)\M' THEN 'grooming'
    WHEN lower(coalesce(p_title, '')) ~ '\m(jocks?|jockstraps?|briefs|boxers|thong|lingerie|underwear)\M'
      THEN public.marketplace_subcategory_group(p_title)
    WHEN lower(coalesce(p_title, '')) ~ '\m(necklace|earrings?|bracelet|pendant|ring)\M' THEN 'jewelry'
    WHEN lower(coalesce(p_title, '')) ~ '\m(books?|novels?|memoirs?|antholog(y|ies)|paperbacks?|hardcovers?)\M' THEN 'books'
    ELSE public.marketplace_subcategory_group_v3(p_subcategory, p_title)
  END;
$$;

DO $$
DECLARE v_gate jsonb;
BEGIN
  v_gate:=public.marketplace_validate_taxonomy_corpus();
  IF NOT coalesce((v_gate->>'department_pass')::boolean,false)
     OR NOT coalesce((v_gate->>'group_pass')::boolean,false) THEN
    RAISE EXCEPTION 'taxonomy corpus gate failed after garment precedence fix: %',v_gate;
  END IF;
END;
$$;
