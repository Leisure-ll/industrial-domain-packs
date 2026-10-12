const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {verify:dxfVerify,validate,reportIsValid} = require('../packs/freecad/runtime/dxf.cjs');
const {nativeVerifier,managedRtlVerifier} = require('../packs/chip/runtime/managed.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function drawingReport(extrusion = [0,0,1]) {
  return {schemaVersion:1,engine:'ezdxf',engineVersion:'1.4.3',sourceSha256:'a'.repeat(64),
    units:4,entityCount:1,counts:{CIRCLE:1},auditErrors:0,auditFixes:0,
    entities:[{type:'CIRCLE',layer:'0',center:[10,10],centerZ:0,extrusion,radius:3}]};
}
function dxfContext(report=drawingReport()) {
  const bytes=Buffer.from(JSON.stringify(report));
  return {result:{executionSucceeded:true,readbackInputSha256:report.sourceSha256,readbackReportSha256:hash(bytes)},
    artifacts:[{kind:'report.cad.dxf'}],readArtifact:()=>bytes,
    action:{inputs:{expect:{units:'mm',entityCount:1,circles:[{center:[10,10],diameter:6}]}}}};
}
test('DXF fixture requires genuine report shape and exact source/report binding',()=>{
  assert.equal(dxfVerify(dxfContext()).status,'passed');
  for(const change of [c=>c.result.readbackInputSha256='b'.repeat(64),c=>c.result.readbackReportSha256='b'.repeat(64),c=>c.result.cancelled=true,c=>c.result.inputUnchanged=false]) {
    const context=dxfContext();change(context);assert.equal(dxfVerify(context).status,'insufficient_evidence');
  }
  assert.equal(reportIsValid({...drawingReport(),counts:{CIRCLE:2}}),false);
  const malformed=dxfContext();malformed.readArtifact=()=>Buffer.from('{');assert.equal(dxfVerify(malformed).status,'insufficient_evidence');
  assert.equal(dxfVerify(dxfContext({...drawingReport(),schemaVersion:2})).status,'insufficient_evidence');
});
test('DXF fixture distinguishes diameter failure and non-world-XY circles',()=>{
  const context=dxfContext();context.action.inputs.expect.circles[0].diameter=7;assert.equal(dxfVerify(context).status,'failed');
  for(const extrusion of [[1,0,0],[0,0,-1]])for(const tolerance of [0.001,1]) {
    const context=dxfContext(drawingReport(extrusion));context.action.inputs.expect.tolerance=tolerance;assert.equal(dxfVerify(context).status,'failed');
  }
  const elevated=drawingReport();elevated.entities[0].centerZ=1;assert.equal(dxfVerify(dxfContext(elevated)).status,'failed');
});
test('DXF invalid expectation collections cannot silently remove requested checks',()=>{
  for(const expect of [{units:'mm',counts:null},{units:'mm',circles:null},{tolerance:0.01}])assert.throws(()=>validate({file:'drawing.dxf',expect},'verify'));
});
test('DXF sources reject hidden, dependency and evidence storage at every path depth',()=>{
  for(const file of ['.drawing.dxf','.harness/drawing.dxf','drawings/.cache/drawing.dxf',
    'cad-output/drawing.dxf','drawings/cad-output/drawing.dxf','node_modules/drawing.dxf',
    'drawings/__pycache__/drawing.dxf','runtime-identity/drawing.dxf']) {
    assert.throws(()=>validate({file,expect:{units:'mm'}},'verify'),/ordinary visible/);
  }
  assert.doesNotThrow(()=>validate({file:'drawings/plate.v2.dxf',expect:{units:'mm'}},'verify'));
  assert.doesNotThrow(()=>validate({file:'nested/'.repeat(12)+'plate.dxf',expect:{units:'mm'}},'verify'));
  assert.throws(()=>validate({file:'nested/'.repeat(13)+'plate.dxf',expect:{units:'mm'}},'verify'),/12 directory levels/);
});
test('CAD domain inventory tracks DXF independently and rejects symlink or oversized source sets',()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {inspectInputs}=require('../packs/freecad/runtime/index.cjs');
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'cad-input-boundary-'));
  try {
    fs.writeFileSync(path.join(project,'harness.tasks.json'),JSON.stringify({schemaVersion:'1',tasks:{},workspace:{ignore:['drawings']}}));
    fs.mkdirSync(path.join(project,'drawings'));
    fs.writeFileSync(path.join(project,'drawings/plate.dxf'),'original');
    const first=inspectInputs(project).inputHashes;
    assert.equal(first['drawings/plate.dxf'],hash('original'));
    fs.writeFileSync(path.join(project,'drawings/plate.dxf'),'changed');
    assert.notEqual(inspectInputs(project).inputHashes['drawings/plate.dxf'],first['drawings/plate.dxf']);
    fs.symlinkSync('plate.dxf',path.join(project,'drawings/link.dxf'));
    assert.throws(()=>inspectInputs(project),/symlinks/);
    fs.unlinkSync(path.join(project,'drawings/link.dxf'));
    for(let n=0;n<100;n++)fs.writeFileSync(path.join(project,'drawings',n+'.dxf'),'x');
    assert.throws(()=>inspectInputs(project),/inventory limit/);
    fs.rmSync(path.join(project,'drawings'),{recursive:true});
    const large=fs.openSync(path.join(project,'large.dxf'),'w');fs.ftruncateSync(large,64*1024*1024+1);fs.closeSync(large);
    assert.throws(()=>inspectInputs(project),/inventory limit/);
  } finally {fs.rmSync(project,{recursive:true,force:true});}
});
function chipContext(){
 const native={action:'rtl.simulate',status:'PASS',summary:'Native simulation finished'};
 const report={action:'rtl.simulate',nativeVerification:native,nativeSteps:[{action:'rtl.lint',status:'SUCCESS'},{action:'rtl.simulate',status:'SUCCESS'}]};
 return {result:{executionSucceeded:true,inputUnchanged:true,action:'rtl.simulate',nativeVerification:native},
  artifacts:[{kind:'report.eda.execution'},{kind:'report.simulation'},{kind:'waveform.vcd'},{kind:'log.tool'}],
  action:{inputs:{action:'rtl.simulate'}},
  readArtifact:a=>Buffer.from(a.kind==='report.eda.execution'?JSON.stringify(report):a.kind==='waveform.vcd'?'$var wire 1 ! a $end\n$enddefinitions $end\n#1\n1!':a.kind==='report.simulation'?'EDA_SIMULATION_FINISHED':'')};
}
test('Chip retained PASS fixtures cannot pass cancelled, timed-out, stale or unsuccessful execution',()=>{
  assert.equal(managedRtlVerifier(chipContext()).status,'passed');assert.equal(nativeVerifier(chipContext()).status,'passed');
  for(const change of [r=>r.cancelled=true,r=>r.executionStatus='TIMED_OUT',r=>r.inputUnchanged=false,r=>r.executionSucceeded=false]){
    const context=chipContext();change(context.result);assert.equal(managedRtlVerifier(context).status,'insufficient_evidence');assert.equal(nativeVerifier(context).status,'insufficient_evidence');
  }
});
test('Chip malformed and mismatched native reports never create acceptance',()=>{
  const malformed=chipContext();malformed.readArtifact=()=>Buffer.from('{');assert.equal(nativeVerifier(malformed).status,'insufficient_evidence');
  for (const report of [null,[],{action:'rtl.simulate',nativeVerification:{action:'rtl.simulate',status:'PASS'},nativeSteps:[null]}]) {
    const context=chipContext();context.readArtifact=()=>Buffer.from(JSON.stringify(report));assert.equal(nativeVerifier(context).status,'insufficient_evidence');
  }
  const wrong=chipContext();wrong.action.inputs.action='logic.synthesize';assert.equal(nativeVerifier(wrong).status,'insufficient_evidence');
  const assertion=chipContext();assertion.result.executionSucceeded=false;assertion.readArtifact=a=>Buffer.from(a.kind==='log.tool'?'%Error: Assertion failed':'');assert.equal(managedRtlVerifier(assertion).status,'failed');
});
