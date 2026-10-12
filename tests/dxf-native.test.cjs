const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createDxfPlugin,verify}=require('../packs/freecad/runtime/dxf.cjs');
const {inspectInputs}=require('../packs/freecad/runtime/index.cjs');
const runtimeRoot=process.env.DXF_TEST_HARNESS_ROOT;
const executable=process.env.DXF_TEST_EXECUTABLE;
const enabled=process.platform==='darwin' && process.arch==='arm64' && runtimeRoot && executable;
// Opt-in real acceptance uses the consumer's canonical sandbox/process and file API.
test('private DXF runtime creates, inspects, fails verification, cancels and recovers through canonical Runtime',{skip:!enabled},async()=>{
 const {executeTask}=require(path.join(runtimeRoot,'packages/domain-runtime/src/task-process.cjs'));
 const runtimeFiles=require(path.join(runtimeRoot,'packages/domain-runtime/src/workspace-files.cjs'));
 const projectDir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'dxf-native-acceptance-')));
 const environment={PATH:'/usr/bin:/bin',INDUSTRIAL_HARNESS_DXF_EXECUTABLE:path.resolve(executable)};
 const plugin=createDxfPlugin({environment,runtimeApi:{executeTask,runtimeFiles},inspectInputs});
 let sequence=0;
 const run=async(name,inputs,signal)=>{
  const action={id:'dxf-'+(++sequence),inputs};
  const result=await plugin.tools.find(t=>t.descriptor.id==='cad.dxf.'+name).execute({projectDir,inputs,action,signal});
  const verdict=verify({result,action,artifacts:result.artifacts,readArtifact:a=>fs.readFileSync(path.join(projectDir,a.file))});
  return {result,verdict};
 };
 try {
  const expect={units:'mm',entityCount:1,circles:[{center:[10,20],diameter:6}]};
  const created=await run('create',{file:'plate.dxf',expectedSha256:null,recipe:{units:'mm',entities:[{type:'circle',center:[10,20],radius:3}]},expect});
  assert.equal(created.result.executionSucceeded,true,created.result.artifacts.filter(a=>a.kind==='log.tool').map(a=>fs.readFileSync(path.join(projectDir,a.file),'utf8')).join('\n'));assert.equal(created.verdict.status,'passed');
  assert.equal((await run('inspect',{file:'plate.dxf',expect})).verdict.status,'passed');
  assert.equal((await run('verify',{file:'plate.dxf',expect:{circles:[{center:[10,20],diameter:7}]}})).verdict.status,'failed');
  const before=crypto.createHash('sha256').update(fs.readFileSync(path.join(projectDir,'plate.dxf'))).digest('hex');
  const failure=await run('create',{file:'plate.dxf',expectedSha256:before,recipe:{units:'mm',entities:[{type:'circle',center:[0,0],radius:-1}]},expect});
  assert.equal(failure.result.executionSucceeded,false);assert.equal(failure.verdict.status,'insufficient_evidence');
  const controller=new AbortController();
  const pending=run('verify',{file:'plate.dxf',expect},controller.signal);
  setTimeout(()=>controller.abort(),20);
  const cancelled=await pending;
  assert.equal(cancelled.result.cancelled,true);assert.equal(cancelled.verdict.status,'insufficient_evidence');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(projectDir,'plate.dxf'))).digest('hex'),before);
  assert.equal((await run('verify',{file:'plate.dxf',expect})).verdict.status,'passed');
 } finally {fs.rmSync(projectDir,{recursive:true,force:true});}
});
