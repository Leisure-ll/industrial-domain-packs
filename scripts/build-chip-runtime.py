#!/usr/bin/env python3
"""Build a flattened Chip runtime without redistributing technology libraries."""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-root', type=Path, default=root)
parser.add_argument('--tag', default='industrial-chip-managed:20261012')
parser.add_argument('--base', default='eda-harness-tools:cli-fix-20261003@sha256:3ec494165c53b52b8fed0cf0686e04798ad648bd8282730b5be7d43a9bdb78fe')
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix='industrial-chip-build-') as directory:
    context = Path(directory)
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
