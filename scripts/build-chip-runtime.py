#!/usr/bin/env python3
"""Build a flattened Chip runtime without redistributing technology libraries."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-root', type=Path, default=root)
parser.add_argument('--tag', default='industrial-chip-managed:20261012')
parser.add_argument('--runtime-base', help='Runner-only update over an already sanitized Harbor image pinned by digest; tools and Python lock must be unchanged')
parser.add_argument('--base', default='eda-harness-tools:cli-fix-20261003@sha256:3ec494165c53b52b8fed0cf0686e04798ad648bd8282730b5be7d43a9bdb78fe')
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix='industrial-chip-build-') as directory:
    context = Path(directory)
    if args.runtime_base:
        if not re.fullmatch(r'harbor\.pvg2\.zhiman\.tech/industrial-runtime-assets/industrial-chip-managed@sha256:[0-9a-f]{64}', args.runtime_base):
            parser.error('--runtime-base requires the immutable sanitized Chip Harbor image')
        requirements = context / 'requirements.txt'
        subprocess.run(['uv', 'export', '--frozen', '--no-dev', '--no-emit-project', '--format', 'requirements-txt', '--directory', str(args.source_root / 'packs/chip/eda-harness'), '--output-file', str(requirements)], check=True, stdout=subprocess.DEVNULL)
        inherited = subprocess.check_output(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'cat', args.runtime_base, '/opt/domain-packs/chip-python-requirements.txt'], text=True)
        normalize = lambda text: '\n'.join(line for line in text.splitlines() if not line.startswith('#'))
        if normalize(inherited) != normalize(requirements.read_text()):
            parser.error('Runner update requires identical locked Python dependencies; perform the full build instead')
        inventory_code = "import hashlib,json; from pathlib import Path; r=Path('/opt/domain-packs/packs/chip/eda-harness/src'); print(json.dumps({str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(r.rglob('*')) if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc'}))"
        inherited_source = json.loads(subprocess.check_output(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', '/opt/chip-python/bin/python3', args.runtime_base, '-I', '-c', inventory_code], text=True))
        source = args.source_root / 'packs/chip/eda-harness/src'
        current_source = {str(p.relative_to(source)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(source.rglob('*')) if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc'}
        if inherited_source != current_source:
            parser.error('Runner update requires identical maintained EDA source; perform the full build instead')
        runner = context / 'managed-native.py'
        shutil.copy(args.source_root / 'packs/chip/runtime/managed-native.py', runner)
        shutil.copy(root / 'scripts/Dockerfile.chip-runner-update', context / 'Dockerfile')
        subprocess.run(['docker', 'build', '--platform', 'linux/amd64', '--network', 'none', '--provenance=false', '--build-arg', 'CHIP_RUNTIME_BASE=' + args.runtime_base, '--build-arg', 'CHIP_RUNNER_SHA256=' + hashlib.sha256(runner.read_bytes()).hexdigest(), '-t', args.tag, str(context)], check=True)
        raise SystemExit(0)
    subprocess.run(['uv', 'python', 'install', 'cpython-3.13.12-linux-x86_64-gnu', '--install-dir', str(context / 'python-download'), '--no-bin'], check=True)
    shutil.copytree(context / 'python-download/cpython-3.13.12-linux-x86_64-gnu', context / 'python', symlinks=True)
    requirements = context / 'requirements.txt'
    subprocess.run(['uv', 'export', '--frozen', '--no-dev', '--no-emit-project', '--format', 'requirements-txt', '--directory', str(args.source_root / 'packs/chip/eda-harness'), '--output-file', str(requirements)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['uv', 'pip', 'install', '--target', str(context / 'site'), '--python-platform', 'x86_64-manylinux_2_28', '--python-version', '3.13', '--require-hashes', '--only-binary', ':all:', '-r', str(requirements)], check=True)
    shutil.copytree(context / 'site', context / 'python/lib/python3.13/site-packages', dirs_exist_ok=True, symlinks=True)
    shutil.copytree(args.source_root / 'packs/chip/eda-harness/src', context / 'src')
    shutil.copy(args.source_root / 'packs/chip/runtime/managed-native.py', context / 'managed-native.py')
    shutil.copy(root / 'packs/chip/images/Dockerfile.managed', context / 'Dockerfile')
    subprocess.run(['docker', 'build', '--platform', 'linux/amd64', '--network', 'none', '--provenance=false', '--build-arg', 'CHIP_BASE=' + args.base, '-t', args.tag, str(context)], check=True)
