-- Continue adding cities for remaining continents
-- EUROPE CITIES
INSERT INTO public.cities (name, country_id, population, latitude, longitude, is_capital, is_major_city, timezone) VALUES 
-- Albania
('Tirana', (SELECT id FROM public.countries WHERE code = 'AL'), 500000, 41.3275, 19.8187, true, true, 'Europe/Tirane'),

-- Andorra
('Andorra la Vella', (SELECT id FROM public.countries WHERE code = 'AD'), 23000, 42.5063, 1.5218, true, true, 'Europe/Andorra'),

-- Austria
('Vienna', (SELECT id FROM public.countries WHERE code = 'AT'), 2000000, 48.2082, 16.3738, true, true, 'Europe/Vienna'),

-- Belarus
('Minsk', (SELECT id FROM public.countries WHERE code = 'BY'), 2000000, 53.9006, 27.5590, true, true, 'Europe/Minsk'),

-- Belgium
('Brussels', (SELECT id FROM public.countries WHERE code = 'BE'), 1200000, 50.8503, 4.3517, true, true, 'Europe/Brussels'),
('Antwerp', (SELECT id FROM public.countries WHERE code = 'BE'), 530000, 51.2194, 4.4025, false, true, 'Europe/Brussels'),

-- Bosnia and Herzegovina
('Sarajevo', (SELECT id FROM public.countries WHERE code = 'BA'), 400000, 43.8563, 18.4131, true, true, 'Europe/Sarajevo'),

-- Bulgaria
('Sofia', (SELECT id FROM public.countries WHERE code = 'BG'), 1500000, 42.6977, 23.3219, true, true, 'Europe/Sofia'),

-- Croatia
('Zagreb', (SELECT id FROM public.countries WHERE code = 'HR'), 800000, 45.8150, 15.9819, true, true, 'Europe/Zagreb'),

-- Czech Republic
('Prague', (SELECT id FROM public.countries WHERE code = 'CZ'), 1300000, 50.0755, 14.4378, true, true, 'Europe/Prague'),

-- Denmark
('Copenhagen', (SELECT id FROM public.countries WHERE code = 'DK'), 1400000, 55.6761, 12.5683, true, true, 'Europe/Copenhagen'),

-- Estonia
('Tallinn', (SELECT id FROM public.countries WHERE code = 'EE'), 430000, 59.4370, 24.7536, true, true, 'Europe/Tallinn'),

-- Finland
('Helsinki', (SELECT id FROM public.countries WHERE code = 'FI'), 1500000, 60.1699, 24.9384, true, true, 'Europe/Helsinki'),

-- France
('Paris', (SELECT id FROM public.countries WHERE code = 'FR'), 12000000, 48.8566, 2.3522, true, true, 'Europe/Paris'),
('Lyon', (SELECT id FROM public.countries WHERE code = 'FR'), 2300000, 45.7640, 4.8357, false, true, 'Europe/Paris'),
('Marseille', (SELECT id FROM public.countries WHERE code = 'FR'), 1800000, 43.2965, 5.3698, false, true, 'Europe/Paris'),

-- Germany
('Berlin', (SELECT id FROM public.countries WHERE code = 'DE'), 3700000, 52.5200, 13.4050, true, true, 'Europe/Berlin'),
('Munich', (SELECT id FROM public.countries WHERE code = 'DE'), 1500000, 48.1351, 11.5820, false, true, 'Europe/Berlin'),
('Hamburg', (SELECT id FROM public.countries WHERE code = 'DE'), 1900000, 53.5511, 9.9937, false, true, 'Europe/Berlin'),

-- Greece
('Athens', (SELECT id FROM public.countries WHERE code = 'GR'), 3700000, 37.9838, 23.7275, true, true, 'Europe/Athens'),
('Thessaloniki', (SELECT id FROM public.countries WHERE code = 'GR'), 1100000, 40.6401, 22.9444, false, true, 'Europe/Athens'),

