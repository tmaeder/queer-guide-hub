import copy
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('overture', pathlib.Path(__file__).with_name('collect-overture-contact-evidence.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ContactEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.venue = dict(name='B2 Hotel Zürich', city_name='Zurich', country_code='CH', latitude=47.36, longitude=8.53, address='Brandschenkestrasse 152')
        self.place = dict(id='real-source-id', names={'primary': 'B2 Hotel Zurich'}, latitude=47.36, longitude=8.53,
                          addresses=[dict(country='CH', freeform='Brandschenkestrasse 152')], confidence=.99,
                          operating_status='open', websites=['https://www.b2hotel.ch/'], sources=[dict(license='CDLA-Permissive-2.0')])

    def test_corroborated_unique_identity(self):
        self.assertEqual(module.positive_match(self.venue, [self.place], True), self.place)

    def test_truncated_window_never_establishes_uniqueness(self):
        self.assertIsNone(module.positive_match(self.venue, [self.place], False))

    def test_second_closed_or_contactless_namesake_still_blocks(self):
        for overrides in [dict(operating_status='closed'), dict(websites=[]), dict(confidence=.1)]:
            other = {**self.place, **overrides, 'id': 'another-record'}
            self.assertIsNone(module.positive_match(self.venue, [self.place, other], True))

    def test_country_address_and_distance_must_all_agree(self):
        for overrides in [dict(addresses=[dict(country='DE', freeform=self.venue['address'])]),
                          dict(addresses=[dict(country='CH', freeform='Otherstrasse 152')]), dict(latitude=47.38)]:
            self.assertIsNone(module.positive_match(self.venue, [{**self.place, **overrides}], True))

    def test_address_numbers_are_complete_tokens(self):
        other = copy.deepcopy(self.place)
        other['addresses'][0]['freeform'] = 'Brandschenkestrasse 1520'
        self.assertFalse(module.identity_matches(self.venue, other))

    def test_unknown_closed_low_confidence_or_missing_license_is_not_positive(self):
        for overrides in [dict(operating_status=None), dict(operating_status='closed'), dict(confidence=.8),
                          dict(sources=[]), dict(sources=[dict(license='unknown')])]:
            self.assertIsNone(module.positive_match(self.venue, [{**self.place, **overrides}], True))

    def test_distinct_websites_require_further_evidence(self):
        self.assertIsNone(module.positive_match(self.venue, [{**self.place, 'websites': ['https://one.example', 'https://two.example']}], True))

    def test_polar_longitude_margin_must_cover_the_matching_radius(self):
        venue = dict(latitude=80, longitude=15)
        self.assertFalse(module.window_contains_radius(venue, [14.998, 79.999, 15.002, 80.001]))
        self.assertTrue(module.window_contains_radius(venue, [14.996, 79.999, 15.004, 80.001]))

    def test_non_latin_names_are_preserved_for_identity_matching(self):
        self.assertEqual(module.normalized('ホテル Sunshine'), 'ホテル sunshine')
        self.assertNotEqual(module.normalized('ホテル Sunshine'), module.normalized('クラブ Sunshine'))

    def test_live_name_and_street_are_both_required(self):
        for title, body, expected in [
            ('B2 Boutique Hotel Zurich', '<p>Brandschenkestrasse 152</p>', (True, True)),
            ('Unrelated Casino', '<p>Brandschenkestrasse 152</p>', (False, True)),
            ('B2 Boutique Hotel Zurich', '<p>Another street 152</p>', (True, False)),
        ]:
            identity = module.website_identity(self.venue, self.place, title, body)
            self.assertEqual((identity['name_match'], identity['street_match']), expected)

    def test_reused_brand_word_with_a_different_address_is_insufficient(self):
        venue = dict(name='Myriad Gastropub', city_name='San Francisco', country_code='US', address='2491 Mission Street')
        place = dict(addresses=[dict(country='US', freeform='2491 Mission St')])
        result = module.website_identity(venue, place, 'Myriad Hospitality Solutions', '<p>1300 Other Avenue</p>')
        self.assertTrue(result['name_match'])
        self.assertFalse(result['street_match'])


if __name__ == '__main__':
    unittest.main()
