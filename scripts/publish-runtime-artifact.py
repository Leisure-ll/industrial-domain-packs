#!/usr/bin/env python3
"""Publish a NEW immutable tag, then verify every byte from Harbor."""
import argparse
import base64
import json
import urllib.request
import hashlib
import importlib.util
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
import urllib.error

spec = importlib.util.spec_from_file_location('harbor_verify', Path(__file__).with_name('verify-harbor-artifact.py'))
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('destination', help='harbor.pvg2.zhiman.tech/<existing-project>/<repo>:<new-tag>')
source = parser.add_mutually_exclusive_group(required=True)
source.add_argument('--image', help='Existing local maintainer-built Docker image')
source.add_argument('--file', type=Path, help='Native installer to publish unchanged as OCI blob')
parser.add_argument('--transport', choices=['docker', 'oras'], default='docker', help='Use oras for large images when the Docker daemon proxy cannot complete uploads')
parser.add_argument('--verify-jobs', type=int, choices=range(1, 33), default=8, metavar='1..32', help='Bounded concurrent range reads during complete post-publish verification')
parser.add_argument('--sha256', help='Required pinned SHA-256 for --file')
parser.add_argument('--private', action='store_true', help='Existing private project only; verifies registry authorization and preserves privacy')
parser.add_argument('--output', required=True, help='Verification evidence output (never includes credentials)')
args = parser.parse_args()
match = re.fullmatch(r'(harbor\.pvg2\.zhiman\.tech)/([a-z0-9][a-z0-9._/-]*):([A-Za-z0-9_][A-Za-z0-9_.-]{0,127})', args.destination)
if not match:
    parser.error('Expected the specified Harbor host and an explicit new tag')
host, repository, tag = match.groups()
credentials = verify.docker_credentials(host) if args.private else None
if args.private:
    authorization = 'Basic ' + base64.b64encode((credentials[0] + ':' + credentials[1]).encode()).decode()
    request = urllib.request.Request('https://' + host + '/api/v2.0/projects?page_size=100', headers={'Authorization': authorization})
    with urllib.request.urlopen(request, timeout=120) as response:
        projects = json.load(response)
    project = next((p for p in projects if p['name'] == repository.split('/')[0]), None)
    if not project or project.get('metadata', {}).get('public') != 'false':
        parser.error('--private requires an existing project whose metadata.public is false')
registry = verify.PublicRegistry('https://' + host, repository, credentials)
try:
    registry.request('manifests', tag).close()
except urllib.error.HTTPError as error:
    if error.code != 404:
        raise
else:
    parser.error('Destination tag exists; immutable publishing never overwrites it')
if args.file:
    if not args.sha256:
        parser.error('--file requires the expected --sha256 pin')
    verify.validate_digest('sha256:' + args.sha256)
    h = hashlib.sha256()
    with args.file.open('rb') as file:
        while data := file.read(8 * 1024 * 1024):
            h.update(data)
    if h.hexdigest() != args.sha256:
        parser.error('Local file differs from the expected SHA-256')
    subprocess.run(['oras', 'push', '--disable-path-validation', args.destination, str(args.file.resolve()) + ':application/octet-stream'], check=True)
else:
    if args.transport == 'oras':
        with tempfile.TemporaryDirectory(prefix='industrial-publish-') as directory:
            archive = Path(directory) / 'image.tar'
            subprocess.run(['docker', 'save', args.image, '--output', str(archive)], check=True)
            with tarfile.open(archive) as image:
                index = json.load(image.extractfile('index.json'))
            if len(index.get('manifests', [])) != 1:
                parser.error('Expected a single immutable image descriptor in the OCI archive')
            source_digest = verify.validate_digest(index['manifests'][0]['digest'])
            subprocess.run(['oras', 'cp', '--from-oci-layout', str(archive) + '@' + source_digest, args.destination], check=True)
    else:
        subprocess.run(['docker', 'tag', args.image, args.destination], check=True)
        subprocess.run(['docker', 'push', args.destination], check=True)
# Read the manifest using a NEW registry session; private access uses existing credentials.
with verify.PublicRegistry('https://' + host, repository, credentials).request('manifests', tag) as response:
    raw = response.read()
    digest = 'sha256:' + hashlib.sha256(raw).hexdigest()
url = f'https://{host}/v2/{repository}/manifests/{digest}'
subprocess.run(['python3', str(Path(__file__).with_name('verify-harbor-artifact.py')), url, '--output', args.output, '--jobs', str(args.verify_jobs), *(['--docker-credentials'] if args.private else [])], check=True)
