-- Add all major and capital cities for every country
-- This migration adds comprehensive city data for all countries

-- Insert capital and major cities for all countries
-- AFRICA CITIES
INSERT INTO public.cities (name, country_id, population, latitude, longitude, is_capital, is_major_city, timezone) VALUES 
-- Algeria
('Algiers', (SELECT id FROM public.countries WHERE code = 'DZ'), 2364000, 36.7528, 3.0420, true, true, 'Africa/Algiers'),
('Oran', (SELECT id FROM public.countries WHERE code = 'DZ'), 1300000, 35.6911, -0.6417, false, true, 'Africa/Algiers'),
('Constantine', (SELECT id FROM public.countries WHERE code = 'DZ'), 450000, 36.3650, 6.6147, false, true, 'Africa/Algiers'),

-- Angola
('Luanda', (SELECT id FROM public.countries WHERE code = 'AO'), 8000000, -8.8390, 13.2894, true, true, 'Africa/Luanda'),
('Huambo', (SELECT id FROM public.countries WHERE code = 'AO'), 600000, -12.7764, 15.7395, false, true, 'Africa/Luanda'),

-- Benin
('Porto-Novo', (SELECT id FROM public.countries WHERE code = 'BJ'), 264320, 6.4969, 2.6283, true, false, 'Africa/Porto-Novo'),
('Cotonou', (SELECT id FROM public.countries WHERE code = 'BJ'), 1200000, 6.3654, 2.4183, false, true, 'Africa/Porto-Novo'),

-- Botswana
('Gaborone', (SELECT id FROM public.countries WHERE code = 'BW'), 250000, -24.6282, 25.9231, true, true, 'Africa/Gaborone'),

-- Burkina Faso
('Ouagadougou', (SELECT id FROM public.countries WHERE code = 'BF'), 2400000, 12.3714, -1.5197, true, true, 'Africa/Ouagadougou'),
('Bobo-Dioulasso', (SELECT id FROM public.countries WHERE code = 'BF'), 900000, 11.1770, -4.2979, false, true, 'Africa/Ouagadougou'),

-- Burundi
('Gitega', (SELECT id FROM public.countries WHERE code = 'BI'), 135467, -3.4271, 29.9306, true, false, 'Africa/Bujumbura'),
('Bujumbura', (SELECT id FROM public.countries WHERE code = 'BI'), 1000000, -3.3614, 29.3599, false, true, 'Africa/Bujumbura'),

-- Cape Verde
('Praia', (SELECT id FROM public.countries WHERE code = 'CV'), 160000, 14.9177, -23.5092, true, true, 'Atlantic/Cape_Verde'),

-- Cameroon
('Yaoundé', (SELECT id FROM public.countries WHERE code = 'CM'), 4000000, 3.8480, 11.5021, true, true, 'Africa/Douala'),
('Douala', (SELECT id FROM public.countries WHERE code = 'CM'), 3000000, 4.0511, 9.7679, false, true, 'Africa/Douala'),

-- Central African Republic
('Bangui', (SELECT id FROM public.countries WHERE code = 'CF'), 889231, 4.3947, 18.5582, true, true, 'Africa/Bangui'),

-- Chad
('N''Djamena', (SELECT id FROM public.countries WHERE code = 'TD'), 1400000, 12.1348, 15.0557, true, true, 'Africa/Ndjamena'),

-- Comoros
('Moroni', (SELECT id FROM public.countries WHERE code = 'KM'), 111329, -11.6455, 43.3333, true, true, 'Indian/Comoro'),

-- Republic of the Congo
('Brazzaville', (SELECT id FROM public.countries WHERE code = 'CG'), 2300000, -4.2634, 15.2429, true, true, 'Africa/Brazzaville'),

-- Democratic Republic of the Congo
('Kinshasa', (SELECT id FROM public.countries WHERE code = 'CD'), 15000000, -4.0383, 21.7587, true, true, 'Africa/Kinshasa'),
('Lubumbashi', (SELECT id FROM public.countries WHERE code = 'CD'), 2000000, -11.6609, 27.4794, false, true, 'Africa/Lubumbashi'),