-- Hungary
('Budapest', (SELECT id FROM public.countries WHERE code = 'HU'), 1800000, 47.4979, 19.0402, true, true, 'Europe/Budapest'),

-- Iceland
('Reykjavik', (SELECT id FROM public.countries WHERE code = 'IS'), 130000, 64.1466, -21.9426, true, true, 'Atlantic/Reykjavik'),

-- Ireland
('Dublin', (SELECT id FROM public.countries WHERE code = 'IE'), 1400000, 53.3498, -6.2603, true, true, 'Europe/Dublin'),

-- Italy
('Rome', (SELECT id FROM public.countries WHERE code = 'IT'), 4300000, 41.9028, 12.4964, true, true, 'Europe/Rome'),
('Milan', (SELECT id FROM public.countries WHERE code = 'IT'), 3200000, 45.4642, 9.1900, false, true, 'Europe/Rome'),
('Naples', (SELECT id FROM public.countries WHERE code = 'IT'), 3100000, 40.8518, 14.2681, false, true, 'Europe/Rome'),

-- Kosovo
('Pristina', (SELECT id FROM public.countries WHERE code = 'XK'), 200000, 42.6629, 21.1655, true, true, 'Europe/Belgrade'),

-- Latvia
('Riga', (SELECT id FROM public.countries WHERE code = 'LV'), 640000, 56.9496, 24.1052, true, true, 'Europe/Riga'),

-- Liechtenstein
('Vaduz', (SELECT id FROM public.countries WHERE code = 'LI'), 5700, 47.1410, 9.5209, true, true, 'Europe/Vaduz'),

-- Lithuania
('Vilnius', (SELECT id FROM public.countries WHERE code = 'LT'), 580000, 54.6872, 25.2797, true, true, 'Europe/Vilnius'),

-- Luxembourg
('Luxembourg', (SELECT id FROM public.countries WHERE code = 'LU'), 125000, 49.6116, 6.1319, true, true, 'Europe/Luxembourg'),

-- Malta
('Valletta', (SELECT id FROM public.countries WHERE code = 'MT'), 7000, 35.8989, 14.5146, true, false, 'Europe/Malta'),
('Birkirkara', (SELECT id FROM public.countries WHERE code = 'MT'), 25000, 35.8975, 14.4611, false, true, 'Europe/Malta'),

-- Moldova
('Chișinău', (SELECT id FROM public.countries WHERE code = 'MD'), 700000, 47.0105, 28.8638, true, true, 'Europe/Chisinau'),

-- Monaco
('Monaco', (SELECT id FROM public.countries WHERE code = 'MC'), 39000, 43.7384, 7.4246, true, true, 'Europe/Monaco'),

-- Montenegro
('Podgorica', (SELECT id FROM public.countries WHERE code = 'ME'), 190000, 42.4304, 19.2594, true, true, 'Europe/Podgorica'),

-- Netherlands
('Amsterdam', (SELECT id FROM public.countries WHERE code = 'NL'), 1150000, 52.3676, 4.9041, true, true, 'Europe/Amsterdam'),
('Rotterdam', (SELECT id FROM public.countries WHERE code = 'NL'), 650000, 51.9244, 4.4777, false, true, 'Europe/Amsterdam'),
('The Hague', (SELECT id FROM public.countries WHERE code = 'NL'), 550000, 52.0705, 4.3007, false, true, 'Europe/Amsterdam'),

-- North Macedonia
('Skopje', (SELECT id FROM public.countries WHERE code = 'MK'), 540000, 41.9973, 21.4280, true, true, 'Europe/Skopje'),

-- Norway
('Oslo', (SELECT id FROM public.countries WHERE code = 'NO'), 1000000, 59.9139, 10.7522, true, true, 'Europe/Oslo'),
('Bergen', (SELECT id FROM public.countries WHERE code = 'NO'), 280000, 60.3913, 5.3221, false, true, 'Europe/Oslo'),

