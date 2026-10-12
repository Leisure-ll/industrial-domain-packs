#!/usr/bin/env python3
"""Build a private, relocatable darwin-arm64 DXF runtime; only maintainers need uv."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://github.com/astral-sh/python-build-standalone/releases/download/20260408/cpython-3.13.13%2B20260408-aarch64-apple-darwin-install_only_stripped.tar.gz'
SHA256 = '0a1956c23fcc2a800fc5ffe61632dbade3d8e1b4ab94aeb0cc47e028892cac97'
VERSION = '1.0.1'
hash_file = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=ROOT / 'dist/dxf-native-darwin-arm64.zip')
args = parser.parse_args()
if sys.version_info < (3, 12):
    parser.error('Maintainer build requires Python 3.12+ for safe tar extraction.')
if platform.system() != 'Darwin' or platform.machine() != 'arm64':
    parser.error('Build and qualification require macOS Apple Silicon.')
args.output = args.output.resolve()
args.output.parent.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='dxf-native-build-') as temporary:
    stage = Path(temporary)
    archive = stage / 'python.tar.gz'
    urllib.request.urlretrieve(URL, archive)
    if hash_file(archive) != SHA256:
        raise RuntimeError('Standalone Python archive identity mismatch')
    with tarfile.open(archive) as source:
        source.extractall(stage / 'unpack', filter='data')
    runtime = stage / 'dxf-runtime'
    # Flatten internal interpreter symlinks: archive extraction never needs symlinks.
    shutil.copytree(stage / 'unpack/python', runtime / 'python', symlinks=False)
    site = runtime / 'site'
    lock = ROOT / 'packs/freecad/images/dxf-requirements.txt'
    subprocess.run(['uv', 'pip', 'install', '--no-cache', '--target', str(site), '--python', str(runtime / 'python/bin/python3.13'), '--require-hashes', '--only-binary', ':all:', '-r', str(lock)], check=True)
    # Dependency entry points embed the temporary interpreter path. This runtime
    # exposes only harness-dxf, so remove unused CLIs and their RECORD rows.
    shutil.rmtree(site / 'bin', ignore_errors=True)
    for record in site.glob('*.dist-info/RECORD'):
        record.write_text(''.join(line for line in record.read_text().splitlines(keepends=True) if not line.startswith('bin/')))
    shutil.copyfile(lock, runtime / 'requirements.txt')
    shutil.copyfile(ROOT / 'packs/freecad/runtime/dxf-native.py', runtime / 'dxf-native.py')
    shutil.copyfile(ROOT / 'LICENSE', runtime / 'LICENSE.domain-packs')
    (runtime / 'bin').mkdir()
    launcher = runtime / 'bin/harness-dxf'
    launcher.write_text('''#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec "$ROOT/python/bin/python3.13" -I -B "$ROOT/launcher.py" "$@"
''')
    launcher.chmod(0o755)
    (runtime / 'launcher.py').write_text('''import pathlib, runpy, sys
root = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(root / 'site'))
if sys.argv[1:] == ['--version']:
    import ezdxf
    print('Harness DXF 1.0.1; ezdxf ' + ezdxf.__version__ + '; Python ' + sys.version.split()[0])
elif len(sys.argv) == 3:
    sys.argv[0] = str(root / 'dxf-native.py')
    runpy.run_path(sys.argv[0], run_name='__main__')
else:
    raise SystemExit('Usage: harness-dxf --version | request.json output-directory')
''')
    # Retain all shipped component licenses; no bytecode or mutable install caches.
    for directory in sorted(runtime.rglob('__pycache__'), reverse=True):
        shutil.rmtree(directory)
    provenance = {'schemaVersion': 1, 'version': VERSION, 'platform': 'darwin-arm64',
                  'python': {'version': '3.13.13', 'build': '20260408', 'url': URL, 'sha256': SHA256,
                             'source': 'https://github.com/astral-sh/python-build-standalone/tree/20260408'},
                  'requirementsSha256': hash_file(lock), 'domainEntrySha256': hash_file(runtime / 'dxf-native.py'),
                  'files': {str(p.relative_to(runtime)): hash_file(p) for p in sorted(runtime.rglob('*')) if p.is_file()}}
    (runtime / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    # Relocate before executing so an absolute build-path dependency cannot pass.
    relocated = stage / 'relocated/dxf-runtime'
    relocated.parent.mkdir()
    runtime.rename(relocated)
    version = subprocess.check_output([str(relocated / 'bin/harness-dxf'), '--version'], env={'PATH': '/usr/bin:/bin', 'PYTHONPATH': '/nonexistent', 'PYTHONHOME': '/nonexistent'}, text=True).strip()
    with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for file in sorted(relocated.rglob('*')):
            if file.is_file():
                info = zipfile.ZipInfo('dxf-runtime/' + str(file.relative_to(relocated)), date_time=(2026, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = (0o100755 if os.access(file, os.X_OK) else 0o100644) << 16
                output.writestr(info, file.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    evidence = {'platform': 'darwin-arm64', 'versionText': version, 'sha256': hash_file(args.output), 'size': args.output.stat().st_size,
                'installedSize': sum(p.stat().st_size for p in relocated.rglob('*') if p.is_file()), 'pythonSha256': SHA256,
                'requirementsSha256': hash_file(lock), 'domainEntrySha256': provenance['domainEntrySha256']}
    args.output.with_suffix('.json').write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps(evidence, indent=2))