-- Côte d'Ivoire
('Yamoussoukro', (SELECT id FROM public.countries WHERE code = 'CI'), 355573, 6.8276, -5.2893, true, false, 'Africa/Abidjan'),
('Abidjan', (SELECT id FROM public.countries WHERE code = 'CI'), 5000000, 5.3600, -4.0083, false, true, 'Africa/Abidjan'),

-- Djibouti
('Djibouti', (SELECT id FROM public.countries WHERE code = 'DJ'), 650000, 11.8251, 42.5903, true, true, 'Africa/Djibouti'),

-- Egypt
('Cairo', (SELECT id FROM public.countries WHERE code = 'EG'), 20000000, 30.0444, 31.2357, true, true, 'Africa/Cairo'),
('Alexandria', (SELECT id FROM public.countries WHERE code = 'EG'), 5000000, 31.2001, 29.9187, false, true, 'Africa/Cairo'),
('Giza', (SELECT id FROM public.countries WHERE code = 'EG'), 4000000, 30.0131, 31.2089, false, true, 'Africa/Cairo'),

-- Equatorial Guinea
('Malabo', (SELECT id FROM public.countries WHERE code = 'GQ'), 300000, 3.7558, 8.7737, true, true, 'Africa/Malabo'),

-- Eritrea
('Asmara', (SELECT id FROM public.countries WHERE code = 'ER'), 963000, 15.3229, 38.9251, true, true, 'Africa/Asmara'),

-- Eswatini
('Mbabane', (SELECT id FROM public.countries WHERE code = 'SZ'), 95000, -26.3054, 31.1367, true, false, 'Africa/Mbabane'),
('Manzini', (SELECT id FROM public.countries WHERE code = 'SZ'), 110000, -26.4833, 31.3667, false, true, 'Africa/Mbabane'),

-- Ethiopia
('Addis Ababa', (SELECT id FROM public.countries WHERE code = 'ET'), 5000000, 9.1450, 40.4897, true, true, 'Africa/Addis_Ababa'),

-- Gabon
('Libreville', (SELECT id FROM public.countries WHERE code = 'GA'), 800000, 0.4162, 9.4673, true, true, 'Africa/Libreville'),

-- Gambia
('Banjul', (SELECT id FROM public.countries WHERE code = 'GM'), 31301, 13.4549, -16.5790, true, false, 'Africa/Banjul'),
('Serekunda', (SELECT id FROM public.countries WHERE code = 'GM'), 340000, 13.4383, -16.6772, false, true, 'Africa/Banjul'),

-- Ghana
('Accra', (SELECT id FROM public.countries WHERE code = 'GH'), 2500000, 5.6037, -0.1870, true, true, 'Africa/Accra'),
('Kumasi', (SELECT id FROM public.countries WHERE code = 'GH'), 2000000, 6.6885, -1.6244, false, true, 'Africa/Accra'),

-- Guinea
('Conakry', (SELECT id FROM public.countries WHERE code = 'GN'), 2000000, 9.6412, -13.5784, true, true, 'Africa/Conakry'),

-- Guinea-Bissau
('Bissau', (SELECT id FROM public.countries WHERE code = 'GW'), 492004, 11.8817, -15.6178, true, true, 'Africa/Bissau'),

-- Kenya
('Nairobi', (SELECT id FROM public.countries WHERE code = 'KE'), 5000000, -1.2921, 36.8219, true, true, 'Africa/Nairobi'),
('Mombasa', (SELECT id FROM public.countries WHERE code = 'KE'), 1200000, -4.0435, 39.6682, false, true, 'Africa/Nairobi'),

-- Lesotho
('Maseru', (SELECT id FROM public.countries WHERE code = 'LS'), 330790, -29.3151, 27.4869, true, true, 'Africa/Maseru'),

-- Liberia
('Monrovia', (SELECT id FROM public.countries WHERE code = 'LR'), 1500000, 6.2907, -10.7605, true, true, 'Africa/Monrovia'),

-- Libya
('Tripoli', (SELECT id FROM public.countries WHERE code = 'LY'), 1200000, 32.8872, 13.1913, true, true, 'Africa/Tripoli'),
('Benghazi', (SELECT id FROM public.countries WHERE code = 'LY'), 650000, 32.1167, 20.0686, false, true, 'Africa/Tripoli'),