-- Poland
('Warsaw', (SELECT id FROM public.countries WHERE code = 'PL'), 1800000, 52.2297, 21.0122, true, true, 'Europe/Warsaw'),
('Krakow', (SELECT id FROM public.countries WHERE code = 'PL'), 780000, 50.0647, 19.9450, false, true, 'Europe/Warsaw'),

-- Portugal
('Lisbon', (SELECT id FROM public.countries WHERE code = 'PT'), 2900000, 38.7223, -9.1393, true, true, 'Europe/Lisbon'),
('Porto', (SELECT id FROM public.countries WHERE code = 'PT'), 1700000, 41.1579, -8.6291, false, true, 'Europe/Lisbon'),

-- Romania
('Bucharest', (SELECT id FROM public.countries WHERE code = 'RO'), 2100000, 44.4268, 26.1025, true, true, 'Europe/Bucharest'),

-- Russia
('Moscow', (SELECT id FROM public.countries WHERE code = 'RU'), 12500000, 55.7558, 37.6173, true, true, 'Europe/Moscow'),
('Saint Petersburg', (SELECT id FROM public.countries WHERE code = 'RU'), 5400000, 59.9311, 30.3609, false, true, 'Europe/Moscow'),

-- San Marino
('San Marino', (SELECT id FROM public.countries WHERE code = 'SM'), 4000, 43.9424, 12.4578, true, true, 'Europe/San_Marino'),

-- Serbia
('Belgrade', (SELECT id FROM public.countries WHERE code = 'RS'), 1700000, 44.7866, 20.4489, true, true, 'Europe/Belgrade'),

-- Slovakia
('Bratislava', (SELECT id FROM public.countries WHERE code = 'SK'), 430000, 48.1486, 17.1077, true, true, 'Europe/Bratislava'),

-- Slovenia
('Ljubljana', (SELECT id FROM public.countries WHERE code = 'SI'), 290000, 46.0569, 14.5058, true, true, 'Europe/Ljubljana'),

-- Spain
('Madrid', (SELECT id FROM public.countries WHERE code = 'ES'), 6700000, 40.4168, -3.7038, true, true, 'Europe/Madrid'),
('Barcelona', (SELECT id FROM public.countries WHERE code = 'ES'), 5600000, 41.3851, 2.1734, false, true, 'Europe/Madrid'),
('Valencia', (SELECT id FROM public.countries WHERE code = 'ES'), 1600000, 39.4699, -0.3763, false, true, 'Europe/Madrid'),

-- Sweden
('Stockholm', (SELECT id FROM public.countries WHERE code = 'SE'), 1600000, 59.3293, 18.0686, true, true, 'Europe/Stockholm'),
('Gothenburg', (SELECT id FROM public.countries WHERE code = 'SE'), 580000, 57.7089, 11.9746, false, true, 'Europe/Stockholm'),

-- Switzerland
('Bern', (SELECT id FROM public.countries WHERE code = 'CH'), 420000, 46.9481, 7.4474, true, false, 'Europe/Zurich'),
('Zurich', (SELECT id FROM public.countries WHERE code = 'CH'), 1400000, 47.3769, 8.5417, false, true, 'Europe/Zurich'),
('Geneva', (SELECT id FROM public.countries WHERE code = 'CH'), 500000, 46.2044, 6.1432, false, true, 'Europe/Zurich'),

-- Ukraine
('Kyiv', (SELECT id FROM public.countries WHERE code = 'UA'), 3000000, 50.4501, 30.5234, true, true, 'Europe/Kiev'),
('Kharkiv', (SELECT id FROM public.countries WHERE code = 'UA'), 1400000, 49.9935, 36.2304, false, true, 'Europe/Kiev'),

