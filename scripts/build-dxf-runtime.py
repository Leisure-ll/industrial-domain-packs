#!/usr/bin/env python3
"""Maintainer-only build. No package manager runs on the end user's machine."""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-root', type=Path, default=root)
parser.add_argument('--tag', default='industrial-cad-dxf:20261012')
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix='industrial-dxf-build-') as directory:
    context = Path(directory)
    lock = root / 'packs/freecad/images/dxf-requirements.txt'
    subprocess.run(['uv', 'pip', 'install', '--target', str(context / 'site'), '--python-platform', 'x86_64-manylinux_2_28', '--python-version', '3.13', '--require-hashes', '--only-binary', ':all:', '-r', str(lock)], check=True)
    shutil.copy(lock, context / 'dxf-requirements.txt')
    shutil.copy(args.source_root / 'packs/freecad/runtime/dxf-native.py', context / 'dxf-native.py')
    shutil.copy(root / 'packs/freecad/images/Dockerfile.dxf', context / 'Dockerfile')
    subprocess.run(['docker', 'build', '--platform', 'linux/amd64', '--network', 'none', '--provenance=false', '-t', args.tag, str(context)], check=True)