-- Madagascar
('Antananarivo', (SELECT id FROM public.countries WHERE code = 'MG'), 3500000, -18.8792, 47.5079, true, true, 'Indian/Antananarivo'),

-- Malawi
('Lilongwe', (SELECT id FROM public.countries WHERE code = 'MW'), 1000000, -13.9626, 33.7741, true, true, 'Africa/Blantyre'),
('Blantyre', (SELECT id FROM public.countries WHERE code = 'MW'), 800000, -15.7861, 35.0058, false, true, 'Africa/Blantyre'),

-- Mali
('Bamako', (SELECT id FROM public.countries WHERE code = 'ML'), 2500000, 12.6392, -8.0029, true, true, 'Africa/Bamako'),

-- Mauritania
('Nouakchott', (SELECT id FROM public.countries WHERE code = 'MR'), 1200000, 18.0735, -15.9582, true, true, 'Africa/Nouakchott'),

-- Mauritius
('Port Louis', (SELECT id FROM public.countries WHERE code = 'MU'), 150000, -20.1654, 57.5046, true, true, 'Indian/Mauritius'),

-- Morocco
('Rabat', (SELECT id FROM public.countries WHERE code = 'MA'), 580000, 34.0209, -6.8416, true, false, 'Africa/Casablanca'),
('Casablanca', (SELECT id FROM public.countries WHERE code = 'MA'), 3500000, 33.5731, -7.5898, false, true, 'Africa/Casablanca'),
('Marrakech', (SELECT id FROM public.countries WHERE code = 'MA'), 1000000, 31.6295, -7.9811, false, true, 'Africa/Casablanca'),

-- Mozambique
('Maputo', (SELECT id FROM public.countries WHERE code = 'MZ'), 1200000, -25.9553, 32.5892, true, true, 'Africa/Maputo'),

-- Namibia
('Windhoek', (SELECT id FROM public.countries WHERE code = 'NA'), 400000, -22.5597, 17.0832, true, true, 'Africa/Windhoek'),

-- Niger
('Niamey', (SELECT id FROM public.countries WHERE code = 'NE'), 1300000, 13.5137, 2.1098, true, true, 'Africa/Niamey'),

-- Nigeria
('Abuja', (SELECT id FROM public.countries WHERE code = 'NG'), 3500000, 9.0579, 7.4951, true, true, 'Africa/Lagos'),
('Lagos', (SELECT id FROM public.countries WHERE code = 'NG'), 15000000, 6.5244, 3.3792, false, true, 'Africa/Lagos'),
('Kano', (SELECT id FROM public.countries WHERE code = 'NG'), 4000000, 12.0022, 8.5920, false, true, 'Africa/Lagos'),

-- Rwanda
('Kigali', (SELECT id FROM public.countries WHERE code = 'RW'), 1200000, -1.9706, 30.1044, true, true, 'Africa/Kigali'),

-- São Tomé and Príncipe
('São Tomé', (SELECT id FROM public.countries WHERE code = 'ST'), 80000, 0.3365, 6.7273, true, true, 'Africa/Sao_Tome'),

-- Senegal
('Dakar', (SELECT id FROM public.countries WHERE code = 'SN'), 3500000, 14.7167, -17.4677, true, true, 'Africa/Dakar'),

-- Seychelles
('Victoria', (SELECT id FROM public.countries WHERE code = 'SC'), 26000, -4.6796, 55.492, true, true, 'Indian/Mahe'),

-- Sierra Leone
('Freetown', (SELECT id FROM public.countries WHERE code = 'SL'), 1200000, 8.4606, -13.2317, true, true, 'Africa/Freetown'),

-- Somalia
('Mogadishu', (SELECT id FROM public.countries WHERE code = 'SO'), 2500000, 2.0469, 45.3182, true, true, 'Africa/Mogadishu'),

-- South Africa
('Cape Town', (SELECT id FROM public.countries WHERE code = 'ZA'), 4500000, -33.9249, 18.4241, true, true, 'Africa/Johannesburg'),
('Johannesburg', (SELECT id FROM public.countries WHERE code = 'ZA'), 5000000, -26.2041, 28.0473, false, true, 'Africa/Johannesburg'),
('Durban', (SELECT id FROM public.countries WHERE code = 'ZA'), 3500000, -29.8587, 31.0218, false, true, 'Africa/Johannesburg'),

