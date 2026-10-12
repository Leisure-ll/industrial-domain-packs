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