-- United Kingdom
('London', (SELECT id FROM public.countries WHERE code = 'GB'), 9500000, 51.5074, -0.1278, true, true, 'Europe/London'),
('Birmingham', (SELECT id FROM public.countries WHERE code = 'GB'), 2600000, 52.4862, -1.8904, false, true, 'Europe/London'),
('Manchester', (SELECT id FROM public.countries WHERE code = 'GB'), 2700000, 53.4808, -2.2426, false, true, 'Europe/London'),

-- Vatican City
('Vatican City', (SELECT id FROM public.countries WHERE code = 'VA'), 825, 41.9029, 12.4534, true, true, 'Europe/Vatican');

-- NORTH AMERICA CITIES
INSERT INTO public.cities (name, country_id, population, latitude, longitude, is_capital, is_major_city, timezone) VALUES 
-- Antigua and Barbuda
('Saint John''s', (SELECT id FROM public.countries WHERE code = 'AG'), 22000, 17.1274, -61.8468, true, true, 'America/Antigua'),

-- Bahamas
('Nassau', (SELECT id FROM public.countries WHERE code = 'BS'), 280000, 25.0443, -77.3504, true, true, 'America/Nassau'),

-- Barbados
('Bridgetown', (SELECT id FROM public.countries WHERE code = 'BB'), 110000, 13.1124, -59.6127, true, true, 'America/Barbados'),

-- Belize
('Belmopan', (SELECT id FROM public.countries WHERE code = 'BZ'), 25000, 17.2510, -88.7590, true, false, 'America/Belize'),
('Belize City', (SELECT id FROM public.countries WHERE code = 'BZ'), 62000, 17.5010, -88.1962, false, true, 'America/Belize'),

-- Canada
('Ottawa', (SELECT id FROM public.countries WHERE code = 'CA'), 1400000, 45.4215, -75.6972, true, true, 'America/Toronto'),
('Toronto', (SELECT id FROM public.countries WHERE code = 'CA'), 6400000, 43.6532, -79.3832, false, true, 'America/Toronto'),
('Montreal', (SELECT id FROM public.countries WHERE code = 'CA'), 4300000, 45.5017, -73.5673, false, true, 'America/Toronto'),
('Vancouver', (SELECT id FROM public.countries WHERE code = 'CA'), 2600000, 49.2827, -123.1207, false, true, 'America/Vancouver'),

-- Costa Rica
('San José', (SELECT id FROM public.countries WHERE code = 'CR'), 1400000, 9.9281, -84.0907, true, true, 'America/Costa_Rica'),

-- Cuba
('Havana', (SELECT id FROM public.countries WHERE code = 'CU'), 2100000, 23.1136, -82.3666, true, true, 'America/Havana'),

-- Dominica
('Roseau', (SELECT id FROM public.countries WHERE code = 'DM'), 15000, 15.3017, -61.3870, true, true, 'America/Dominica'),

-- Dominican Republic
('Santo Domingo', (SELECT id FROM public.countries WHERE code = 'DO'), 3300000, 18.4861, -69.9312, true, true, 'America/Santo_Domingo'),

-- El Salvador
('San Salvador', (SELECT id FROM public.countries WHERE code = 'SV'), 1100000, 13.6929, -89.2182, true, true, 'America/El_Salvador'),

-- Grenada
('Saint George''s', (SELECT id FROM public.countries WHERE code = 'GD'), 4000, 12.0570, -61.7486, true, true, 'America/Grenada'),

-- Guatemala
('Guatemala City', (SELECT id FROM public.countries WHERE code = 'GT'), 3000000, 14.6349, -90.5069, true, true, 'America/Guatemala'),

-- Haiti
('Port-au-Prince', (SELECT id FROM public.countries WHERE code = 'HT'), 2700000, 18.5944, -72.3074, true, true, 'America/Port-au-Prince'),

-- Honduras
('Tegucigalpa', (SELECT id FROM public.countries WHERE code = 'HN'), 1400000, 14.0723, -87.1921, true, true, 'America/Tegucigalpa'),