-- South Sudan
('Juba', (SELECT id FROM public.countries WHERE code = 'SS'), 500000, 4.8594, 31.5713, true, true, 'Africa/Juba'),

-- Sudan
('Khartoum', (SELECT id FROM public.countries WHERE code = 'SD'), 6000000, 15.5007, 32.5599, true, true, 'Africa/Khartoum'),

-- Tanzania
('Dodoma', (SELECT id FROM public.countries WHERE code = 'TZ'), 410956, -6.1630, 35.7516, true, false, 'Africa/Dar_es_Salaam'),
('Dar es Salaam', (SELECT id FROM public.countries WHERE code = 'TZ'), 7000000, -6.7924, 39.2083, false, true, 'Africa/Dar_es_Salaam'),

-- Togo
('Lomé', (SELECT id FROM public.countries WHERE code = 'TG'), 1700000, 6.1256, 1.2251, true, true, 'Africa/Lome'),

-- Tunisia
('Tunis', (SELECT id FROM public.countries WHERE code = 'TN'), 2300000, 36.8065, 10.1815, true, true, 'Africa/Tunis'),

-- Uganda
('Kampala', (SELECT id FROM public.countries WHERE code = 'UG'), 3000000, 0.3476, 32.5825, true, true, 'Africa/Kampala'),

-- Zambia
('Lusaka', (SELECT id FROM public.countries WHERE code = 'ZM'), 3000000, -15.3875, 28.3228, true, true, 'Africa/Lusaka'),

-- Zimbabwe
('Harare', (SELECT id FROM public.countries WHERE code = 'ZW'), 2000000, -17.8252, 31.0335, true, true, 'Africa/Harare'),
('Bulawayo', (SELECT id FROM public.countries WHERE code = 'ZW'), 700000, -20.1619, 28.5810, false, true, 'Africa/Harare');

-- ASIA CITIES
INSERT INTO public.cities (name, country_id, population, latitude, longitude, is_capital, is_major_city, timezone) VALUES 
-- Afghanistan
('Kabul', (SELECT id FROM public.countries WHERE code = 'AF'), 4000000, 34.5553, 69.2075, true, true, 'Asia/Kabul'),
('Kandahar', (SELECT id FROM public.countries WHERE code = 'AF'), 600000, 31.6140, 65.7372, false, true, 'Asia/Kabul'),

-- Armenia
('Yerevan', (SELECT id FROM public.countries WHERE code = 'AM'), 1100000, 40.1792, 44.4991, true, true, 'Asia/Yerevan'),

-- Azerbaijan
('Baku', (SELECT id FROM public.countries WHERE code = 'AZ'), 2300000, 40.4093, 49.8671, true, true, 'Asia/Baku'),

-- Bahrain
('Manama', (SELECT id FROM public.countries WHERE code = 'BH'), 650000, 26.2285, 50.5860, true, true, 'Asia/Bahrain'),

-- Bangladesh
('Dhaka', (SELECT id FROM public.countries WHERE code = 'BD'), 22000000, 23.8103, 90.4125, true, true, 'Asia/Dhaka'),
('Chittagong', (SELECT id FROM public.countries WHERE code = 'BD'), 3000000, 22.3569, 91.7832, false, true, 'Asia/Dhaka'),

-- Bhutan
('Thimphu', (SELECT id FROM public.countries WHERE code = 'BT'), 115000, 27.4728, 89.6390, true, true, 'Asia/Thimphu'),

-- Brunei
('Bandar Seri Begawan', (SELECT id FROM public.countries WHERE code = 'BN'), 100000, 4.5353, 114.7277, true, true, 'Asia/Brunei'),

-- Cambodia
('Phnom Penh', (SELECT id FROM public.countries WHERE code = 'KH'), 2500000, 11.5449, 104.8922, true, true, 'Asia/Phnom_Penh'),

