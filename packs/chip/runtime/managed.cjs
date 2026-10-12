const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifier: rtlVerifier } = require('./verifier.cjs');
const VERSION = '0.7.0';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const ignored = ['.eda', '.harness-runs', '.git', '.venv', 'node_modules', '__pycache__'];
const definitions = [
  { id:'chip.rtl.verify', name:'rtl_verify', operation:'execute', action:'rtl.simulate', risk:'mutating', verification:['chip.rtl.assertions'], summary:'Run real RTL simulation and assertion checks in the managed EDA environment.' },
  { id:'chip.environment.check', name:'environment_check', operation:'environment', risk:'read-only', verification:[], summary:'Inspect the managed EDA tool environment for a project action.' },
  { id:'chip.project.describe', name:'project_describe', operation:'inspect', risk:'read-only', verification:[], summary:'Read supported structured EDA operations, parameter schemas and project actions.' },
  { id:'chip.eda.execute', name:'eda_execute', operation:'execute', risk:'mutating', verification:['chip.eda.native.v1'], summary:'Run a declared structured EDA action and its dependencies; preserve native reports and their actual verdict.' },
];
function sources(projectDir, api) {
  const result = {}; let count = 0, size = 0;
  function visit(relative, depth) {
    if (depth > 24) throw Error('Chip project depth limit exceeded.');
    for (const name of fs.readdirSync(path.join(projectDir,relative)).sort()) {
      if (ignored.includes(name)) continue;
      if (++count > 10000) throw Error('Chip project file limit exceeded.');
      const rel = relative ? relative + '/' + name : name;
      if (!relative && name === 'runtime-identity') throw Error('runtime-identity is reserved for the EDA execution identity.');
      const file = path.join(projectDir, rel), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw Error('Chip inputs cannot contain symlinks.');
      if (stat.isDirectory()) visit(rel, depth+1);
      else {
        api.projectFile(projectDir, rel);
        if ((size += stat.size) > 128 * 1024 * 1024) throw Error('Chip input size limit exceeded.');
        result[rel] = hash(api.readBytes(file, 16 * 1024 * 1024));
      }
    }
  }
  visit('',0); return result;
}
const incomplete = reason => ({status:'insufficient_evidence',reason,metrics:{}});
function readableNativeEvidence(result) {
  return result.inputUnchanged !== false && !result.cancelled && !['CANCELLED','TIMED_OUT'].includes(result.executionStatus);
}
function nativeVerifier({result,artifacts,readArtifact,action}) {
  if (!readableNativeEvidence(result)) return incomplete('EDA execution was cancelled, timed out or its inputs changed.');
  const artifact = artifacts.find(a => a.kind === 'report.eda.execution');
  if (!artifact) return incomplete('Native EDA report is missing.');
  let report;
  try { report = JSON.parse(readArtifact(artifact)); } catch { return incomplete('Native EDA report is malformed.'); }
  if (!report || typeof report !== 'object' || Array.isArray(report)) return incomplete('Native EDA report is malformed.');
  const native = report.nativeVerification, target = action?.inputs?.action || report.action;
  if (!native || !['PASS','FAIL','UNKNOWN'].includes(native.status) ||
      typeof report.action !== 'string' || report.action !== target || result.action !== target || native.action !== target ||
      !Array.isArray(report.nativeSteps) || !report.nativeSteps.length ||
      report.nativeSteps.some(step => !step || typeof step.action !== 'string' || !['SUCCESS','FAILED','CANCELLED'].includes(step.status)) ||
      !report.nativeSteps.some(step => step.action === target))
    return incomplete('This action has no complete native verification evidence.');
  const passed = result.executionSucceeded === true && native.status === 'PASS' && report.nativeSteps.every(step => step.status === 'SUCCESS');
  return {status:passed?'passed':native.status==='FAIL'?'failed':'insufficient_evidence',reason:native.summary || 'Native evidence did not establish acceptance.',metrics:{stepCount:report.nativeSteps.length}};
}
function managedRtlVerifier(context) {
  if (!readableNativeEvidence(context.result)) return incomplete('RTL execution was cancelled, timed out or its inputs changed.');
  const verdict = rtlVerifier(context);
  if (verdict.status === 'passed' && context.result.nativeVerification?.action !== 'rtl.simulate') return incomplete('RTL evidence does not identify the requested simulation action.');
  return verdict.status === 'passed' && context.result.executionSucceeded !== true
    ? incomplete('RTL evidence exists but the protected execution did not complete successfully.') : verdict;
}
function createManagedPlugin({environment,runtimeApi}) {
  const api = runtimeApi?.runtimeFiles;
  const requireApi = () => { if (!api || !runtimeApi.executeTask) throw Error('Managed EDA requires the trusted Harness Runtime.'); };
  return {
    matchesProject: projectDir => fs.existsSync(path.join(projectDir,'eda.yaml')),
    workspaceInputs: {ignore:['.eda']},
    workspaceProtectedPaths: projectDir => [path.join(projectDir,'.eda')],
    stateProvider: ({projectDir}) => { requireApi(); const inputHashes=sources(projectDir,api); inputHashes['runtime-identity/chip-managed']=hash(JSON.stringify({image:environment.INDUSTRIAL_HARNESS_EDA_IMAGE,files:['managed.cjs','managed-native.py','verifier.cjs'].map(name=>[name,hash(fs.readFileSync(path.join(__dirname,name)))])})); return {stage:Object.keys(inputHashes).some(p=>/\.(sv|v)$/i.test(p))?'rtl':null,inputHashes}; },
    tools:definitions.map(tool=>({
      descriptor:{schemaVersion:'1',id:tool.id,version:VERSION,risk:tool.risk,verification:tool.verification},
      guide:{description:tool.summary,inputs:tool.id==='chip.rtl.verify'?{}:{action:'Optional declared canonical action, e.g. rtl.lint, rtl.simulate or logic.synthesize. chip.eda.execute requires action. No command, image or script overrides.'}},
      execute:async({projectDir,inputs,action,signal})=>{
        requireApi();
        if (!inputs || typeof inputs!=='object' || Array.isArray(inputs) || Object.keys(inputs).some(k=>k!=='action') || (tool.id==='chip.rtl.verify'&&Object.keys(inputs).length)) throw Error('Only a declared action selector is accepted.');
        const target=tool.action || inputs.action || 'rtl.simulate';
        if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(target) || (tool.id==='chip.eda.execute'&&!inputs.action)) throw Error('Select a declared canonical EDA action.');
        const image=environment.INDUSTRIAL_HARNESS_EDA_IMAGE;
        if (!image || !/@sha256:[a-f0-9]{64}$/.test(image)) throw Error('EDA runtime is not prepared. Repair Chip in Settings → Domains.');
        const hashes=sources(projectDir,api), directory=api.runDirectory(projectDir,action.id), input=path.join(directory,'input'),work=path.join(directory,'work');
        fs.mkdirSync(input);fs.mkdirSync(work);
        for(const [name,digest] of Object.entries(hashes)) { const bytes=api.readBytes(api.projectFile(projectDir,name),16*1024*1024); if(hash(bytes)!==digest)throw Error('Chip input changed during snapshot.'); const dest=path.join(input,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes,{mode:0o444}); }
        const execution=await runtimeApi.executeTask({command:['/opt/chip-python/bin/python3','-I','/opt/domain-packs/packs/chip/runtime/managed-native.py','{input}','{output}',tool.operation,target],timeoutMs:600000,runtime:{kind:'docker',image,cpus:2,memoryMb:4096,pids:256}},{directory,input,work,actionId:action.id,environment,signal});
        fs.writeFileSync(path.join(work,'managed.log'),execution.log || '');
        const file=path.join(work,'result.json');
        const result=fs.existsSync(file)?JSON.parse(api.readBytes(file,1024*1024)):{executionSucceeded:false,artifacts:[],diagnostics:['Managed EDA operation did not complete.']};
        const specs=[...(result.artifacts||[]),{file:'managed.log',kind:'log.tool'},...(fs.existsSync(file)?[{file:'result.json',kind:'report.eda.execution'}]:[])];
        if(specs.length>130)throw Error('Native artifact limit exceeded.');
        const artifacts=specs.map(item=>{if(!/^[A-Za-z0-9_.-]+$/.test(item.file)||item.file==='..')throw Error('Invalid EDA artifact path.'); const file=path.join(work,item.file),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>16*1024*1024)throw Error('Invalid EDA artifact file.');if(item.sha256&&hash(fs.readFileSync(file))!==item.sha256)throw Error('EDA artifact digest mismatch.');return {localId:item.file,file:path.relative(projectDir,file).split(path.sep).join('/'),kind:item.kind};});
        const sameInputs=JSON.stringify(sources(projectDir,api))===JSON.stringify(hashes);
        return {...result,executionSucceeded:execution.status==='COMPLETED'&&result.executionSucceeded===true&&!signal?.aborted&&sameInputs,inputUnchanged:sameInputs,executionStatus:execution.status,cancelled:Boolean(signal?.aborted),artifacts,toolVersion:VERSION,diagnostics:[...(result.diagnostics||[]),...(result.environment?[JSON.stringify(result.environment)]:[]),...(result.capabilities?[JSON.stringify({capabilities:result.capabilities,actions:result.actions})]:[])]};
      },
    })),
    verifiers:{'chip.rtl.assertions':managedRtlVerifier,'chip.eda.native.v1':nativeVerifier},
    capabilities:[{id:'chip.eda.managed',title:'Chip design and verification',domain:'chip',stages:[],priority:110,keywords:['chip','rtl','synthesis','verification','芯片','仿真','综合'],skills:[{id:'chip.eda.operate',summary:'Managed EDA tools, structured project actions and native verification.'}],tools:definitions,verification:['chip.eda.native.v1']}],
  };
}
module.exports={createManagedPlugin,definitions,nativeVerifier,managedRtlVerifier,sources};
