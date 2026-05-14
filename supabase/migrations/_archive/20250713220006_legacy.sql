-- Insert major cities and capitals with proper relationships

-- United States cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Washington D.C.', id, 705749, true, true, 38.9072, -77.0369 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'New York', id, 8336817, false, true, 40.7128, -74.0060 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Los Angeles', id, 3979576, false, true, 34.0522, -118.2437 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Chicago', id, 2693976, false, true, 41.8781, -87.6298 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Houston', id, 2320268, false, true, 29.7604, -95.3698 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Phoenix', id, 1680992, false, true, 33.4484, -112.0740 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Philadelphia', id, 1584064, false, true, 39.9526, -75.1652 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'San Antonio', id, 1547253, false, true, 29.4241, -98.4936 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'San Diego', id, 1423851, false, true, 32.7157, -117.1611 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Dallas', id, 1343573, false, true, 32.7767, -96.7970 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'San Francisco', id, 881549, false, true, 37.7749, -122.4194 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Austin', id, 978908, false, true, 30.2672, -97.7431 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Seattle', id, 749256, false, true, 47.6062, -122.3321 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Denver', id, 715522, false, true, 39.7392, -104.9903 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Boston', id, 695506, false, true, 42.3601, -71.0589 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Las Vegas', id, 651319, false, true, 36.1699, -115.1398 FROM public.countries WHERE code = 'US';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Miami', id, 467963, false, true, 25.7617, -80.1918 FROM public.countries WHERE code = 'US';

-- Canada cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Ottawa', id, 994837, true, true, 45.4215, -75.6972 FROM public.countries WHERE code = 'CA';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Toronto', id, 2794356, false, true, 43.6532, -79.3832 FROM public.countries WHERE code = 'CA';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Montreal', id, 1780000, false, true, 45.5017, -73.5673 FROM public.countries WHERE code = 'CA';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Vancouver', id, 675218, false, true, 49.2827, -123.1207 FROM public.countries WHERE code = 'CA';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Calgary', id, 1336000, false, true, 51.0447, -114.0719 FROM public.countries WHERE code = 'CA';

-- Mexico cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Mexico City', id, 9209944, true, true, 19.4326, -99.1332 FROM public.countries WHERE code = 'MX';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Guadalajara', id, 1385629, false, true, 20.6597, -103.3496 FROM public.countries WHERE code = 'MX';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Monterrey', id, 1135512, false, true, 25.6866, -100.3161 FROM public.countries WHERE code = 'MX';

-- Germany cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Berlin', id, 3669491, true, true, 52.5200, 13.4050 FROM public.countries WHERE code = 'DE';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Hamburg', id, 1899160, false, true, 53.5511, 9.9937 FROM public.countries WHERE code = 'DE';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Munich', id, 1471508, false, true, 48.1351, 11.5820 FROM public.countries WHERE code = 'DE';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Cologne', id, 1085664, false, true, 50.9375, 6.9603 FROM public.countries WHERE code = 'DE';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Frankfurt', id, 753056, false, true, 50.1109, 8.6821 FROM public.countries WHERE code = 'DE';

-- France cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Paris', id, 2161000, true, true, 48.8566, 2.3522 FROM public.countries WHERE code = 'FR';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Marseille', id, 870731, false, true, 43.2965, 5.3698 FROM public.countries WHERE code = 'FR';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Lyon', id, 513275, false, true, 45.7640, 4.8357 FROM public.countries WHERE code = 'FR';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Toulouse', id, 479553, false, true, 43.6047, 1.4442 FROM public.countries WHERE code = 'FR';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Nice', id, 342295, false, true, 43.7102, 7.2620 FROM public.countries WHERE code = 'FR';

-- United Kingdom cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'London', id, 9304016, true, true, 51.5074, -0.1278 FROM public.countries WHERE code = 'GB';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Birmingham', id, 1141816, false, true, 52.4862, -1.8904 FROM public.countries WHERE code = 'GB';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Manchester', id, 547899, false, true, 53.4808, -2.2426 FROM public.countries WHERE code = 'GB';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Liverpool', id, 498042, false, true, 53.4084, -2.9916 FROM public.countries WHERE code = 'GB';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Glasgow', id, 633120, false, true, 55.8642, -4.2518 FROM public.countries WHERE code = 'GB';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Edinburgh', id, 524930, false, true, 55.9533, -3.1883 FROM public.countries WHERE code = 'GB';

-- Italy cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Rome', id, 2872800, true, true, 41.9028, 12.4964 FROM public.countries WHERE code = 'IT';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Milan', id, 1395274, false, true, 45.4642, 9.1900 FROM public.countries WHERE code = 'IT';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Naples', id, 967069, false, true, 40.8518, 14.2681 FROM public.countries WHERE code = 'IT';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Turin', id, 870952, false, true, 45.0703, 7.6869 FROM public.countries WHERE code = 'IT';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Florence', id, 382258, false, true, 43.7696, 11.2558 FROM public.countries WHERE code = 'IT';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Venice', id, 261905, false, true, 45.4408, 12.3155 FROM public.countries WHERE code = 'IT';