-- China
('Beijing', (SELECT id FROM public.countries WHERE code = 'CN'), 22000000, 39.9042, 116.4074, true, true, 'Asia/Shanghai'),
('Shanghai', (SELECT id FROM public.countries WHERE code = 'CN'), 28000000, 31.2304, 121.4737, false, true, 'Asia/Shanghai'),
('Guangzhou', (SELECT id FROM public.countries WHERE code = 'CN'), 15000000, 23.1291, 113.2644, false, true, 'Asia/Shanghai'),
('Shenzhen', (SELECT id FROM public.countries WHERE code = 'CN'), 13000000, 22.5431, 114.0579, false, true, 'Asia/Shanghai'),

-- Cyprus
('Nicosia', (SELECT id FROM public.countries WHERE code = 'CY'), 330000, 35.1856, 33.3823, true, true, 'Asia/Nicosia'),

-- Georgia
('Tbilisi', (SELECT id FROM public.countries WHERE code = 'GE'), 1200000, 41.7151, 44.8271, true, true, 'Asia/Tbilisi'),

-- India
('New Delhi', (SELECT id FROM public.countries WHERE code = 'IN'), 32000000, 28.6139, 77.2090, true, true, 'Asia/Kolkata'),
('Mumbai', (SELECT id FROM public.countries WHERE code = 'IN'), 21000000, 19.0760, 72.8777, false, true, 'Asia/Kolkata'),
('Bangalore', (SELECT id FROM public.countries WHERE code = 'IN'), 12000000, 12.9716, 77.5946, false, true, 'Asia/Kolkata'),
('Kolkata', (SELECT id FROM public.countries WHERE code = 'IN'), 15000000, 22.5726, 88.3639, false, true, 'Asia/Kolkata'),
('Chennai', (SELECT id FROM public.countries WHERE code = 'IN'), 11000000, 13.0827, 80.2707, false, true, 'Asia/Kolkata'),

-- Indonesia
('Jakarta', (SELECT id FROM public.countries WHERE code = 'ID'), 35000000, -6.2088, 106.8456, true, true, 'Asia/Jakarta'),
('Surabaya', (SELECT id FROM public.countries WHERE code = 'ID'), 3000000, -7.2575, 112.7521, false, true, 'Asia/Jakarta'),
('Bandung', (SELECT id FROM public.countries WHERE code = 'ID'), 2500000, -6.9175, 107.6191, false, true, 'Asia/Jakarta'),

-- Iran
('Tehran', (SELECT id FROM public.countries WHERE code = 'IR'), 15000000, 35.6892, 51.3890, true, true, 'Asia/Tehran'),
('Mashhad', (SELECT id FROM public.countries WHERE code = 'IR'), 3000000, 36.2605, 59.6168, false, true, 'Asia/Tehran'),
('Isfahan', (SELECT id FROM public.countries WHERE code = 'IR'), 2000000, 32.6546, 51.6680, false, true, 'Asia/Tehran'),

-- Iraq
('Baghdad', (SELECT id FROM public.countries WHERE code = 'IQ'), 8000000, 33.3152, 44.3661, true, true, 'Asia/Baghdad'),
('Basra', (SELECT id FROM public.countries WHERE code = 'IQ'), 1500000, 30.5086, 47.7848, false, true, 'Asia/Baghdad'),

-- Israel
('Jerusalem', (SELECT id FROM public.countries WHERE code = 'IL'), 950000, 31.7683, 35.2137, true, true, 'Asia/Jerusalem'),
('Tel Aviv', (SELECT id FROM public.countries WHERE code = 'IL'), 460000, 32.0853, 34.7818, false, true, 'Asia/Jerusalem'),

-- Japan
('Tokyo', (SELECT id FROM public.countries WHERE code = 'JP'), 38000000, 35.6762, 139.6503, true, true, 'Asia/Tokyo'),
('Osaka', (SELECT id FROM public.countries WHERE code = 'JP'), 2700000, 34.6937, 135.5023, false, true, 'Asia/Tokyo'),
('Yokohama', (SELECT id FROM public.countries WHERE code = 'JP'), 3700000, 35.4438, 139.6380, false, true, 'Asia/Tokyo'),

