-- Mandatory-avatar rollout: every profile gets an avatar. Backfills a
-- deterministic builder config (seeded from user_id, stable across runs) for
-- profiles with no upload and no builder config. Users who explicitly chose
-- initials keep them. Gender-coded traits (body/facial hair) are fixed to a
-- neutral baseline — the user picks their own in the builder.

-- Marks the default so the settings prompt can nudge (never block); any
-- user-made avatar save clears it.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_auto_assigned boolean NOT NULL DEFAULT false;

WITH pools AS (
  SELECT
    ARRAY['black','red','brown','light','yellow','dark']             AS skin,
    ARRAY['white','blue','black','blonde','orange','brown','pink']   AS haircolor,
    ARRAY['long','bun','short','pixie','buzz','afro','bob']          AS hair,
    ARRAY['shirt','vneck','tankTop','dressShirt']                    AS clothing,
    ARRAY['white','blue','black','green','red']                      AS clothingcolor,
    ARRAY['content','normal','happy']                                AS eyes,
    ARRAY['raised','serious']                                        AS eyebrows,
    ARRAY['grin','openSmile','serious']                              AS mouth,
    ARRAY['none','roundGlasses']                                     AS accessory,
    ARRAY['red','pink','purple']                                     AS lipcolor
)
UPDATE profiles p
SET
  avatar_config = jsonb_build_object(
    'accessory',     pools.accessory[1 + abs(hashtext(p.user_id::text || 'acc')) % 2],
    'body',          'chest',
    'clothing',      pools.clothing[1 + abs(hashtext(p.user_id::text || 'clo')) % 4],
    'clothingColor', pools.clothingcolor[1 + abs(hashtext(p.user_id::text || 'clc')) % 5],
    'eyebrows',      pools.eyebrows[1 + abs(hashtext(p.user_id::text || 'brw')) % 2],
    'eyes',          pools.eyes[1 + abs(hashtext(p.user_id::text || 'eye')) % 3],
    'facialHair',    'none',
    'graphic',       'none',
    'hair',          pools.hair[1 + abs(hashtext(p.user_id::text || 'hai')) % 7],
    'hairColor',     pools.haircolor[1 + abs(hashtext(p.user_id::text || 'hac')) % 7],
    'hat',           'none',
    'hatColor',      'white',
    'lashes',        false,
    'lipColor',      pools.lipcolor[1 + abs(hashtext(p.user_id::text || 'lip')) % 3],
    'mask',          false,
    'mouth',         pools.mouth[1 + abs(hashtext(p.user_id::text || 'mou')) % 3],
    'skinTone',      pools.skin[1 + abs(hashtext(p.user_id::text || 'ski')) % 6],
    'circleColor',   'blue'
  ),
  avatar_type = 'builder',
  avatar_auto_assigned = true,
  updated_at = now()
FROM pools
WHERE p.avatar_url IS NULL
  AND p.avatar_config IS NULL
  AND (p.avatar_type IS NULL OR p.avatar_type <> 'initials');