-- Spain cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Madrid', id, 3223334, true, true, 40.4168, -3.7038 FROM public.countries WHERE code = 'ES';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Barcelona', id, 1620343, false, true, 41.3851, 2.1734 FROM public.countries WHERE code = 'ES';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Valencia', id, 791413, false, true, 39.4699, -0.3763 FROM public.countries WHERE code = 'ES';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Seville', id, 688711, false, true, 37.3891, -5.9845 FROM public.countries WHERE code = 'ES';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Bilbao', id, 346843, false, true, 43.2630, -2.9350 FROM public.countries WHERE code = 'ES';

-- Russia cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Moscow', id, 12506468, true, true, 55.7558, 37.6176 FROM public.countries WHERE code = 'RU';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Saint Petersburg', id, 5383890, false, true, 59.9311, 30.3609 FROM public.countries WHERE code = 'RU';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Novosibirsk', id, 1625631, false, true, 55.0084, 82.9357 FROM public.countries WHERE code = 'RU';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Yekaterinburg', id, 1493749, false, true, 56.8431, 60.6454 FROM public.countries WHERE code = 'RU';

-- Poland cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Warsaw', id, 1790658, true, true, 52.2297, 21.0122 FROM public.countries WHERE code = 'PL';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Krakow', id, 779115, false, true, 50.0647, 19.9450 FROM public.countries WHERE code = 'PL';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Gdansk', id, 470907, false, true, 54.3520, 18.6466 FROM public.countries WHERE code = 'PL';

-- Netherlands cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Amsterdam', id, 873338, true, true, 52.3676, 4.9041 FROM public.countries WHERE code = 'NL';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Rotterdam', id, 651446, false, true, 51.9244, 4.4777 FROM public.countries WHERE code = 'NL';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'The Hague', id, 548320, false, true, 52.0705, 4.3007 FROM public.countries WHERE code = 'NL';

-- Sweden cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Stockholm', id, 975551, true, true, 59.3293, 18.0686 FROM public.countries WHERE code = 'SE';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Gothenburg', id, 579281, false, true, 57.7089, 11.9746 FROM public.countries WHERE code = 'SE';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Malmö', id, 344166, false, true, 55.6059, 13.0007 FROM public.countries WHERE code = 'SE';

-- Norway cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Oslo', id, 695197, true, true, 59.9139, 10.7522 FROM public.countries WHERE code = 'NO';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Bergen', id, 283929, false, true, 60.3913, 5.3221 FROM public.countries WHERE code = 'NO';

-- China cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Beijing', id, 21542000, true, true, 39.9042, 116.4074 FROM public.countries WHERE code = 'CN';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Shanghai', id, 24870895, false, true, 31.2304, 121.4737 FROM public.countries WHERE code = 'CN';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Guangzhou', id, 15300000, false, true, 23.1291, 113.2644 FROM public.countries WHERE code = 'CN';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Shenzhen', id, 12528300, false, true, 22.5431, 114.0579 FROM public.countries WHERE code = 'CN';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Chengdu', id, 11478108, false, true, 30.6720, 104.0633 FROM public.countries WHERE code = 'CN';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Tianjin', id, 10920000, false, true, 39.3434, 117.3616 FROM public.countries WHERE code = 'CN';

-- Japan cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Tokyo', id, 9273000, true, true, 35.6762, 139.6503 FROM public.countries WHERE code = 'JP';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Osaka', id, 2691185, false, true, 34.6937, 135.5023 FROM public.countries WHERE code = 'JP';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Yokohama', id, 3724844, false, true, 35.4438, 139.6380 FROM public.countries WHERE code = 'JP';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Nagoya', id, 2327557, false, true, 35.1815, 136.9066 FROM public.countries WHERE code = 'JP';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Kyoto', id, 1475183, false, true, 35.0116, 135.7681 FROM public.countries WHERE code = 'JP';

-- South Korea cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Seoul', id, 9776000, true, true, 37.5665, 126.9780 FROM public.countries WHERE code = 'KR';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Busan', id, 3413841, false, true, 35.1796, 129.0756 FROM public.countries WHERE code = 'KR';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Incheon', id, 2954955, false, true, 37.4563, 126.7052 FROM public.countries WHERE code = 'KR';

-- India cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'New Delhi', id, 32941308, true, true, 28.6139, 77.2090 FROM public.countries WHERE code = 'IN';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Mumbai', id, 20667656, false, true, 19.0760, 72.8777 FROM public.countries WHERE code = 'IN';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Kolkata', id, 14974073, false, true, 22.5726, 88.3639 FROM public.countries WHERE code = 'IN';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Chennai', id, 11503293, false, true, 13.0827, 80.2707 FROM public.countries WHERE code = 'IN';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Bangalore', id, 13193035, false, true, 12.9716, 77.5946 FROM public.countries WHERE code = 'IN';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Hyderabad', id, 10268653, false, true, 17.3850, 78.4867 FROM public.countries WHERE code = 'IN';