-- Jordan
('Amman', (SELECT id FROM public.countries WHERE code = 'JO'), 2000000, 31.9539, 35.9106, true, true, 'Asia/Amman'),

-- Kazakhstan
('Nur-Sultan', (SELECT id FROM public.countries WHERE code = 'KZ'), 1200000, 51.1801, 71.4460, true, true, 'Asia/Almaty'),
('Almaty', (SELECT id FROM public.countries WHERE code = 'KZ'), 2000000, 43.2551, 76.9126, false, true, 'Asia/Almaty'),

-- Kuwait
('Kuwait City', (SELECT id FROM public.countries WHERE code = 'KW'), 3000000, 29.3759, 47.9774, true, true, 'Asia/Kuwait'),

-- Kyrgyzstan
('Bishkek', (SELECT id FROM public.countries WHERE code = 'KG'), 1000000, 42.8746, 74.5698, true, true, 'Asia/Bishkek'),

-- Laos
('Vientiane', (SELECT id FROM public.countries WHERE code = 'LA'), 850000, 17.9757, 102.6331, true, true, 'Asia/Vientiane'),

-- Lebanon
('Beirut', (SELECT id FROM public.countries WHERE code = 'LB'), 2500000, 33.8938, 35.5018, true, true, 'Asia/Beirut'),

-- Malaysia
('Kuala Lumpur', (SELECT id FROM public.countries WHERE code = 'MY'), 8000000, 3.1390, 101.6869, true, true, 'Asia/Kuala_Lumpur'),

-- Maldives
('Malé', (SELECT id FROM public.countries WHERE code = 'MV'), 180000, 4.1755, 73.5093, true, true, 'Indian/Maldives'),

-- Mongolia
('Ulaanbaatar', (SELECT id FROM public.countries WHERE code = 'MN'), 1500000, 47.8864, 106.9057, true, true, 'Asia/Ulaanbaatar'),

-- Myanmar
('Naypyidaw', (SELECT id FROM public.countries WHERE code = 'MM'), 1200000, 19.7633, 96.0785, true, true, 'Asia/Yangon'),
('Yangon', (SELECT id FROM public.countries WHERE code = 'MM'), 5500000, 16.8661, 96.1951, false, true, 'Asia/Yangon'),

-- Nepal
('Kathmandu', (SELECT id FROM public.countries WHERE code = 'NP'), 1500000, 27.7172, 85.3240, true, true, 'Asia/Kathmandu'),

-- North Korea
('Pyongyang', (SELECT id FROM public.countries WHERE code = 'KP'), 3000000, 39.0392, 125.7625, true, true, 'Asia/Pyongyang'),

-- Oman
('Muscat', (SELECT id FROM public.countries WHERE code = 'OM'), 1500000, 23.5859, 58.4059, true, true, 'Asia/Muscat'),

-- Pakistan
('Islamabad', (SELECT id FROM public.countries WHERE code = 'PK'), 1200000, 33.7294, 73.0931, true, false, 'Asia/Karachi'),
('Karachi', (SELECT id FROM public.countries WHERE code = 'PK'), 16000000, 24.8607, 67.0011, false, true, 'Asia/Karachi'),
('Lahore', (SELECT id FROM public.countries WHERE code = 'PK'), 12000000, 31.5204, 74.3587, false, true, 'Asia/Karachi'),

-- Palestine
('Ramallah', (SELECT id FROM public.countries WHERE code = 'PS'), 38000, 31.9073, 35.2044, true, false, 'Asia/Gaza'),
('Gaza', (SELECT id FROM public.countries WHERE code = 'PS'), 700000, 31.3547, 34.3088, false, true, 'Asia/Gaza'),

-- Philippines
('Manila', (SELECT id FROM public.countries WHERE code = 'PH'), 25000000, 14.5995, 120.9842, true, true, 'Asia/Manila'),
('Cebu City', (SELECT id FROM public.countries WHERE code = 'PH'), 1000000, 10.3157, 123.8854, false, true, 'Asia/Manila'),

-- Qatar
('Doha', (SELECT id FROM public.countries WHERE code = 'QA'), 2500000, 25.2854, 51.5310, true, true, 'Asia/Qatar'),

