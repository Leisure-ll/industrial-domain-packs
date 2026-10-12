const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const host = process.env.DOMAIN_RUNTIME_HOST_ROOT;
const enabled = process.env.QUALIFY_MANAGED_DOMAIN;

// Opt-in native qualification: use the actual consumer factory and real runtimes.
test('managed CAD/Chip use real containers and canonical evidence', {
  skip: !host || !['cad','chip'].includes(enabled) ? 'Set DOMAIN_RUNTIME_HOST_ROOT and QUALIFY_MANAGED_DOMAIN=cad|chip' : false,
  timeout: 600000,
}, async t => {
  const { createProjectRuntime } = require(path.join(host, 'packages/harness-core/src/project-runtime.cjs'));
  const name = enabled === 'cad' ? 'freecad' : 'chip';
  const manifest = require(path.join(root, 'packs', name, 'harness-pack.json'));
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-domain-qualification-'));
  const projectDir = path.join(base, 'project'); fs.mkdirSync(projectDir);
  if (enabled === 'chip') fs.cpSync(path.join(root, 'packs/chip/examples/managed-rtl'), projectDir, { recursive: true });
  const runtimeEnvironment = Object.fromEntries((manifest.runtimeAssets || []).filter(a=>a.type==='docker-image').map(a=>[a.environment,a.image]));
  if (process.env.QUALIFICATION_IMAGE) runtimeEnvironment[enabled==='cad'?'INDUSTRIAL_HARNESS_DXF_IMAGE':'INDUSTRIAL_HARNESS_EDA_IMAGE'] = process.env.QUALIFICATION_IMAGE;
  const factory = createProjectRuntime({ projectDir, domain: enabled, directory: path.join(base, 'state'),
    environment: {...process.env,INDUSTRIAL_HARNESS_CONFIG_DIR:path.join(base,'home')},
    registry: {runtimePacks:[{...manifest,directory:path.join(root,'packs',name),managed:true,runtimeEnvironment}]},
  });
  const runtime = factory.runtime;
  t.after(async()=>{await runtime.close(); fs.rmSync(base,{recursive:true,force:true});});
  async function call(toolId, inputs) {
    const state = await runtime.inspect();
    return runtime.execute({toolId,inputs,expectedStateId:state.id},{approval:true,ownerId:'native-qualification',scope:{domain:enabled,projectId:state.projectId,stateId:state.id,tools:[toolId]}});
  }
  if (enabled === 'cad') {
    const created = await call('cad.dxf.create',{file:'plate.dxf',expectedSha256:null,recipe:{units:'mm',entities:[{type:'circle',center:[10,10],radius:3}]},expect:{units:'mm',circles:[{center:[10,10],diameter:6}]}});
    assert.equal(created.action.status,'completed', JSON.stringify(created)); assert.equal(created.verification.status,'passed');
    const bad = await call('cad.dxf.verify',{file:'plate.dxf',expect:{circles:[{center:[10,10],diameter:7}]}});
    assert.equal(bad.action.status,'completed'); assert.equal(bad.verification.status,'failed');
    const fixed = await call('cad.dxf.verify',{file:'plate.dxf',expect:{circles:[{center:[10,10],diameter:6}]}});
    assert.equal(fixed.verification.status,'passed');
  } else {
    const described = await call('chip.project.describe',{}); assert.equal(described.action.status,'completed',JSON.stringify(described));
    const verified = await call('chip.rtl.verify',{}); assert.equal(verified.verification.status,'passed',JSON.stringify(verified));
    const synthesized = await call('chip.eda.execute',{action:'logic.synthesize'}); assert.equal(synthesized.verification.status,'passed',JSON.stringify(synthesized));
    const file=path.join(projectDir,'counter_tb.sv'); fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('assert(count == 4)', 'assert(count == 3)'));
    const failed = await call('chip.rtl.verify',{}); assert.equal(failed.verification.status,'failed',JSON.stringify(failed));
    fs.copyFileSync(path.join(root,'packs/chip/examples/managed-rtl/counter_tb.sv'),file);
    assert.equal((await call('chip.rtl.verify',{})).verification.status,'passed');
    const previous = new Set(fs.readdirSync(path.join(projectDir,'.harness-runs')));
    const pending = call('chip.rtl.verify',{});
    let entered = false;
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline && !entered) {
      for (const id of fs.readdirSync(path.join(projectDir,'.harness-runs'))) {
        if (!previous.has(id) && fs.existsSync(path.join(projectDir,'.harness-runs',id,'work/project/.eda/runs'))) entered = true;
      }
      if (!entered) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(entered,true,'Native EDA run must enter before cancellation');
    runtime.cancel('native-qualification');
    const cancelled = await pending;
    assert.equal(cancelled.action.status,'failed'); assert.notEqual(cancelled.verification.status,'passed');
    assert.equal((await call('chip.rtl.verify',{})).verification.status,'passed');
  }
});