-- Thailand cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Bangkok', id, 5696409, true, true, 13.7563, 100.5018 FROM public.countries WHERE code = 'TH';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Chiang Mai', id, 131091, false, true, 18.7883, 98.9853 FROM public.countries WHERE code = 'TH';

-- Singapore cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Singapore', id, 5685807, true, true, 1.3521, 103.8198 FROM public.countries WHERE code = 'SG';

-- Indonesia cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Jakarta', id, 10770487, true, true, -6.2088, 106.8456 FROM public.countries WHERE code = 'ID';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Surabaya', id, 2874314, false, true, -7.2575, 112.7521 FROM public.countries WHERE code = 'ID';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Bandung', id, 2444160, false, true, -6.9175, 107.6191 FROM public.countries WHERE code = 'ID';

-- Malaysia cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Kuala Lumpur', id, 1768000, true, true, 3.1390, 101.6869 FROM public.countries WHERE code = 'MY';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'George Town', id, 708127, false, true, 5.4164, 100.3327 FROM public.countries WHERE code = 'MY';

-- Nigeria cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Abuja', id, 3652000, true, true, 9.0765, 7.3986 FROM public.countries WHERE code = 'NG';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Lagos', id, 15946000, false, true, 6.5244, 3.3792 FROM public.countries WHERE code = 'NG';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Kano', id, 4103000, false, true, 12.0022, 8.5920 FROM public.countries WHERE code = 'NG';

-- South Africa cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Cape Town', id, 4710000, true, true, -33.9249, 18.4241 FROM public.countries WHERE code = 'ZA';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Johannesburg', id, 5635127, false, true, -26.2041, 28.0473 FROM public.countries WHERE code = 'ZA';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Durban', id, 3442361, false, true, -29.8587, 31.0218 FROM public.countries WHERE code = 'ZA';

-- Egypt cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Cairo', id, 21322750, true, true, 30.0444, 31.2357 FROM public.countries WHERE code = 'EG';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Alexandria', id, 5381000, false, true, 31.2001, 29.9187 FROM public.countries WHERE code = 'EG';

-- Kenya cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Nairobi', id, 4922000, true, true, -1.2921, 36.8219 FROM public.countries WHERE code = 'KE';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Mombasa', id, 1208333, false, true, -4.0435, 39.6682 FROM public.countries WHERE code = 'KE';

-- Brazil cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Brasília', id, 3055149, true, true, -15.8267, -47.9218 FROM public.countries WHERE code = 'BR';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'São Paulo', id, 12325232, false, true, -23.5558, -46.6396 FROM public.countries WHERE code = 'BR';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Rio de Janeiro', id, 6747815, false, true, -22.9068, -43.1729 FROM public.countries WHERE code = 'BR';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Salvador', id, 2886698, false, true, -12.9714, -38.5014 FROM public.countries WHERE code = 'BR';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Fortaleza', id, 2703391, false, true, -3.7319, -38.5267 FROM public.countries WHERE code = 'BR';

-- Argentina cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Buenos Aires', id, 3054300, true, true, -34.6118, -58.3960 FROM public.countries WHERE code = 'AR';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Córdoba', id, 1454536, false, true, -31.4201, -64.1888 FROM public.countries WHERE code = 'AR';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Rosario', id, 1276000, false, true, -32.9442, -60.6505 FROM public.countries WHERE code = 'AR';

-- Colombia cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Bogotá', id, 7181469, true, true, 4.7110, -74.0721 FROM public.countries WHERE code = 'CO';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Medellín', id, 2569000, false, true, 6.2486, -75.5742 FROM public.countries WHERE code = 'CO';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Cali', id, 2252616, false, true, 3.4516, -76.5320 FROM public.countries WHERE code = 'CO';

-- Chile cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Santiago', id, 5614000, true, true, -33.4489, -70.6693 FROM public.countries WHERE code = 'CL';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Valparaíso', id, 296655, false, true, -33.0458, -71.6197 FROM public.countries WHERE code = 'CL';

-- Australia cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Canberra', id, 431380, true, true, -35.2809, 149.1300 FROM public.countries WHERE code = 'AU';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Sydney', id, 5312163, false, true, -33.8688, 151.2093 FROM public.countries WHERE code = 'AU';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Melbourne', id, 5078193, false, true, -37.8136, 144.9631 FROM public.countries WHERE code = 'AU';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Brisbane', id, 2560720, false, true, -27.4698, 153.0251 FROM public.countries WHERE code = 'AU';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Perth', id, 2085973, false, true, -31.9505, 115.8605 FROM public.countries WHERE code = 'AU';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Adelaide', id, 1345777, false, true, -34.9285, 138.6007 FROM public.countries WHERE code = 'AU';

-- New Zealand cities
INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Wellington', id, 215100, true, true, -41.2865, 174.7762 FROM public.countries WHERE code = 'NZ';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Auckland', id, 1571718, false, true, -36.8485, 174.7633 FROM public.countries WHERE code = 'NZ';

INSERT INTO public.cities (name, country_id, population, is_capital, is_major_city, latitude, longitude)
SELECT 'Christchurch', id, 383200, false, true, -43.5321, 172.6362 FROM public.countries WHERE code = 'NZ';