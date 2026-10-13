"""Generate immutable component archives and release index from one Git commit.

No software payloads are embedded. Existing manifests and content-lock are the
only declarations; this is a generated release view, not another source catalog.
"""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
COMPONENTS = ('source', 'skills', 'bridge')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def component_for(relative):
    parts = PurePosixPath(relative).parts
    if not parts or PurePosixPath(relative).is_absolute() or '..' in parts:
        raise ValueError('Unsafe source path: ' + relative)
    # Recipes remain source; installed apps, binaries, archives and image layers do not.
    if any(p in {'.git', 'node_modules', '.venv', '__pycache__', 'dist', 'output'} or p.endswith('.app') for p in parts):
        raise ValueError('Software/cache payload cannot enter a component: ' + relative)
    if relative.lower().endswith(('.dmg', '.zip', '.tar', '.tar.gz', '.tgz', '.exe', '.dll', '.dylib', '.so', '.pyc', '.oci')):
        raise ValueError('Software/archive payload cannot enter a component: ' + relative)
    if 'skills' in parts:
        return 'skills'
    if parts[0] in {'bridge', 'server', 'mcp'}:
        return 'bridge'
    return 'source'


def validate_profiles(manifest):
    if manifest.get('provider') and not manifest.get('executionProfiles'):
        raise ValueError('Executable v2 release requires executionProfiles')
    tools = {t['id'] for t in manifest.get('provider', {}).get('tools', [])}
    assets = {a['id'] for a in manifest.get('runtimeAssets', [])}
    seen = set()
    for profile in manifest.get('executionProfiles', []):
        if profile['id'] in seen:
            raise ValueError('Duplicate execution profile')
        seen.add(profile['id'])
        if profile['kind'] not in {'native', 'container', 'remote'} or not isinstance(profile['qualified'], bool):
            raise ValueError('Invalid execution profile')
        if not profile['platforms'] or set(profile['toolIds']) - tools or set(profile['assetIds']) - assets:
            raise ValueError('Unbound execution profile')
        if profile['qualified'] and not profile['toolIds']:
            raise ValueError('Qualified profile has no tools')
    for asset in manifest.get('runtimeAssets', []):
        if asset['type'].startswith('macos-app-'):
            if not asset.get('discoveryPaths') or not asset.get('installUrl', '').startswith('https://'):
                raise ValueError('Native application requires discovery and official install entry')


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def write_archive(target, entries):
    with target.open('xb') as raw:
        with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w', format=tarfile.PAX_FORMAT) as tar:
                for name, data, mode in sorted(entries):
                    item = tarfile.TarInfo(name)
                    item.size, item.mode = len(data), mode
                    tar.addfile(item, io.BytesIO(data))
    return digest(target.read_bytes())


def package(pack, output, ref='HEAD'):
    if not re.fullmatch(r'[a-z][a-z0-9-]*', pack):
        raise ValueError('Use a trusted Pack name')
    commit = git('rev-parse', '--verify', ref + '^{commit}').decode().strip()
    prefix = f'packs/{pack}/'
    read = lambda name: git('show', f'{commit}:{name}')
    catalog = json.loads(read(prefix + 'pack.json'))
    manifest = json.loads(read(prefix + 'harness-pack.json'))
    validate_profiles(manifest)
    lock = json.loads(read('content-lock.json'))
    if digest(json.dumps(lock['files'], separators=(',', ':'), ensure_ascii=False).encode()) != lock['contentSha256']:
        raise ValueError('Invalid content lock identity')
    groups = {kind: [] for kind in COMPONENTS}
    # Lock-covered sources plus shared runtime adapters; never recursively scan a host.
    for name, expected in sorted(lock['files'].items()):
        if not (name.startswith(prefix) or name.startswith('lib/') or name.startswith('mcp/')):
            continue
        data = read(name)
        if digest(data) != expected:
            raise ValueError('Content lock mismatch: ' + name)
        relative = name[len(prefix):] if name.startswith(prefix) else 'repository-shared/' + name
        kind = component_for(relative)
        mode = git('ls-tree', commit, '--', name).decode().split()[0]
        if mode not in {'100644', '100755'}:
            raise ValueError('Only regular source files may ship: ' + name)
        groups[kind].append((name, data, 0o755 if mode == '100755' else 0o644))
    for name in ['package.json', 'package-lock.json', 'content-lock.json']:
        groups['source'].append((name, read(name), 0o644))
    notices = []
    for name in ['LICENSE', 'THIRD_PARTY_NOTICES.md']:
        notices.append(('repository-notices/' + name, read(name), 0o644))
    for record in git('ls-tree', '-r', '--name-only', commit, '--', 'licenses', 'provenance').decode().splitlines():
        notices.append(('repository-notices/' + record, read(record), 0o644))
    output.mkdir(parents=True, exist_ok=True)
    components = []
    for kind, entries in groups.items():
        if not entries:
            continue
        files = [{'path': name, 'sha256': digest(data), 'sizeBytes': len(data)} for name, data, _ in entries]
        payload = {'schemaVersion': 2, 'kind': kind, 'packId': catalog['id'], 'sourceCommit': commit,
                   'contentSha256': lock['contentSha256'], 'files': files,
                   'requires': [] if kind == 'source' else ['source']}
        entries = entries + notices + [('component.json', (json.dumps(payload, indent=2) + '\n').encode(), 0o644)]
        archive = output / f'{pack}-{kind}-{commit[:12]}.tar.gz'
        sha = write_archive(archive, entries)
        components.append({'id': kind, 'file': archive.name, 'sha256': sha, 'sizeBytes': archive.stat().st_size,
                           'requires': payload['requires'], 'fileCount': len(files)})
    index = {'schemaVersion': 2, 'kind': 'domain-pack-release', 'packId': catalog['id'],
             'version': manifest.get('version', catalog.get('releaseVersion', catalog['sourceVersion'])),
             'sourceCommit': commit, 'contentSha256': lock['contentSha256'],
             'manifestSha256': digest(read(prefix + 'harness-pack.json')),
             'executionProfiles': manifest.get('executionProfiles', []),
             'runtimeAssets': manifest.get('runtimeAssets', []),
             'components': components,
             'qualification': 'Inherited scope only; component packaging is not native qualification.'}
    target = output / f'{pack}-release-{commit[:12]}.json'
    target.write_text(json.dumps(index, indent=2) + '\n')
    return {'index': str(target), 'sha256': digest(target.read_bytes()), 'components': components}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pack', choices=['chip', 'godot', 'pcb', 'freecad', 'cad', 'cuda'])
    parser.add_argument('--output', type=Path, default=ROOT / 'dist/components')
    parser.add_argument('--ref', default='HEAD', help='Reviewed commit; uncommitted files never enter a release')
    args = parser.parse_args()
    print(json.dumps(package(args.pack, args.output, args.ref)))