-- Jamaica
('Kingston', (SELECT id FROM public.countries WHERE code = 'JM'), 590000, 17.9970, -76.7936, true, true, 'America/Jamaica'),

-- Mexico
('Mexico City', (SELECT id FROM public.countries WHERE code = 'MX'), 22000000, 19.4326, -99.1332, true, true, 'America/Mexico_City'),
('Guadalajara', (SELECT id FROM public.countries WHERE code = 'MX'), 5000000, 20.6597, -103.3496, false, true, 'America/Mexico_City'),
('Monterrey', (SELECT id FROM public.countries WHERE code = 'MX'), 4700000, 25.6866, -100.3161, false, true, 'America/Mexico_City'),

-- Nicaragua
('Managua', (SELECT id FROM public.countries WHERE code = 'NI'), 1400000, 12.1364, -86.2514, true, true, 'America/Managua'),

-- Panama
('Panama City', (SELECT id FROM public.countries WHERE code = 'PA'), 1900000, 8.9824, -79.5199, true, true, 'America/Panama'),

-- Saint Kitts and Nevis
('Basseterre', (SELECT id FROM public.countries WHERE code = 'KN'), 14000, 17.3026, -62.7177, true, true, 'America/St_Kitts'),

-- Saint Lucia
('Castries', (SELECT id FROM public.countries WHERE code = 'LC'), 22000, 14.0101, -60.9875, true, true, 'America/St_Lucia'),

-- Saint Vincent and the Grenadines
('Kingstown', (SELECT id FROM public.countries WHERE code = 'VC'), 25000, 13.1579, -61.2248, true, true, 'America/St_Vincent'),

-- Trinidad and Tobago
('Port of Spain', (SELECT id FROM public.countries WHERE code = 'TT'), 540000, 10.6596, -61.5280, true, true, 'America/Port_of_Spain'),

-- United States
('Washington, D.C.', (SELECT id FROM public.countries WHERE code = 'US'), 6300000, 38.9072, -77.0369, true, true, 'America/New_York'),
('New York', (SELECT id FROM public.countries WHERE code = 'US'), 20300000, 40.7128, -74.0060, false, true, 'America/New_York'),
('Los Angeles', (SELECT id FROM public.countries WHERE code = 'US'), 13200000, 34.0522, -118.2437, false, true, 'America/Los_Angeles'),
('Chicago', (SELECT id FROM public.countries WHERE code = 'US'), 9500000, 41.8781, -87.6298, false, true, 'America/Chicago'),
('Houston', (SELECT id FROM public.countries WHERE code = 'US'), 7100000, 29.7604, -95.3698, false, true, 'America/Chicago'),
('Phoenix', (SELECT id FROM public.countries WHERE code = 'US'), 4900000, 33.4484, -112.0740, false, true, 'America/Phoenix'),
('Philadelphia', (SELECT id FROM public.countries WHERE code = 'US'), 6100000, 39.9526, -75.1652, false, true, 'America/New_York');

-- SOUTH AMERICA CITIES
INSERT INTO public.cities (name, country_id, population, latitude, longitude, is_capital, is_major_city, timezone) VALUES 
-- Argentina
('Buenos Aires', (SELECT id FROM public.countries WHERE code = 'AR'), 15000000, -34.6118, -58.3960, true, true, 'America/Argentina/Buenos_Aires'),
('Córdoba', (SELECT id FROM public.countries WHERE code = 'AR'), 1700000, -31.4201, -64.1888, false, true, 'America/Argentina/Cordoba'),
('Rosario', (SELECT id FROM public.countries WHERE code = 'AR'), 1400000, -32.9442, -60.6505, false, true, 'America/Argentina/Buenos_Aires'),