-- Saudi Arabia
('Riyadh', (SELECT id FROM public.countries WHERE code = 'SA'), 7000000, 24.7136, 46.6753, true, true, 'Asia/Riyadh'),
('Jeddah', (SELECT id FROM public.countries WHERE code = 'SA'), 4000000, 21.4858, 39.1925, false, true, 'Asia/Riyadh'),
('Mecca', (SELECT id FROM public.countries WHERE code = 'SA'), 2000000, 21.3891, 39.8579, false, true, 'Asia/Riyadh'),

-- Singapore
('Singapore', (SELECT id FROM public.countries WHERE code = 'SG'), 6000000, 1.3521, 103.8198, true, true, 'Asia/Singapore'),

-- South Korea
('Seoul', (SELECT id FROM public.countries WHERE code = 'KR'), 25000000, 37.5665, 126.9780, true, true, 'Asia/Seoul'),
('Busan', (SELECT id FROM public.countries WHERE code = 'KR'), 3500000, 35.1796, 129.0756, false, true, 'Asia/Seoul'),

-- Sri Lanka
('Sri Jayawardenepura Kotte', (SELECT id FROM public.countries WHERE code = 'LK'), 115000, 6.9271, 79.8612, true, false, 'Asia/Colombo'),
('Colombo', (SELECT id FROM public.countries WHERE code = 'LK'), 750000, 6.9271, 79.8612, false, true, 'Asia/Colombo'),

-- Syria
('Damascus', (SELECT id FROM public.countries WHERE code = 'SY'), 2500000, 33.5138, 36.2765, true, true, 'Asia/Damascus'),
('Aleppo', (SELECT id FROM public.countries WHERE code = 'SY'), 2000000, 36.2021, 37.1343, false, true, 'Asia/Damascus'),

-- Taiwan
('Taipei', (SELECT id FROM public.countries WHERE code = 'TW'), 7000000, 25.0330, 121.5654, true, true, 'Asia/Taipei'),

-- Tajikistan
('Dushanbe', (SELECT id FROM public.countries WHERE code = 'TJ'), 900000, 38.5598, 68.7870, true, true, 'Asia/Dushanbe'),

-- Thailand
('Bangkok', (SELECT id FROM public.countries WHERE code = 'TH'), 11000000, 13.7563, 100.5018, true, true, 'Asia/Bangkok'),

-- Timor-Leste
('Dili', (SELECT id FROM public.countries WHERE code = 'TL'), 280000, -8.5569, 125.5603, true, true, 'Asia/Dili'),

-- Turkey
('Ankara', (SELECT id FROM public.countries WHERE code = 'TR'), 5500000, 39.9334, 32.8597, true, true, 'Europe/Istanbul'),
('Istanbul', (SELECT id FROM public.countries WHERE code = 'TR'), 15000000, 41.0082, 28.9784, false, true, 'Europe/Istanbul'),

-- Turkmenistan
('Ashgabat', (SELECT id FROM public.countries WHERE code = 'TM'), 900000, 37.9601, 58.3261, true, true, 'Asia/Ashgabat'),

-- United Arab Emirates
('Abu Dhabi', (SELECT id FROM public.countries WHERE code = 'AE'), 1500000, 24.4539, 54.3773, true, true, 'Asia/Dubai'),
('Dubai', (SELECT id FROM public.countries WHERE code = 'AE'), 3500000, 25.2048, 55.2708, false, true, 'Asia/Dubai'),

-- Uzbekistan
('Tashkent', (SELECT id FROM public.countries WHERE code = 'UZ'), 2500000, 41.2995, 69.2401, true, true, 'Asia/Tashkent'),

-- Vietnam
('Hanoi', (SELECT id FROM public.countries WHERE code = 'VN'), 8000000, 21.0285, 105.8542, true, true, 'Asia/Ho_Chi_Minh'),
('Ho Chi Minh City', (SELECT id FROM public.countries WHERE code = 'VN'), 9000000, 10.8231, 106.6297, false, true, 'Asia/Ho_Chi_Minh'),

-- Yemen
('Sana''a', (SELECT id FROM public.countries WHERE code = 'YE'), 3000000, 15.3547, 44.2066, true, true, 'Asia/Aden');