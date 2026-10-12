const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const VERSION = '1.0.0';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const definitions = ['create', 'inspect', 'verify'].map(operation => ({
  id: `cad.dxf.${operation}`, name: `dxf_${operation}`,
  risk: operation === 'inspect' ? 'read-only' : 'mutating',
  summary: operation === 'create' ? 'Create or hash-checked replace a millimetre DXF drawing from lines, circles, polylines and text.' : operation === 'inspect' ? 'Read actual DXF entities, units and audit findings.' : 'Check actual DXF geometry against explicit user expectations.',
  verification: operation === 'inspect' ? [] : ['cad.dxf.geometry.v1'],
}));
const capability = {
  id: 'cad.dxf.design', domain: 'cad', title: '2D DXF drawing', stages: [], priority: 110,
  keywords: ['dxf', '2d', 'drawing', '制图', '图纸', '二维'],
  skills: [{ id: 'cad.ezdxf.author', summary: 'Create, inspect and verify drawings with managed DXF tools.' }],
  tools: definitions, verification: ['cad.dxf.geometry.v1'],
};
function reportIsValid(report) {
  if (!report || report.schemaVersion !== 1 || report.engine !== 'ezdxf' || typeof report.engineVersion !== 'string' ||
      !/^[a-f0-9]{64}$/.test(report.sourceSha256 || '') || !Number.isInteger(report.units) ||
      !Number.isInteger(report.entityCount) || report.entityCount < 0 || report.entityCount > 2000 ||
      !Array.isArray(report.entities) || report.entities.length !== report.entityCount ||
      !Number.isInteger(report.auditErrors) || report.auditErrors < 0 ||
      !Number.isInteger(report.auditFixes) || report.auditFixes < 0 || !report.counts || typeof report.counts !== 'object' || Array.isArray(report.counts)) return false;
  const counts = {};
  for (const row of report.entities) {
    if (!row || !/^[A-Z][A-Z0-9_]{0,31}$/.test(row.type || '') || typeof row.layer !== 'string') return false;
    counts[row.type] = (counts[row.type] || 0) + 1;
    if (row.type === 'CIRCLE' && (!Array.isArray(row.center) || row.center.length !== 2 || !row.center.every(Number.isFinite) ||
        !Number.isFinite(row.radius) || row.radius <= 0 || !Number.isFinite(row.centerZ) ||
        !Array.isArray(row.extrusion) || row.extrusion.length !== 3 || !row.extrusion.every(Number.isFinite))) return false;
  }
  return Object.keys(report.counts).length === Object.keys(counts).length && Object.entries(counts).every(([key,value]) => report.counts[key] === value);
}
function verify({ result, artifacts, readArtifact, action }) {
  const report = artifacts.find(item => item.kind === 'report.cad.dxf');
  if (!result.executionSucceeded || result.inputUnchanged === false || result.cancelled || !report) return { status: 'insufficient_evidence', reason: 'DXF native readback did not complete.', metrics: {} };
  let observed, bytes;
  try { bytes = readArtifact(report); observed = JSON.parse(bytes); } catch { return {status:'insufficient_evidence',reason:'DXF readback report is malformed.',metrics:{}}; }
  if (!reportIsValid(observed) || observed.sourceSha256 !== result.readbackInputSha256 || hash(bytes) !== result.readbackReportSha256)
    return {status:'insufficient_evidence',reason:'DXF readback schema or source/report identity is missing or changed.',metrics:{}};
  const expect = action.inputs.expect;
  if (!expect || !Object.keys(expect).length) return { status: 'not_run', reason: 'DXF was read back; supply explicit units, counts or geometric expectations for verification.', metrics: { entityCount: observed.entityCount } };
  const checks = { audit: observed.auditErrors === 0 && observed.auditFixes === 0 };
  if (expect.units !== undefined) checks.units = expect.units === 'mm' && observed.units === 4;
  if (expect.entityCount !== undefined) checks.entityCount = observed.entityCount === expect.entityCount;
  for (const [type, count] of Object.entries(expect.counts || {})) checks['count:' + type] = (observed.counts[type] || 0) === count;
  const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) <= (expect.tolerance ?? 0.001);
  const consumed = new Set();
  for (const [index, circle] of (expect.circles || []).entries()) {
    const found = observed.entities.findIndex((row, n) => !consumed.has(n) && row.type === 'CIRCLE' &&
      (!circle.layer || row.layer === circle.layer) && near(row.centerZ, 0) && Math.abs(row.extrusion[0]) <= 1e-9 && Math.abs(row.extrusion[1]) <= 1e-9 && Math.abs(row.extrusion[2] - 1) <= 1e-9 && near(row.radius * 2, circle.diameter) && row.center.every((v, i) => near(v, circle.center[i])));
    checks['circle:' + index] = found >= 0;
    if (found >= 0) consumed.add(found);
  }
  const passed = Object.values(checks).every(Boolean);
  return { status: passed ? 'passed' : 'failed', reason: passed ? 'Saved DXF audit and all supplied geometric expectations passed. Readback uses ezdxf; no independent CAD engine or manufacturing qualification is claimed.' : 'DXF checks failed: ' + Object.keys(checks).filter(k => !checks[k]).join(', '), metrics: checks };
}
function validate(inputs, operation) {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs) || Object.keys(inputs).some(k => !['file', 'expectedSha256', 'recipe', 'expect'].includes(k))) throw Error('Invalid DXF input fields.');
  if (typeof inputs.file !== 'string' || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.dxf$/i.test(inputs.file) || inputs.file.split('/').some(p => p === '..' || p === '.')) throw Error('Use a bounded project-relative .dxf path.');
  if (inputs.file.split('/').some(part => part.startsWith('.') || ['node_modules','__pycache__','cad-output','runtime-identity'].includes(part)))
    throw Error('DXF sources must use ordinary visible project paths outside dependency and runtime/evidence storage.');
  if (inputs.file.split('/').length > 13) throw Error('DXF sources support at most 12 directory levels.');
  if (operation === 'create' && (inputs.expectedSha256 !== null && !/^[a-f0-9]{64}$/.test(inputs.expectedSha256 || ''))) throw Error('Supply expectedSha256:null for a new drawing, or the current SHA-256 before replacement.');
  if (operation !== 'create' && (inputs.recipe !== undefined || inputs.expectedSha256 !== undefined)) throw Error('Inspection and verification accept file and expect only.');
  if (operation === 'create' && (!inputs.recipe || JSON.stringify(inputs.recipe).length > 512 * 1024)) throw Error('Supply a bounded drawing recipe.');
  const e = inputs.expect;
  if (operation === 'verify' && (!e || !Object.keys(e).length)) throw Error('Verification requires explicit expectations.');
  if (!e) return;
  if (typeof e !== 'object' || Array.isArray(e) || Object.keys(e).some(k => !['units', 'entityCount', 'counts', 'circles', 'tolerance'].includes(k))) throw Error('Unknown DXF expectations.');
  if (e.units !== undefined && e.units !== 'mm') throw Error('Expected units must be mm.');
  if (e.entityCount !== undefined && (!Number.isInteger(e.entityCount) || e.entityCount < 0 || e.entityCount > 2000)) throw Error('Invalid entity count.');
  if (e.tolerance !== undefined && (!Number.isFinite(e.tolerance) || e.tolerance <= 0 || e.tolerance > 1)) throw Error('Tolerance must be in (0,1] mm.');
  if (e.counts !== undefined && (!e.counts || typeof e.counts !== 'object' || Array.isArray(e.counts) || Object.entries(e.counts).some(([k,v]) => !/^[A-Z][A-Z0-9_]{0,31}$/.test(k) || !Number.isInteger(v) || v < 0 || v > 2000))) throw Error('Invalid expected entity counts.');
  if (e.circles !== undefined && (!Array.isArray(e.circles) || e.circles.length > 2000 || e.circles.some(c => !c || Object.keys(c).some(k => !['center','diameter','layer'].includes(k)) || !Array.isArray(c.center) || c.center.length !== 2 || c.center.some(v => !Number.isFinite(v)) || !Number.isFinite(c.diameter) || c.diameter <= 0 || (c.layer !== undefined && typeof c.layer !== 'string')))) throw Error('Invalid expected circles.');
  if (e.units === undefined && e.entityCount === undefined && !Object.keys(e.counts || {}).length && !e.circles?.length) throw Error('Supply at least one measurable DXF expectation.');
}
function createDxfPlugin({ environment, runtimeApi, inspectInputs }) {
  return { capabilities: [capability], verifiers: { 'cad.dxf.geometry.v1': verify },
    tools: definitions.map(definition => ({
      descriptor: { schemaVersion: '1', id: definition.id, version: VERSION, risk: definition.risk, verification: definition.verification, ...(definition.name === 'dxf_create' ? { effect: 'inputs' } : {}) },
      guide: { description: definition.summary, inputs: { file: 'project-relative drawing.dxf', ...(definition.name === 'dxf_create' ? { expectedSha256: 'null for new file, current SHA-256 to replace', recipe: { units: 'mm', entities: '1–2000 {type:line,start:[x,y],end:[x,y],layer?} | {type:circle,center:[x,y],radius,layer?} | {type:polyline,points:[[x,y],...],closed?,layer?} | {type:text,text,position:[x,y],height?,layer?}' } } : {}), expect: 'Optional for create/inspect, required for verify: {units:"mm",entityCount,counts:{CIRCLE:2},circles:[{center:[x,y],diameter,layer?}],tolerance:0.001}' } },
      execute: async ({ projectDir, inputs, action, signal }) => {
        const operation = definition.name.slice(4); validate(inputs, operation);
        if (!runtimeApi?.executeTask || !runtimeApi?.runtimeFiles) throw Error('Managed DXF tools require the trusted Harness Runtime.');
        const image = environment.INDUSTRIAL_HARNESS_DXF_IMAGE;
        if (!image || !/@sha256:[a-f0-9]{64}$/.test(image)) throw Error('DXF runtime is not prepared. Repair CAD in Settings → Domains.');
        const api = runtimeApi.runtimeFiles;
        const source = api.projectFile(projectDir, inputs.file);
        const exists = fs.existsSync(source);
        const before = exists ? hash(api.readBytes(source, 16 * 1024 * 1024)) : null;
        if (typeof inspectInputs !== 'function') throw Error('Managed DXF requires the CAD source inventory.');
        const sourceHashes = inspectInputs(projectDir).inputHashes;
        if (exists && sourceHashes[inputs.file] !== before) throw Error('DXF source is outside the current CAD input inventory or changed during inspection.');
        if (operation === 'create' && before !== inputs.expectedSha256) throw Error('Drawing changed; refresh its SHA-256 before replacement.');
        const directory = api.runDirectory(projectDir, action.id), input = path.join(directory, 'input'), work = path.join(directory, 'work');
        fs.mkdirSync(input); fs.mkdirSync(work);
        if (operation !== 'create') fs.writeFileSync(path.join(input, 'source.dxf'), api.readBytes(source, 16 * 1024 * 1024));
        fs.writeFileSync(path.join(input, 'request.json'), JSON.stringify({ operation, ...(operation === 'create' ? { recipe: inputs.recipe } : { source: '/inputs/source.dxf' }) }));
        const executed = await runtimeApi.executeTask({ command: ['python3', '/opt/cad/dxf-native.py', '{input}/request.json', '{output}'], timeoutMs: 60000, runtime: { kind: 'docker', image, cpus: 1, memoryMb: 512, pids: 64 } }, { directory, input, work, actionId: action.id, environment, signal });
        fs.writeFileSync(path.join(work, 'tool.log'), executed.log || '');
        let succeeded = executed.status === 'COMPLETED' && !signal?.aborted;
        let readbackInputSha256, readbackReportSha256;
        if (succeeded) {
          const reportBytes = api.readBytes(path.join(work, 'readback.json'), 16 * 1024 * 1024);
          const observed = JSON.parse(reportBytes);
          const drawing = operation === 'create' ? api.readBytes(path.join(work, 'drawing.dxf'), 16 * 1024 * 1024) : null;
          readbackInputSha256 = drawing ? hash(drawing) : before;
          readbackReportSha256 = hash(reportBytes);
          if (!reportIsValid(observed) || observed.sourceSha256 !== readbackInputSha256) throw Error('DXF native readback is malformed or does not describe the saved input.');
          if (operation === 'create') {
            const files = Object.keys(inspectInputs(projectDir).inputHashes);
            const priorBytes = files.reduce((size, name) => size + fs.statSync(api.projectFile(projectDir, name)).size, 0);
            const nextBytes = priorBytes - (exists ? fs.statSync(source).size : 0) + drawing.length;
            if (files.length + (exists ? 0 : 1) > 100 || nextBytes > 64 * 1024 * 1024)
              throw Error('Saved drawing would exceed the CAD source inventory budget.');
            api.applyFiles(projectDir, [{ path: inputs.file, expectedSha256: before, content: drawing.toString('utf8') }]);
            if (inspectInputs(projectDir).inputHashes[inputs.file] !== readbackInputSha256)
              throw Error('Saved DXF is not bound to the current CAD source inventory.');
          }
        }
        if (operation !== 'create' && hash(api.readBytes(source, 16 * 1024 * 1024)) !== before) succeeded = false;
        const artifacts = Object.entries({ 'readback.json':'report.cad.dxf', 'drawing.dxf':'model.cad.dxf', 'tool.log':'log.tool' }).filter(([name]) => fs.lstatSync(path.join(work,name),{throwIfNoEntry:false})?.isFile()).map(([name,kind]) => {const file=path.join(work,name),stat=fs.lstatSync(file);if(stat.isSymbolicLink()||stat.nlink!==1||stat.size>16*1024*1024)throw Error('Unsafe DXF output.');return {localId:name,file:path.relative(projectDir,file).split(path.sep).join('/'),kind,sha256:hash(api.readBytes(file,16*1024*1024))};});
        return { executionSucceeded: succeeded, inputUnchanged: operation === 'create' ? undefined : succeeded, cancelled: Boolean(signal?.aborted), readbackInputSha256, readbackReportSha256, artifacts, diagnostics: [succeeded ? 'DXF native operation and saved-file readback completed.' : 'DXF operation did not complete; inspect tool.log.'], toolVersion: VERSION };
      },
    })),
  };
}
module.exports = { createDxfPlugin, definitions, capability, validate, verify, reportIsValid };