-- Bolivia
('Sucre', (SELECT id FROM public.countries WHERE code = 'BO'), 280000, -19.0196, -65.2619, true, false, 'America/La_Paz'),
('La Paz', (SELECT id FROM public.countries WHERE code = 'BO'), 2300000, -16.5000, -68.1193, false, true, 'America/La_Paz'),
('Santa Cruz', (SELECT id FROM public.countries WHERE code = 'BO'), 1500000, -17.7863, -63.1822, false, true, 'America/La_Paz'),

-- Brazil
('Brasília', (SELECT id FROM public.countries WHERE code = 'BR'), 3100000, -15.8267, -47.9218, true, true, 'America/Sao_Paulo'),
('São Paulo', (SELECT id FROM public.countries WHERE code = 'BR'), 22400000, -23.5558, -46.6396, false, true, 'America/Sao_Paulo'),
('Rio de Janeiro', (SELECT id FROM public.countries WHERE code = 'BR'), 13700000, -22.9068, -43.1729, false, true, 'America/Sao_Paulo'),
('Salvador', (SELECT id FROM public.countries WHERE code = 'BR'), 4000000, -12.9714, -38.5014, false, true, 'America/Bahia'),

-- Chile
('Santiago', (SELECT id FROM public.countries WHERE code = 'CL'), 7000000, -33.4489, -70.6693, true, true, 'America/Santiago'),
('Valparaíso', (SELECT id FROM public.countries WHERE code = 'CL'), 950000, -33.0472, -71.6127, false, true, 'America/Santiago'),

-- Colombia
('Bogotá', (SELECT id FROM public.countries WHERE code = 'CO'), 11000000, 4.7110, -74.0721, true, true, 'America/Bogota'),
('Medellín', (SELECT id FROM public.countries WHERE code = 'CO'), 4000000, 6.2442, -75.5812, false, true, 'America/Bogota'),
('Cali', (SELECT id FROM public.countries WHERE code = 'CO'), 2500000, 3.4516, -76.5320, false, true, 'America/Bogota'),

-- Ecuador
('Quito', (SELECT id FROM public.countries WHERE code = 'EC'), 2800000, -0.1807, -78.4678, true, true, 'America/Guayaquil'),
('Guayaquil', (SELECT id FROM public.countries WHERE code = 'EC'), 3500000, -2.1894, -79.8890, false, true, 'America/Guayaquil'),

-- Falkland Islands
('Stanley', (SELECT id FROM public.countries WHERE code = 'FK'), 2500, -51.6977, -57.8570, true, true, 'Atlantic/Stanley'),

-- French Guiana
('Cayenne', (SELECT id FROM public.countries WHERE code = 'GF'), 61000, 4.9346, -52.3303, true, true, 'America/Cayenne'),

-- Guyana
('Georgetown', (SELECT id FROM public.countries WHERE code = 'GY'), 240000, 6.8013, -58.1551, true, true, 'America/Guyana'),

-- Paraguay
('Asunción', (SELECT id FROM public.countries WHERE code = 'PY'), 3200000, -25.2637, -57.5759, true, true, 'America/Asuncion'),

-- Peru
('Lima', (SELECT id FROM public.countries WHERE code = 'PE'), 11000000, -12.0464, -77.0428, true, true, 'America/Lima'),
('Arequipa', (SELECT id FROM public.countries WHERE code = 'PE'), 1100000, -16.4090, -71.5375, false, true, 'America/Lima'),

-- Suriname
('Paramaribo', (SELECT id FROM public.countries WHERE code = 'SR'), 240000, 5.8520, -55.2038, true, true, 'America/Paramaribo'),

-- Uruguay
('Montevideo', (SELECT id FROM public.countries WHERE code = 'UY'), 1700000, -34.9011, -56.1645, true, true, 'America/Montevideo'),

-- Venezuela
('Caracas', (SELECT id FROM public.countries WHERE code = 'VE'), 5200000, 10.4806, -66.9036, true, true, 'America/Caracas'),
('Maracaibo', (SELECT id FROM public.countries WHERE code = 'VE'), 2500000, 10.6427, -71.6125, false, true, 'America/Caracas');

