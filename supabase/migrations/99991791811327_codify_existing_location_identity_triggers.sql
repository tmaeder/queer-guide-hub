-- Preserve the location-identity trigger attachments already present in production.
-- Definitions read from pg_get_triggerdef; no function bodies or grants change.

DROP TRIGGER IF EXISTS link_brand_location_identity ON public.marketplace_brands;
CREATE TRIGGER link_brand_location_identity BEFORE INSERT OR UPDATE OF website ON public.marketplace_brands FOR EACH ROW EXECUTE FUNCTION public.link_business_location_identity();
DROP TRIGGER IF EXISTS link_merchant_location_identity ON public.marketplace_merchants;
CREATE TRIGGER link_merchant_location_identity BEFORE INSERT OR UPDATE OF shop_domain ON public.marketplace_merchants FOR EACH ROW EXECUTE FUNCTION public.link_business_location_identity();
DROP TRIGGER IF EXISTS aa_location_primary ON public.organizations;
CREATE TRIGGER aa_location_primary BEFORE INSERT OR UPDATE OF primary_venue_id ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.inherit_primary_entity_location();
