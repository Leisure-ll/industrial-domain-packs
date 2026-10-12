import hashlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error
from email.message import Message

spec = importlib.util.spec_from_file_location('verifier', Path(__file__).parents[1] / 'scripts/verify-harbor-artifact.py')
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class RegistryVerification(unittest.TestCase):
    def test_rejects_previous_truncated_kicad_digest(self):
        with self.assertRaises(ValueError):
            verifier.validate_digest('sha256:ef4dcd4278c46d3efcd2888db273d5957d68efda0286bf79b4811fc5302dc68')

    def test_hashes_complete_download_and_rejects_wrong_bytes(self):
        registry = verifier.PublicRegistry('https://registry.example', 'public/runtime')
        data = b'complete immutable bytes'
        digest = 'sha256:' + hashlib.sha256(data).hexdigest()
        registry.request = lambda *args: io.BytesIO(data)
        self.assertEqual(registry.blob(digest, len(data))['size'], len(data))
        with self.assertRaises(ValueError):
            registry.blob('sha256:' + '0' * 64, len(data))
        with self.assertRaises(ValueError):
            registry.blob(digest, len(data) + 1)

    def test_ranges_cover_all_bytes_and_validate_exact_offsets(self):
        data = b'a' * (16 * 1024 * 1024) + b'final bytes'
        digest = 'sha256:' + hashlib.sha256(data).hexdigest()
        class Response(io.BytesIO):
            status = 206
        registry = verifier.PublicRegistry('https://registry.example', 'public/runtime', jobs=2)
        def request(kind, reference, headers):
            begin, end = map(int, headers['Range'][6:].split('-'))
            response = Response(data[begin:end + 1])
            response.headers = {'Content-Range': f'bytes {begin}-{end}/{len(data)}'}
            return response
        registry.request = request
        self.assertEqual(registry.blob(digest, len(data))['digest'], digest)
        def wrong_range(kind, reference, headers):
            response = request(kind, reference, headers)
            response.headers['Content-Range'] = 'bytes 1-8/10'
            return response
        registry.request = wrong_range
        with self.assertRaisesRegex(ValueError, 'exact range'):
            registry.blob(digest, len(data))

    def test_credentials_never_follow_an_insecure_token_realm(self):
        registry = verifier.PublicRegistry('https://registry.example', 'private/runtime', ('robot', 'secret'))
        headers = Message()
        headers['WWW-Authenticate'] = 'Bearer realm="http://registry.example/service/token",service="harbor-registry"'
        error = urllib.error.HTTPError('https://registry.example/v2/', 401, 'Unauthorized', headers, None)
        with patch.object(verifier.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaisesRegex(ValueError, 'token realm'):
                registry.request('manifests', 'sha256:' + '0' * 64)

    def test_manifest_digest_binds_descriptors(self):
        class Response(io.BytesIO):
            headers = {}
        registry = verifier.PublicRegistry('https://registry.example', 'public/runtime')
        registry.request = lambda *args: Response(b'{"schemaVersion":2}')
        with self.assertRaisesRegex(ValueError, 'Manifest digest mismatch'):
            registry.manifest('sha256:' + '0' * 64)


if __name__ == '__main__':
    unittest.main()
