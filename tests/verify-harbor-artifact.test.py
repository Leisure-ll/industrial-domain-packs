import hashlib
import importlib.util
import io
from pathlib import Path
import unittest

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

    def test_manifest_digest_binds_descriptors(self):
        class Response(io.BytesIO):
            headers = {}
        registry = verifier.PublicRegistry('https://registry.example', 'public/runtime')
        registry.request = lambda *args: Response(b'{"schemaVersion":2}')
        with self.assertRaisesRegex(ValueError, 'Manifest digest mismatch'):
            registry.manifest('sha256:' + '0' * 64)


if __name__ == '__main__':
    unittest.main()
