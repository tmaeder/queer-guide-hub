import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('source_evidence', Path(__file__).with_name('verify-event-source-evidence.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SourceEvidenceTests(unittest.TestCase):
    def test_private_destination_and_credential_urls_are_rejected(self):
        with self.assertRaises(ValueError):
            module.public_url('https://user:password@example.org/')
        with patch.object(module.socket, 'getaddrinfo', return_value=[(2,1,6,'',('127.0.0.1',443))]):
            with self.assertRaises(ValueError):
                module.public_url('https://example.org/')

    def test_scripts_cannot_supply_the_identity_match(self):
        parser = module.Text()
        parser.feed('<title>Unknown page</title><script>Fictional Pride</script><p>Real content</p>')
        self.assertNotIn('Fictional Pride', ' '.join(parser.parts))
        self.assertIn('Real content', ' '.join(parser.parts))

    def test_public_page_proof_never_claims_edition_dates(self):
        class Response:
            headers = {'Content-Type':'text/html'}
            status = 200
            url = 'https://example.org/pride/'
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return b'<title>Fixture Pride</title><p>Fixture Pride organizer</p>'
        class Opener:
            def open(self, *args, **kwargs): return Response()
        with patch.object(module, 'public_url', side_effect=lambda url: url), patch.object(module.urllib.request, 'build_opener', return_value=Opener()):
            proof = module.verify({'candidate_url':'https://example.org/pride/','identity_term':'Fixture Pride'})
        self.assertEqual(proof['status'], 'verified')
        self.assertFalse(proof['dates_confirmed'])
        self.assertEqual(proof['scope'], 'series_identity')
        self.assertEqual(len(proof['content_sha256']), 64)


if __name__ == '__main__':
    unittest.main()
