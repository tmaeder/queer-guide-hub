-- knowledge_base.slug is generated from name. The cosmetic WiFi -> Wi-Fi
-- spelling change altered two established lookup identifiers. Retain the
-- original accepted spelling to preserve both generated keys and source data.
SELECT set_config('app.actor','admin:preserve-wifi-vocabulary-identifiers',true);
UPDATE public.event_amenities SET name='WiFi',aliases=array_remove(aliases,'WiFi')
WHERE name='Wi-Fi' AND description='Wireless internet access';
UPDATE public.knowledge_base SET name='WiFi'
WHERE name='Wi-Fi' AND category IN ('event_amenity','attribute');
