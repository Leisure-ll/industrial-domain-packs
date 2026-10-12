#!/usr/bin/env python3
"""Build gateway dependencies over the immutable actor; never run on end users."""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tag', default='industrial-pcb-runtime:gateway-20261012')
parser.add_argument('--base', default='harbor.pvg2.zhiman.tech/industrial-runtime-assets/industrial-pcb-runtime@sha256:d923643d0283640c084a70237c5353f3b6041ece181c7d26dc751a156ae59e7f')
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix='industrial-pcb-build-') as directory:
    context = Path(directory)
    subprocess.run(['uv', 'python', 'install', 'cpython-3.13.12-linux-x86_64-gnu', '--install-dir', str(context / 'python-download'), '--no-bin'], check=True)
    shutil.copytree(context / 'python-download/cpython-3.13.12-linux-x86_64-gnu', context / 'python', symlinks=True)
    requirements = context / 'requirements.txt'
    subprocess.run(['uv', 'export', '--frozen', '--no-dev', '--no-emit-project', '--format', 'requirements-txt', '--directory', str(root / 'packs/pcb'), '--output-file', str(requirements)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['uv', 'pip', 'install', '--target', str(context / 'site'), '--python-platform', 'x86_64-manylinux_2_28', '--python-version', '3.13', '--require-hashes', '--only-binary', ':all:', '-r', str(requirements)], check=True)
    shutil.copytree(context / 'site', context / 'python/lib/python3.13/site-packages', dirs_exist_ok=True, symlinks=True)
    for name in ['uv.lock', 'pyproject.toml']:
        shutil.copy(root / 'packs/pcb' / name, context / name)
    shutil.copy(root / 'scripts/Dockerfile.pcb-gateway', context / 'Dockerfile')
    subprocess.run(['docker', 'build', '--platform', 'linux/amd64', '--network', 'none', '--provenance=false', '--build-arg', 'PCB_BASE=' + args.base, '-t', args.tag, str(context)], check=True)
