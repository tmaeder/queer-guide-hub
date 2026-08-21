-- Repair countries.continent_id/region_id: 24 territories were mis-tagged continent=Africa
-- (an FK-default trap; their capital/timezone/currency data was always correct, only the
-- geo FKs were wrong). Also fills region_id for 5 rows whose continent (Africa) was already
-- correct but region_id was never set.
WITH targets(country_name, continent_name, region_name) AS (
  VALUES
    ('Anguilla', 'North America', 'Caribbean'),
    ('Aruba', 'North America', 'Caribbean'),
    ('British Virgin Islands', 'North America', 'Caribbean'),
    ('Caribbean Netherlands', 'North America', 'Caribbean'),
    ('Cayman Islands', 'North America', 'Caribbean'),
    ('Curaçao', 'North America', 'Caribbean'),
    ('Guadeloupe', 'North America', 'Caribbean'),
    ('Martinique', 'North America', 'Caribbean'),
    ('Montserrat', 'North America', 'Caribbean'),
    ('Puerto Rico', 'North America', 'Caribbean'),
    ('Saint Barthélemy', 'North America', 'Caribbean'),
    ('Saint Martin', 'North America', 'Caribbean'),
    ('Sint Maarten', 'North America', 'Caribbean'),
    ('Turks and Caicos Islands', 'North America', 'Caribbean'),
    ('United States Virgin Islands', 'North America', 'Caribbean'),
    ('Bermuda', 'North America', 'Northern America'),
    ('Greenland', 'North America', 'Northern America'),
    ('Saint Pierre and Miquelon', 'North America', 'Northern America'),
    ('Antarctica', 'Antarctica', NULL),
    ('Bouvet Island', 'Antarctica', NULL),
    ('French Southern and Antarctic Lands', 'Antarctica', NULL),
    ('Heard Island and McDonald Islands', 'Antarctica', NULL),
    ('South Georgia', 'Antarctica', NULL),
    ('United States Minor Outlying Islands', 'Oceania', 'Micronesia'),
    ('Western Sahara', 'Africa', 'Northern Africa'),
    ('Réunion', 'Africa', 'Eastern Africa'),
    ('Mayotte', 'Africa', 'Eastern Africa'),
    ('Saint Helena, Ascension and Tristan da Cunha', 'Africa', 'Western Africa'),
    ('British Indian Ocean Territory', 'Africa', 'Eastern Africa')
)
UPDATE countries c
SET continent_id = co.id,
    region_id = r.id,
    updated_at = now()
FROM targets t
JOIN continents co ON co.name = t.continent_name
LEFT JOIN regions r ON r.name = t.region_name AND r.continent_id = co.id
WHERE c.name = t.country_name;