-- OCEANIA CITIES
INSERT INTO public.cities (name, country_id, population, latitude, longitude, is_capital, is_major_city, timezone) VALUES 
-- Australia
('Canberra', (SELECT id FROM public.countries WHERE code = 'AU'), 460000, -35.2809, 149.1300, true, false, 'Australia/Sydney'),
('Sydney', (SELECT id FROM public.countries WHERE code = 'AU'), 5300000, -33.8688, 151.2093, false, true, 'Australia/Sydney'),
('Melbourne', (SELECT id FROM public.countries WHERE code = 'AU'), 5200000, -37.8136, 144.9631, false, true, 'Australia/Melbourne'),
('Brisbane', (SELECT id FROM public.countries WHERE code = 'AU'), 2600000, -27.4698, 153.0251, false, true, 'Australia/Brisbane'),
('Perth', (SELECT id FROM public.countries WHERE code = 'AU'), 2100000, -31.9505, 115.8605, false, true, 'Australia/Perth'),

-- Fiji
('Suva', (SELECT id FROM public.countries WHERE code = 'FJ'), 180000, -18.1248, 178.4501, true, true, 'Pacific/Fiji'),

-- Kiribati
('Tarawa', (SELECT id FROM public.countries WHERE code = 'KI'), 64000, 1.3278, 172.979, true, true, 'Pacific/Tarawa'),

-- Marshall Islands
('Majuro', (SELECT id FROM public.countries WHERE code = 'MH'), 28000, 7.1164, 171.1858, true, true, 'Pacific/Majuro'),

-- Micronesia
('Palikir', (SELECT id FROM public.countries WHERE code = 'FM'), 5000, 6.9248, 158.1611, true, true, 'Pacific/Chuuk'),

-- Nauru
('Yaren', (SELECT id FROM public.countries WHERE code = 'NR'), 1100, -0.5477, 166.920867, true, true, 'Pacific/Nauru'),

-- New Zealand
('Wellington', (SELECT id FROM public.countries WHERE code = 'NZ'), 420000, -41.2924, 174.7787, true, false, 'Pacific/Auckland'),
('Auckland', (SELECT id FROM public.countries WHERE code = 'NZ'), 1700000, -36.8485, 174.7633, false, true, 'Pacific/Auckland'),
('Christchurch', (SELECT id FROM public.countries WHERE code = 'NZ'), 390000, -43.5321, 172.6362, false, true, 'Pacific/Auckland'),

-- Palau
('Ngerulmud', (SELECT id FROM public.countries WHERE code = 'PW'), 400, 7.5006, 134.6244, true, true, 'Pacific/Palau'),

-- Papua New Guinea
('Port Moresby', (SELECT id FROM public.countries WHERE code = 'PG'), 400000, -9.4438, 147.1803, true, true, 'Pacific/Port_Moresby'),

-- Samoa
('Apia', (SELECT id FROM public.countries WHERE code = 'WS'), 36000, -13.8506, -171.7513, true, true, 'Pacific/Apia'),

-- Solomon Islands
('Honiara', (SELECT id FROM public.countries WHERE code = 'SB'), 85000, -9.4280, 159.9497, true, true, 'Pacific/Guadalcanal'),

-- Tonga
('Nuku''alofa', (SELECT id FROM public.countries WHERE code = 'TO'), 25000, -21.1347, -175.2204, true, true, 'Pacific/Tongatapu'),

-- Tuvalu
('Funafuti', (SELECT id FROM public.countries WHERE code = 'TV'), 7000, -8.5243, 179.1942, true, true, 'Pacific/Funafuti'),

-- Vanuatu
('Port Vila', (SELECT id FROM public.countries WHERE code = 'VU'), 53000, -17.7334, 168.3273, true, true, 'Pacific/Efate');