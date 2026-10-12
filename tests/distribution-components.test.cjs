const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
test('execution profiles bind existing tool and asset identities with qualified platform scope', () => {
  for (const name of ['chip', 'godot', 'pcb', 'freecad', 'cuda']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'packs', name, 'harness-pack.json')));
    assert.ok(manifest.executionProfiles.length);
    const tools = new Set(manifest.provider.tools.map(t => t.id));
    const assets = new Set((manifest.runtimeAssets || []).map(a => a.id));
    for (const p of manifest.executionProfiles) {
      assert.ok(['native', 'container', 'remote'].includes(p.kind));
      assert.equal(typeof p.qualified, 'boolean');
      assert.ok(p.platforms.length);
      for (const id of p.toolIds) assert.ok(tools.has(id), id);
      for (const id of p.assetIds) assert.ok(assets.has(id), id);
      if (p.qualified) assert.ok(p.toolIds.length);
    }
    for (const a of manifest.runtimeAssets || []) {
      if (a.type.startsWith('macos-app-')) {
        assert.ok(a.discoveryPaths.some(p => p.startsWith('/Applications/')));
        assert.ok(a.installUrl.startsWith('https://'));
      }
    }
  }
  const chip = require('../packs/chip/harness-pack.json');
  const native = chip.executionProfiles.find(p => p.kind === 'native');
  assert.equal(native.qualified, false);
  assert.deepEqual(native.toolIds, []);
  const pcb = require('../packs/pcb/harness-pack.json');
  assert.ok(pcb.executionProfiles.find(p => p.kind === 'native').toolIds.every(id => id.startsWith('pcb.kicad.')));
});
test('component partition excludes software payloads and preserves nested skills', () => {
  execFileSync('python3', ['-c', `
import importlib.util
spec=importlib.util.spec_from_file_location('components','scripts/package-components.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
assert m.component_for('skills/example/SKILL.md') == 'skills'
assert m.component_for('eda-harness/skills/eda-core/SKILL.md') == 'skills'
assert m.component_for('bridge/runtime.cjs') == 'bridge'
assert m.component_for('server/native.py') == 'bridge'
assert m.component_for('runtime/verifier.cjs') == 'source'
assert m.component_for('images/Dockerfile.runtime') == 'source'
for p in ['Godot.app/Contents/MacOS/Godot','software.dmg','image.tar','runtime.zip','../escape','node_modules/pkg/a.js']:
 try: m.component_for(p)
 except ValueError: pass
 else: raise AssertionError(p)
`], { cwd: root });
});
test('MCP distribution entries preserve the existing protected gateway implementation', () => {
  const consumer = require('../lib/consumer.cjs');
  for (const name of ['chip', 'pcb', 'godot']) {
    const manifest = require('../packs/' + name + '/harness-pack.json');
    const facade = require('../packs/' + name + '/mcp/index.cjs');
    const loaded = consumer.gatewayAdapter(manifest.provider);
    assert.equal(loaded.providerRuntime, facade.providerRuntime);
    assert.equal(loaded.gatewayConfig, facade.gatewayConfig);
  }
});
test('committed component release round-trips real bridge calls and rejects lock substitution', () => {
  execFileSync('python3', ['-c', `
import importlib.util, json, tempfile, subprocess, hashlib, tarfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('components','scripts/package-components.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as tmp:
 root=Path(tmp); m.ROOT=root
 def write(p,s):
  target=root/p; target.parent.mkdir(parents=True,exist_ok=True); target.write_text(s)
 def git(*args): return subprocess.check_output(['git',*args],cwd=root)
 manifest={'version':'1.0.0','provider':{'tools':[{'id':'test.inspect'}]},'executionProfiles':[{'id':'native','kind':'native','qualified':True,'platforms':['linux-x64'],'toolIds':['test.inspect'],'assetIds':[]}]}
 write('packs/chip/pack.json',json.dumps({'id':'chip-pack','sourceVersion':'1.0.0'}))
 write('packs/chip/harness-pack.json',json.dumps(manifest))
 write('packs/chip/skills/test/SKILL.md','# Skill')
 write('packs/chip/runtime/worker.cjs','exports.run = x => x + 1;')
 write('packs/chip/mcp/index.cjs','module.exports = require("../runtime/worker.cjs");')
 write('LICENSE','fixture license'); write('THIRD_PARTY_NOTICES.md','fixture provenance')
 write('package.json','{}'); write('package-lock.json','{}')
 files={str(p.relative_to(root)):m.digest(p.read_bytes()) for p in sorted((root/'packs').rglob('*')) if p.is_file()}
 write('content-lock.json',json.dumps({'files':files,'contentSha256':m.digest(json.dumps(files,separators=(',',':')).encode())}))
 git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture')
 result=m.package('chip',root/'release')
 index=json.loads(Path(result['index']).read_text())
 assert index['executionProfiles']==manifest['executionProfiles']
 subprocess.check_call(['node','-e','const api=require(process.argv[1]);const release=api.inspectComponentRelease(process.argv[2],process.argv[3]);if(release.components.length!==3)throw Error("missing components")',str(Path.cwd()/'lib/distribution.cjs'),result['index'],result['sha256']])
 assert {x['id'] for x in index['components']}=={'source','skills','bridge'}
 assembled=root/'assembled';assembled.mkdir()
 for component in index['components']:
  archive=root/'release'/component['file'];assert m.digest(archive.read_bytes())==component['sha256']
  with tarfile.open(archive) as tar:
   for member in tar.getmembers():
    assert member.isfile() and not member.name.startswith('/') and '..' not in Path(member.name).parts
    target=assembled/member.name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(tar.extractfile(member).read())
 assert subprocess.check_output(['node','-e','process.stdout.write(String(require(process.argv[1]).run(4)))',str(assembled/'packs/chip/mcp/index.cjs')]).decode()=='5'
 # Working-tree changes cannot replace reviewed Git bytes.
 write('packs/chip/runtime/worker.cjs','throw Error("dirty")')
 again=m.package('chip',root/'repeat');assert again['components']==result['components']
 # A committed substituted source with a stale lock fails closed.
 git('add','packs/chip/runtime/worker.cjs');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','bad source')
 try:m.package('chip',root/'invalid')
 except ValueError as e:assert 'Content lock mismatch' in str(e)
 else:raise AssertionError('substitution accepted')
`], { cwd: root });
});
